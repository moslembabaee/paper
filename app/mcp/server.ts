import { once } from 'node:events'
import type { Readable, Writable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { MAX_IMPORT_BYTES } from '../src/io/project.ts'
import { paperTools, projectSchema, validateSchema } from '../src/mcp/schema.ts'
import { motionControls, shaderCatalog } from '../src/shaders/catalog.ts'
import type { PaperFiles } from './files.ts'

export const SERVER_VERSION = '0.1.0'
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const
type RpcId = string | number
export interface RpcResponse { jsonrpc: '2.0'; id: RpcId | null; result?: unknown; error?: { code: number; message: string } }
class RpcError extends Error {
  readonly code: number
  constructor(code: number, message: string) { super(message); this.code = code }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const resources = [
  { uri: 'paper://schema', name: 'Paper project schema', description: 'Version 1 Paper project and scene element JSON Schema.', mimeType: 'application/schema+json' },
  { uri: 'paper://shaders', name: 'Paper shader catalog', description: 'Native shader kinds, default parameters, numeric bounds, and animation controls.', mimeType: 'application/json' },
]

/** Minimal MCP compatibility transport. No sockets, telemetry or runtime packages. */
export class PaperMcpServer {
  private state: 'new' | 'initializing' | 'ready' = 'new'
  private readonly files: PaperFiles
  constructor(files: PaperFiles) { this.files = files }

  async handle(message: unknown): Promise<RpcResponse | undefined> {
    if (!record(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || (Object.hasOwn(message, 'id') && typeof message.id !== 'string' && (typeof message.id !== 'number' || !Number.isFinite(message.id)))) {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid JSON-RPC request' } }
    }
    const id = message.id as RpcId | undefined
    // Notifications never elicit a response and cannot invoke mutating requests.
    if (id === undefined) {
      if (message.method === 'notifications/initialized' && this.state === 'initializing') this.state = 'ready'
      return
    }
    try {
      if (message.params !== undefined && !record(message.params)) throw new RpcError(-32602, 'params must be an object')
      const result = await this.dispatch(message.method, message.params as Record<string, unknown> | undefined ?? {})
      return { jsonrpc: '2.0', id, result }
    } catch (error) {
      return { jsonrpc: '2.0', id, error: { code: error instanceof RpcError ? error.code : -32603, message: error instanceof Error ? error.message : 'Internal error' } }
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method === 'ping') return {}
    if (method === 'initialize') {
      if (this.state !== 'new') throw new RpcError(-32600, 'Already initialized')
      if (typeof params.protocolVersion !== 'string' || !record(params.capabilities) || !record(params.clientInfo) || typeof params.clientInfo.name !== 'string' || typeof params.clientInfo.version !== 'string') throw new RpcError(-32602, 'Invalid initialization parameters')
      this.state = 'initializing'
      return {
        protocolVersion: PROTOCOL_VERSIONS.find(version => version === params.protocolVersion) ?? PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
        serverInfo: { name: 'paper', version: SERVER_VERSION },
        instructions: 'Paper edits portable .paper.json files inside the configured workspace. Read get_canvas_elements before editing and pass expected_revision to avoid stale writes. Coordinates are relative to the parent frame; the grid is 120px. Read paper://schema and paper://shaders for the design contract. Save in the browser before using an agent; reopen the JSON file to see its changes. SVG shaders need browser snapshots; JSON preserves the native shader paint.',
      }
    }
    if (this.state !== 'ready') throw new RpcError(-32002, 'Initialize and send notifications/initialized before using Paper')
    if (method === 'tools/list') {
      if (params.cursor !== undefined) throw new RpcError(-32602, 'Paper does not use pagination cursors')
      return { tools: paperTools }
    }
    if (method === 'tools/call') {
      const tool = paperTools.find(candidate => candidate.name === params.name)
      if (!tool) throw new RpcError(-32602, 'Unknown Paper tool')
      const args = params.arguments ?? {}
      try {
        validateSchema(args, tool.inputSchema)
        const result = await this.files.call(tool.name, args as Record<string, unknown>)
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false }
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Paper tool failed' }], isError: true }
      }
    }
    if (method === 'resources/list') {
      if (params.cursor !== undefined) throw new RpcError(-32602, 'Paper does not use pagination cursors')
      return { resources }
    }
    if (method === 'resources/templates/list') return { resourceTemplates: [] }
    if (method === 'resources/read') {
      const resource = resources.find(candidate => candidate.uri === params.uri)
      if (!resource) throw new RpcError(-32002, 'Unknown Paper resource')
      const value = resource.uri === 'paper://schema' ? projectSchema : { shaders: shaderCatalog, motionControls, defaultMotion: { animated: true, speed: .35, frame: 12000, scale: 1, rotation: 0, offsetX: 0, offsetY: 0 } }
      return { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: JSON.stringify(value, null, 2) }] }
    }
    throw new RpcError(-32601, `Method not found: ${method}`)
  }
}

/** Newline-delimited UTF-8 JSON-RPC with ordered edits and stdout backpressure. */
export async function serveStdio(server: PaperMcpServer, input: Readable, output: Writable): Promise<void> {
  const write = async (response: RpcResponse) => {
    if (!output.write(`${JSON.stringify(response)}\n`)) await once(output, 'drain')
  }
  const processLine = async (line: string) => {
    if (!line.trim()) return
    let message: unknown
    try { message = JSON.parse(line) }
    catch { await write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); return }
    const response = await server.handle(message)
    if (response) await write(response)
  }
  const decoder = new StringDecoder('utf8')
  let pending = ''
  for await (const chunk of input) {
    const decoded = decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const parts = decoded.split('\n')
    for (let i = 0; i < parts.length; i++) {
      pending += parts[i]
      if (Buffer.byteLength(pending) > MAX_IMPORT_BYTES) {
        await write({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'MCP message exceeds 16 MB' } })
        return
      }
      if (i < parts.length - 1) { await processLine(pending); pending = '' }
    }
  }
  pending += decoder.end()
  if (pending.trim()) await processLine(pending)
}
