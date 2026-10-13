import { TOKEN_META } from '../tokens/model.ts'
import { motionControls, shaderCatalog, shaderKinds } from '../shaders/catalog.ts'
import type { ShaderControl } from '../shaders/types.ts'

/** The small JSON Schema vocabulary used by Paper's agent-facing contract. */
export interface JsonSchema {
  readonly type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
  readonly description?: string
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean | JsonSchema
  readonly items?: JsonSchema
  readonly anyOf?: readonly JsonSchema[]
  readonly enum?: readonly unknown[]
  readonly minimum?: number
  readonly exclusiveMinimum?: number
  readonly maximum?: number
  readonly minLength?: number
  readonly maxLength?: number
  readonly minItems?: number
  readonly maxItems?: number
  readonly pattern?: string
}

const str = (description?: string): JsonSchema => ({ type: 'string', minLength: 1, description })
const num: JsonSchema = { type: 'number' }
const positive: JsonSchema = { type: 'number', exclusiveMinimum: 0 }
const nonnegative: JsonSchema = { type: 'number', minimum: 0 }
const flag: JsonSchema = { type: 'boolean' }
const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: 'null' }] })
const object = (properties: Record<string, JsonSchema>, required: readonly string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })
const list = (items: JsonSchema): JsonSchema => ({ type: 'array', items })

function controlSchema(control: ShaderControl): JsonSchema {
  if (control.type === 'number') return { type: 'number', minimum: control.min, maximum: control.max }
  if (control.type === 'select') return { type: 'string', enum: control.options }
  const color: JsonSchema = { type: 'string', pattern: '^#[\\da-fA-F]{6}([\\da-fA-F]{2})?$' }
  if (control.type === 'color') return color
  if (control.type === 'palette') return { ...list(color), minItems: 2, maxItems: control.max }
  return str('Image URL or data URI. Relative paths are resolved by the Paper editor.')
}

const motionProperties: Record<string, JsonSchema> = {
  animated: flag,
  ...Object.fromEntries(motionControls.map(control => [control.key, controlSchema(control)])),
}
export const shaderSchema: JsonSchema = {
  anyOf: shaderKinds.map(kind => {
    const params = Object.fromEntries(shaderCatalog[kind].controls.map(control => [control.key, controlSchema(control)]))
    return object({ kind: { type: 'string', enum: [kind] }, params: object(params, Object.keys(params)), ...motionProperties }, ['kind', 'params', ...Object.keys(motionProperties)])
  }),
}
const stroke = object({ color: str(), width: nonnegative, dash: list(nonnegative) }, ['color', 'width', 'dash'])
const shadow = object({ color: str(), x: num, y: num, blur: nonnegative }, ['color', 'x', 'y', 'blur'])
const styleProperties = { fill: nullable({ type: 'string' }), opacity: { type: 'number', minimum: 0, maximum: 1 } as JsonSchema, stroke: nullable(stroke), shadow: nullable(shadow), shader: nullable(shaderSchema) }
const style = object(styleProperties)
const geometry = { x: num, y: num, width: positive, height: positive, rotation: num }
const sizingRule: JsonSchema = { type: 'string', enum: ['fixed', 'hug', 'fill'] }
const sizing = object({ width: sizingRule, height: sizingRule }, ['width', 'height'])
const layout = nullable(object({
  direction: { type: 'string', enum: ['horizontal', 'vertical'] }, gap: nonnegative,
  padding: object({ top: nonnegative, right: nonnegative, bottom: nonnegative, left: nonnegative }, ['top', 'right', 'bottom', 'left']),
  justify: { type: 'string', enum: ['start', 'center', 'end', 'space-between'] }, align: { type: 'string', enum: ['start', 'center', 'end'] },
}, ['direction', 'gap', 'padding', 'justify', 'align']))
const identity = { id: str(), name: str(), parentId: nullable(str()), zIndex: { type: 'integer', minimum: 0 } as JsonSchema, visible: flag, locked: flag }
const specific: Record<string, Record<string, JsonSchema>> = {
  frame: { children: list(str()), clipContent: flag, cornerRadius: nonnegative, layout },
  rectangle: { cornerRadius: nonnegative },
  ellipse: {},
  path: { d: { type: 'string' }, viewBox: { ...list(num), minItems: 4, maxItems: 4 }, fillRule: { type: 'string', enum: ['nonzero', 'evenodd'] } },
  text: { text: { type: 'string' }, fontFamily: str(), fontSize: positive, fontWeight: { type: 'number', minimum: 1, maximum: 1000 }, lineHeight: positive, letterSpacing: num, textAlign: { type: 'string', enum: ['left', 'center', 'right'] } },
  image: { src: { type: 'string' }, alt: { type: 'string' }, fit: { type: 'string', enum: ['cover', 'contain', 'fill'] }, cornerRadius: nonnegative },
}
const tokenProperties = ['fill', 'stroke', 'cornerRadius', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing', 'x', 'y', 'width', 'height'] as const
const tokenBindings = object(Object.fromEntries(tokenProperties.map(property => [property, str()])))
export const tokenSchema: JsonSchema = {
  anyOf: Object.keys(TOKEN_META).map(type => object({
    id: str(), name: { ...str(), pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 100 }, type: { type: 'string', enum: [type] },
    value: type === 'color' || type === 'fontFamily' ? str() : type === 'letterSpacing' ? num : type === 'fontWeight' ? { type: 'number', minimum: 1, maximum: 1000 } : type === 'radius' || type === 'spacing' ? nonnegative : positive,
  }, ['id', 'name', 'type', 'value'])),
}
export const elementSchema: JsonSchema = {
  anyOf: Object.entries(specific).map(([type, fields]) => {
    const properties = { ...identity, ...geometry, type: { type: 'string', enum: [type] } as JsonSchema, style: object(styleProperties, ['fill', 'stroke', 'opacity', 'shadow']), ...fields }
    return object({ ...properties, tokenBindings, sizing }, Object.keys(properties).filter(key => key !== 'layout'))
  }),
}
export const projectSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Paper project v1',
  ...object({
    format: { type: 'string', enum: ['paper'] }, version: { type: 'integer', enum: [1] },
    name: { ...str(), maxLength: 200 }, grid: flag,
    viewport: object({ x: num, y: num, zoom: { type: 'number', minimum: .1, maximum: 32 } }, ['x', 'y', 'zoom']),
    scene: object({ tokens: list(tokenSchema), version: { type: 'integer', enum: [1] }, backgroundShader: nullable(shaderSchema), rootIds: list(str()), elements: { type: 'object', additionalProperties: elementSchema } }, ['version', 'rootIds', 'elements']),
  }, ['format', 'version', 'name', 'grid', 'viewport', 'scene']),
}

export interface PaperTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: JsonSchema
  readonly annotations: { readonly readOnlyHint: boolean; readonly destructiveHint: boolean; readonly idempotentHint: boolean; readonly openWorldHint: boolean }
}
const file = str('Paper JSON file path within the configured workspace. Omit to use the active live editor, or --file in offline mode.')
const revision = str('Optional opaque revision from get_basic_info or get_canvas_elements. Rejects stale edits; pass it unchanged.')
const base = { file }
const creation = { id: str('Optional stable ID; otherwise a UUID is generated.'), name: str(), parentId: nullable(str()), ...geometry, visible: flag, locked: flag, style, sizing }
const mutable = { name: str(), ...geometry, visible: flag, locked: flag, style, sizing }
export function patchSchema(type: string): JsonSchema {
  const fields = { ...specific[type] }
  delete fields.children
  return object({ ...mutable, ...fields })
}
const allPatchFields = Object.assign({}, ...Object.values(specific)) as Record<string, JsonSchema>
delete allPatchFields.children
const tool = (name: string, description: string, inputSchema: JsonSchema, readOnly = false): PaperTool => ({ name, description, inputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly && name === 'update_element', idempotentHint: readOnly || name === 'update_element', openWorldHint: false } })
export const paperTools: readonly PaperTool[] = [
  tool('get_basic_info', 'Identify the currently open file, artboards, selection, node count and revision before editing.', object(base), true),
  tool('list_tokens', 'List design tokens in the active file. Optional type filters the result.', object({ ...base, type: { type: 'string', enum: Object.keys(TOKEN_META) } }), true),
  tool('create_token', 'Create a named design token. Names use lowercase kebab-case; values follow the token type. Creation is atomic and undoable.', object({ ...base, expected_revision: revision, id: str(), name: { ...str(), pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 100 }, type: { type: 'string', enum: Object.keys(TOKEN_META) }, value: { anyOf: [str(), num] } }, ['name', 'type', 'value'])),
  tool('get_canvas_elements', 'Read the latest canvas, hierarchy, project settings and file revision. Coordinates are relative to the parent frame, in pixels; the engineering grid is 120px. Optional element_ids includes those elements and their descendants.', object({ ...base, element_ids: { ...list(str()), minItems: 1 } }), true),
  tool('create_frame', 'Create a frame in a Paper file. Creates a new project if the file does not exist. Defaults: 720×480px, cream fill, clipped content, 120px grid. Optional layout enables flex flow; sizing controls each axis. Parent must be an unlocked frame.', object({ ...base, expected_revision: revision, project_name: { ...str(), maxLength: 200 }, ...creation, clipContent: flag, cornerRadius: nonnegative, layout })),
  tool('add_shader_shape', 'Add a rectangle or ellipse with a native @paper-design/shaders-react paint. Supply shader_kind; optional params and motion override catalog defaults. Inspect paper://shaders for supported controls.', object({ ...base, expected_revision: revision, ...creation, shape: { type: 'string', enum: ['rectangle', 'ellipse'] }, cornerRadius: nonnegative, shader_kind: { type: 'string', enum: shaderKinds }, params: { type: 'object', additionalProperties: true }, motion: object(motionProperties) }, ['shader_kind'])),
  tool('update_element', 'Patch an existing element. Style fields merge; shader paints are complete values. Optionally reparent or reorder using parentId and index. Structural edits and validation are atomic. Locked elements must be unlocked first.', object({ ...base, expected_revision: revision, element_id: str(), patch: object({ ...mutable, ...allPatchFields }), parentId: nullable(str()), index: { type: 'integer', minimum: 0 } }, ['element_id', 'patch'])),
  tool('export_selection', 'Export element_ids and frame descendants as editable Paper JSON (default) or SVG. Omit element_ids for the whole canvas. Shader JSON is lossless; SVG shaders require supplied shader_snapshots from the browser. Returns content inline; optional output writes a new file without overwriting existing files.', object({ ...base, element_ids: { ...list(str()), minItems: 1 }, format: { type: 'string', enum: ['json', 'svg'] }, background: { type: 'string', enum: ['transparent', 'cream'] }, output: str('New export path within the workspace.'), shader_snapshots: { type: 'object', additionalProperties: { type: 'string', pattern: '^data:image/png;base64,[A-Za-z0-9+/=]+$' } } })),
]

/** Validate the exact vocabulary above. SceneStore also checks graph invariants. */
export function validateSchema(value: unknown, schema: JsonSchema, path = 'arguments'): void {
  const fail = (reason: string): never => { throw new Error(`${path}: ${reason}`) }
  if (schema.anyOf) {
    for (const candidate of schema.anyOf) {
      try { validateSchema(value, candidate, path); return } catch { /* Try the next union member. */ }
    }
    fail('does not match a supported value')
  }
  if (schema.enum && !schema.enum.includes(value)) fail(`expected ${schema.enum.join(', ')}`)
  if (schema.type === 'null') { if (value !== null) fail('expected null'); return }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object')
    const record = value as Record<string, unknown>
    for (const key of schema.required ?? []) if (!Object.hasOwn(record, key)) fail(`missing ${key}`)
    for (const [key, entry] of Object.entries(record)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('reserved property')
      const child = schema.properties && Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined
      if (child) validateSchema(entry, child, `${path}.${key}`)
      else if (schema.additionalProperties === false) fail(`unknown property ${key}`)
      else if (typeof schema.additionalProperties === 'object') validateSchema(entry, schema.additionalProperties, `${path}.${key}`)
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) fail('expected an array')
    const entries = value as unknown[]
    if (schema.minItems !== undefined && entries.length < schema.minItems) fail('too few items')
    if (schema.maxItems !== undefined && entries.length > schema.maxItems) fail('too many items')
    if (schema.items) entries.forEach((entry, i) => validateSchema(entry, schema.items!, `${path}[${i}]`))
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') fail('expected a string')
    const text = value as string
    if (schema.minLength !== undefined && text.trim().length < schema.minLength) fail('must not be empty')
    if (schema.maxLength !== undefined && text.length > schema.maxLength) fail('too long')
    if (schema.pattern && !new RegExp(schema.pattern).test(text)) fail('invalid format')
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('expected a finite number')
    const n = value as number
    if (schema.type === 'integer' && !Number.isInteger(n)) fail('expected an integer')
    if (schema.minimum !== undefined && n < schema.minimum) fail(`must be at least ${schema.minimum}`)
    if (schema.exclusiveMinimum !== undefined && n <= schema.exclusiveMinimum) fail(`must be greater than ${schema.exclusiveMinimum}`)
    if (schema.maximum !== undefined && n > schema.maximum) fail(`must be at most ${schema.maximum}`)
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') fail('expected a boolean')
}
