import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { Auth } from './auth.ts'
import { Storage, httpError, safeId } from './storage.ts'
import { basicInfo, exportCanvas, mutateCanvas, readCanvas } from '../src/mcp/operations.ts'
import { paperTools, validateSchema } from '../src/mcp/schema.ts'
import { createProject } from '../src/io/project.ts'
import { SceneStore } from '../src/scene/store.ts'
import type { CloudProject } from '../src/cloud/model.ts'

export interface ServiceConfig {
  root: string
  secret: string
  origin: string
  google?: { clientId: string; clientSecret: string }
  github?: { clientId: string; clientSecret: string }
  fetch?: typeof fetch
}
function cookies(req: IncomingMessage) {
  return Object.fromEntries((req.headers.cookie ?? '').split(';').map(v => v.trim().split('=')))
}
async function body(req: IncomingMessage, parsed?: unknown): Promise<Record<string, unknown>> {
  let value = parsed
  if (value === undefined) {
    const chunks: Buffer[] = []; let size = 0
    for await (const chunk of req) { size += chunk.length; if (size > 17 * 1024 * 1024) throw httpError(413, 'Project too large'); chunks.push(chunk) }
    try { value = JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { throw httpError(400, 'Invalid JSON') }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'Expected an object')
  return value as Record<string, unknown>
}
function json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)) }
export async function createService(config: ServiceConfig) {
  const origin = new URL(config.origin).origin
  const auth = new Auth(config.root, config.secret)
  await auth.initialize(config.root)
  const storage = new Storage(config.root)
  const requestFetch = config.fetch ?? fetch
  const streams = new Map<string, Set<ServerResponse>>()
  const attempts = new Map<string, { provider: string; verifier: string; expires: number }>()
  const rates = new Map<string, { count: number; until: number }>()
  const emit = (user: string, record: CloudProject) => {
    for (const stream of streams.get(user) ?? []) stream.write(`event: project\ndata: ${JSON.stringify({ id: record.id, revision: record.revision })}\n\n`)
  }
  function cookie(name: string, value: string, maxAge: number) { return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith('https:') ? '; Secure' : ''}` }
  async function providerJSON(url: string, init?: RequestInit) {
    const response = await requestFetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw httpError(502, 'Identity provider unavailable')
    return response.json() as Promise<Record<string, unknown>>
  }
  const handler = async (req: IncomingMessage, res: ServerResponse, parsed?: unknown) => {
    try {
      const url = new URL(req.url ?? '/', origin)
      const path = url.pathname
      // Origins are checked before all routing, including remote MCP, to prevent DNS rebinding/CSRF.
      if (req.headers.origin && req.headers.origin !== origin) throw httpError(403, 'Origin rejected')
      if (path === '/healthz') { json(res, 200, { ok: true }); return }
      const rateKey = req.socket.remoteAddress ?? 'unknown'
      const now = Date.now()
      if (rates.size > 10000) for (const [key, rate] of rates) if (rate.until < now) rates.delete(key)
      const rate = rates.get(rateKey)
      if (!rate || rate.until < now) rates.set(rateKey, { count: 1, until: now + 60_000 })
      else if (++rate.count > 600) throw httpError(429, 'Too many requests')
      const sessionCookie = cookies(req).paper_session
      const user = auth.session(sessionCookie)
      if (path === '/api/auth/session' && req.method === 'GET') {
        json(res, 200, { user: user ? auth.profile(user) : null, providers: { google: !!config.google, github: !!config.github } }); return
      }
      const login = path.match(/^\/api\/auth\/(google|github)$/)
      if (login && req.method === 'GET') {
        const provider = login[1] as 'google' | 'github'
        const settings = config[provider]
        if (!settings) throw httpError(503, 'This sign-in provider is not configured')
        for (const [state, attempt] of attempts) if (attempt.expires < now) attempts.delete(state)
        if (attempts.size >= 1000) throw httpError(429, 'Please try signing in later')
        const state = randomBytes(32).toString('base64url')
        const verifier = randomBytes(32).toString('base64url')
        attempts.set(state, { provider, verifier, expires: now + 600_000 })
        const target = new URL(provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://github.com/login/oauth/authorize')
        target.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: `${origin}/api/auth/${provider}/callback`, state, response_type: 'code', scope: provider === 'google' ? 'openid email profile' : 'read:user user:email', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString()
        res.writeHead(302, { Location: target.toString(), 'Set-Cookie': cookie('paper_oauth', state, 600), 'Cache-Control': 'no-store' }); res.end(); return
      }
      const callback = path.match(/^\/api\/auth\/(google|github)\/callback$/)
      if (callback && req.method === 'GET') {
        const provider = callback[1] as 'google' | 'github'
        const state = url.searchParams.get('state') ?? ''
        const attempt = attempts.get(state)
        attempts.delete(state)
        if (!attempt || attempt.expires < now || attempt.provider !== provider || cookies(req).paper_oauth !== state) throw httpError(400, 'Sign-in expired or invalid. Please try again.')
        const code = url.searchParams.get('code')
        if (!code || !config[provider]) throw httpError(400, 'Sign-in cancelled')
        const settings = config[provider]!
        const token = await providerJSON(provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: settings.clientId, client_secret: settings.clientSecret, redirect_uri: `${origin}/api/auth/${provider}/callback`, grant_type: 'authorization_code', code_verifier: attempt.verifier }).toString() })
        if (typeof token.access_token !== 'string') throw httpError(400, 'Sign-in was rejected')
        const headers = { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json', 'User-Agent': 'Paper' }
        const identity = await providerJSON(provider === 'google' ? 'https://openidconnect.googleapis.com/v1/userinfo' : 'https://api.github.com/user', { headers })
        let email = typeof identity.email === 'string' ? identity.email : ''
        if (provider === 'github') {
          const response = await requestFetch('https://api.github.com/user/emails', { headers, signal: AbortSignal.timeout(10000) })
          if (!response.ok) throw httpError(502, 'Could not verify account email')
          const emails = await response.json() as { email: string; primary: boolean; verified: boolean }[]
          email = (emails.find(e => e.verified && e.primary) ?? emails.find(e => e.verified))?.email ?? ''
        } else if (identity.email_verified !== true) throw httpError(403, 'Verify your Google email before signing in')
        const sub = provider === 'google' ? identity.sub : identity.id
        if (!sub || !email) throw httpError(403, 'A verified account email is required')
        const loggedIn = await auth.login(provider, { sub: String(sub), email, name: String(identity.name ?? identity.login ?? email), avatar: String(identity.picture ?? identity.avatar_url ?? '') })
        res.writeHead(302, { Location: '/', 'Set-Cookie': [cookie('paper_session', loggedIn.session, 30 * 86400), cookie('paper_oauth', '', 0)], 'Cache-Control': 'no-store' }); res.end(); return
      }
      if (path === '/mcp') {
        const match = req.headers.authorization?.match(/^Bearer (paper_[A-Za-z0-9_-]{43})$/)
        const agent = auth.bearer(match?.[1])
        if (!agent) { res.setHeader('WWW-Authenticate', 'Bearer realm="Paper"'); throw httpError(401, 'Invalid MCP token') }
        const protocol = req.headers['mcp-protocol-version']
        if (protocol && !['2025-03-26', '2025-06-18', '2025-11-25'].includes(String(protocol))) throw httpError(400, 'Unsupported MCP protocol version')
        if (req.method !== 'POST') { json(res, 405, { error: 'Use Streamable HTTP POST' }); return }
        if (!req.headers.accept?.includes('application/json') || !req.headers.accept?.includes('text/event-stream')) throw httpError(406, 'Accept application/json and text/event-stream')
        const rpc = await body(req, parsed)
        if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string' || (rpc.params !== undefined && (!rpc.params || typeof rpc.params !== 'object' || Array.isArray(rpc.params)))) { json(res, 400, { jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32600, message: 'Invalid request' } }); return }
        if (rpc.id === undefined) { res.writeHead(202); res.end(); return }
        const params = (rpc.params ?? {}) as Record<string, unknown>
        let result: unknown
        if (rpc.method === 'initialize') result = { protocolVersion: ['2025-11-25', '2025-06-18', '2025-03-26'].includes(String(params.protocolVersion)) ? params.protocolVersion : '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'paper-cloud', version: '1.0.0' }, instructions: 'Call list_projects, then pass project_id to each tool. Edits work with the browser closed. Pass expected_revision to guard against stale edits.' }
        else if (rpc.method === 'ping') result = {}
        else if (rpc.method === 'tools/list') result = { tools: [
          { name: 'list_projects', description: 'List projects in your account.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
          ...paperTools.map(tool => {
            const properties = { ...tool.inputSchema.properties }; delete properties.file; delete properties.output
            return { ...tool, inputSchema: { ...tool.inputSchema, properties: { ...properties, project_id: { type: 'string', description: 'Project ID from list_projects. For create_frame, a new ID creates a project.' } }, required: [...tool.inputSchema.required ?? [], 'project_id'] } }
          }),
        ] }
        else if (rpc.method === 'tools/call') {
          try {
            let output: Record<string, unknown>
            if (params.name === 'list_projects') { validateSchema(params.arguments ?? {}, { type: 'object', properties: {}, additionalProperties: false }); output = { projects: await storage.list(agent.id) } }
            else {
              const tool = paperTools.find(t => t.name === params.name)
              if (!tool) throw new Error('Unknown tool')
              const args = params.arguments as Record<string, unknown>
              const id = safeId(args?.project_id)
              const { project_id: _projectId, ...input } = args
              if (input.file !== undefined || input.output !== undefined) throw new Error('Remote tools accept project IDs, not file paths')
              validateSchema(input, tool.inputSchema)
              output = await storage.locked(`${agent.id}/${id}`, async () => {
                // Token rotation may have occurred while waiting for this project's lock.
                if (!auth.bearer(match?.[1])) throw httpError(401, 'Token revoked')
                let record = await storage.read(agent.id, id)
                if (!record && tool.name !== 'create_frame') throw httpError(404, 'Project not found')
                if (input.expected_revision !== undefined && input.expected_revision !== record?.revision) throw httpError(409, 'Revision conflict; read the project again')
                const project = record?.document ?? createProject(new SceneStore(), String(input.project_name ?? 'Untitled'), { x: 0, y: 0, zoom: 1 }, true)
                let output: Record<string, unknown>
                if (tool.name === 'get_basic_info') output = basicInfo(project)
                else if (tool.name === 'get_canvas_elements') output = readCanvas(project, input.element_ids as string[] | undefined)
                else if (tool.name === 'list_tokens') output = { tokens: (project.scene.tokens ?? []).filter(t => !input.type || t.type === input.type) }
                else if (tool.name === 'export_selection') output = exportCanvas(project, input)
                else {
                  const mutated = mutateCanvas(project, tool.name, input)
                  const activity = { ids: mutated.element ? [mutated.element.id] : [], tool: tool.name, until: Date.now() + 4000 }
                  record = await storage.write(agent.id, id, mutated.project, Math.max(Date.now(), (record?.updatedAt ?? 0) + 1), record, activity)
                  emit(agent.id, record)
                  output = { ...mutated }
                }
                return { ...output, project_id: id, revision: record?.revision }
              })
            }
            result = { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output, isError: false }
          } catch (error) { result = { content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool failed' }], isError: true } }
        } else { json(res, 200, { jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: 'Method not found' } }); return }
        json(res, 200, { jsonrpc: '2.0', id: rpc.id, result }); return
      }
      if (!user) throw httpError(401, 'Sign in to access cloud projects')
      const account = req.headers['x-paper-account'] ?? (path === '/api/events' ? url.searchParams.get('account') : undefined)
      if (account && account !== user.id) throw httpError(403, 'Account changed. Reload Paper before syncing.')
      if (!['GET', 'HEAD'].includes(req.method ?? '') && req.headers['x-paper-client'] !== 'web') throw httpError(403, 'Missing request guard')
      if (path === '/api/auth/logout' && req.method === 'POST') { await auth.logout(sessionCookie); res.setHeader('Set-Cookie', cookie('paper_session', '', 0)); json(res, 200, { ok: true }); return }
      if (path === '/api/auth/token/regenerate' && req.method === 'POST') { json(res, 200, { token: await auth.regenerate(user.id) }); return }
      if (path === '/api/auth/token' && req.method === 'GET') { json(res, 200, { token: auth.reveal(user.id) }); return }
      if (path === '/api/projects' && req.method === 'GET') { json(res, 200, { projects: await storage.list(user.id) }); return }
      if (path === '/api/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.write(': connected\n\n')
        const set = streams.get(user.id) ?? new Set(); streams.set(user.id, set)
        if (set.size >= 20) { res.end(); return }; set.add(res)
        const heartbeat = setInterval(() => { if (!auth.session(sessionCookie)) res.end(); else res.write(': heartbeat\n\n') }, 20_000)
        res.on('close', () => { clearInterval(heartbeat); set.delete(res); if (!set.size) streams.delete(user.id) }); return
      }
      const projectRoute = path.match(/^\/api\/projects\/([^/]+)$/)
      if (projectRoute) {
        const id = safeId(decodeURIComponent(projectRoute[1]))
        if (req.method === 'GET') { const record = await storage.read(user.id, id); if (!record) throw httpError(404, 'Project not found'); json(res, 200, record); return }
        if (req.method === 'PUT') { const input = await body(req, parsed); const record = await storage.put(user.id, id, input.document, input.expectedRevision, input.updatedAt); emit(user.id, record); json(res, 200, record); return }
      }
      throw httpError(404, 'Not found')
    } catch (error) {
      if (res.headersSent) { res.end(); return }
      const failure = error as Error & { status?: number; current?: CloudProject }
      json(res, failure.status ?? 500, { error: failure.status ? failure.message : 'Server could not complete the request', ...(failure.status === 409 ? { current: failure.current ?? null } : {}) })
    }
  }
  return { handler, auth, storage, close: () => { for (const set of streams.values()) for (const res of set) res.end() } }
}
