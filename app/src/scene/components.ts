import { pruneComponentProperties, resolveComponentProperties, validPropertyValue, validateComponentProperties, validatePropertyTargets } from './componentProperties.ts'
import { validateStateMachine } from './stateMachine.ts'
import { EMPTY_LIBRARY, detachEditedSharedStyles, resolveSharedStyles } from '../tokens/library.ts'
import type { ComponentLink, ComponentOverrides, ElementPatch, ElementType, SceneElement } from './types.ts'
import { freezeElement, validateElement } from './elements.ts'
import { equalValue } from './history.ts'
import { detachEditedBindings, resolveTokenBindings } from '../tokens/model.ts'
import type { DesignToken, SharedStyleKind, StyleLibrary, TokenProperty } from '../tokens/types.ts'

const PROPERTY_KEYS = new Set(['name', 'x', 'y', 'width', 'height', 'rotation', 'visible', 'locked', 'sizing', 'cornerRadius', 'clipContent', 'layout', 'd', 'viewBox', 'fillRule', 'nodes', 'text', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'src', 'alt', 'fit', 'fontSource', 'variableAxes', 'openTypeFeatures', 'fontKerning', 'opticalKerning', 'textOnPath', 'textTransform'])
const STYLE_KEYS = new Set(['fill', 'stroke', 'opacity', 'shadow', 'shader', 'effects'])
const STROKE_KEYS = new Set(['color', 'width', 'dash'])
const TOKEN_KEYS = new Set(['fill', 'stroke', 'shadow', 'cornerRadius', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing', 'x', 'y', 'width', 'height'])
const OVERRIDE_KEYS = new Set(['properties', 'style', 'tokenBindings', 'sharedStyleBindings'])
const frozenLinks = new WeakSet<object>()
function freezeTree<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) freezeTree(child)
  return Object.freeze(value)
}
export function freezeComponent(link: ComponentLink): ComponentLink {
  if (frozenLinks.has(link)) return link
  const frozen = freezeTree(structuredClone(link))
  frozenLinks.add(frozen)
  return frozen
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function checkKeys(value: unknown, keys: ReadonlySet<string>): void {
  if (!record(value) || Object.keys(value).some(key => !keys.has(key))) throw new Error('Invalid component overrides')
}
export function validateComponent(link: ComponentLink): void {
  if (!record(link) || !['master', 'instance'].includes(link.kind)) throw new Error('Invalid component link')
  if (link.kind === 'master') {
    if (Object.keys(link).some(key => !['kind', 'properties', 'stateMachine'].includes(key))) throw new Error('Invalid master component')
    if (link.properties !== undefined) validateComponentProperties(link.properties)
    if (link.stateMachine !== undefined) validateStateMachine(link.stateMachine)
    return
  }
  if (Object.keys(link).some(key => !['kind', 'masterId', 'sourceId', 'instanceId', 'overrides', 'propertyValues', 'activeState'].includes(key)) || ![link.masterId, link.sourceId, link.instanceId].every(id => typeof id === 'string' && id.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(id))) throw new Error('Invalid component reference')
  if (link.activeState !== undefined && (typeof link.activeState !== 'string' || !link.activeState.trim())) throw new Error('Invalid active component state')
  if (link.propertyValues !== undefined && (!record(link.propertyValues) || Object.entries(link.propertyValues).some(([id, value]) => !id || ['__proto__', 'constructor', 'prototype'].includes(id) || !['string', 'boolean'].includes(typeof value)))) throw new Error('Invalid component property values')
  checkKeys(link.overrides, OVERRIDE_KEYS)
  if (link.overrides.properties !== undefined) checkKeys(link.overrides.properties, PROPERTY_KEYS)
  if (link.overrides.style !== undefined) {
    checkKeys(link.overrides.style, STYLE_KEYS)
    if (link.overrides.style.stroke !== undefined && link.overrides.style.stroke !== null) checkKeys(link.overrides.style.stroke, STROKE_KEYS)
  }
  if (link.overrides.sharedStyleBindings !== undefined && (!record(link.overrides.sharedStyleBindings) || Object.entries(link.overrides.sharedStyleBindings).some(([key, value]) => !['color', 'typography', 'effects'].includes(key) || (value !== null && (typeof value !== 'string' || !value))))) throw new Error('Invalid shared style override')
  if (link.overrides.tokenBindings !== undefined && (!record(link.overrides.tokenBindings) || Object.entries(link.overrides.tokenBindings).some(([key, value]) => !TOKEN_KEYS.has(key) || (value !== null && (typeof value !== 'string' || !value))))) throw new Error('Invalid component token bindings')
}

/** Return a master or instance root for any layer in a component subtree. */
export function componentRoot(elements: Readonly<Record<string, SceneElement>>, id: string): SceneElement | undefined {
  let node: SceneElement | undefined = Object.hasOwn(elements, id) ? elements[id] : undefined
  while (node) {
    if (node.component?.kind === 'instance') return elements[node.component.instanceId]
    if (node.component?.kind === 'master') return node
    node = node.parentId === null ? undefined : elements[node.parentId]
  }
}
export function subtree(elements: Readonly<Record<string, SceneElement>>, id: string): SceneElement[] {
  const result: SceneElement[] = []
  const visit = (nodeId: string) => {
    const node = elements[nodeId]
    if (!node) return
    result.push(node)
    if (node.type === 'frame') node.children.forEach(visit)
  }
  visit(id)
  return result
}

/** Only changed channels become overrides; untouched channels keep inheriting. */
export function recordComponentEdit(node: SceneElement, updated: SceneElement, patch: ElementPatch<ElementType>): SceneElement {
  const link = node.component
  if (link?.kind !== 'instance') return updated
  const properties = { ...link.overrides.properties } as Record<string, unknown>
  const style = { ...link.overrides.style }
  for (const [key, value] of Object.entries(patch)) {
    if (node.id === link.instanceId && ['x', 'y', 'rotation'].includes(key)) continue
    if (PROPERTY_KEYS.has(key) && !equalValue(node[key as keyof SceneElement], value)) properties[key] = updated[key as keyof SceneElement]
  }
  // Resizing a hug/fill layer implicitly changes its sizing, too.
  if (!equalValue(node.sizing, updated.sizing)) properties.sizing = updated.sizing
  if (node.type === 'path' && Object.hasOwn(patch, 'd') && !Object.hasOwn(patch, 'nodes')) delete properties.nodes
  if (node.type === 'path' && updated.type === 'path' && Object.hasOwn(patch, 'nodes')) properties.d = updated.d
  for (const [key, value] of Object.entries(patch.style ?? {})) {
    if (equalValue(node.style[key as keyof typeof node.style], value)) continue
    if (key === 'stroke' && value && node.style.stroke) {
      const stroke = { ...style.stroke }
      const nextStroke = updated.style.stroke!
      for (const channel of ['color', 'width', 'dash'] as const) if (!equalValue(node.style.stroke[channel], nextStroke[channel])) Object.assign(stroke, { [channel]: nextStroke[channel] })
      style.stroke = stroke
    } else Object.assign(style, { [key]: value })
  }
  const tokenBindings = { ...link.overrides.tokenBindings }
  for (const property of Object.keys(tokenBindings) as TokenProperty[]) if (node.tokenBindings?.[property] && !updated.tokenBindings?.[property]) tokenBindings[property] = null
  const sharedStyleBindings = { ...link.overrides.sharedStyleBindings }
  for (const kind of ['color', 'typography', 'effects'] as const) if (node.sharedStyleBindings?.[kind] && !updated.sharedStyleBindings?.[kind]) sharedStyleBindings[kind] = null
  const overrides: ComponentOverrides = { ...link.overrides, properties, style, ...(Object.keys(sharedStyleBindings).length ? { sharedStyleBindings } : {}), ...(Object.keys(tokenBindings).length ? { tokenBindings } : {}) }
  return { ...updated, component: { ...link, overrides } }
}

/** A binding override affects one channel; other bindings still follow the master. */
export function recordComponentTokenEdit(node: SceneElement, updated: SceneElement, property: TokenProperty, tokenId: string | null): SceneElement {
  if (node.component?.kind !== 'instance') return updated
  const link = node.component
  const properties = { ...link.overrides.properties } as Record<string, unknown>
  const style = { ...link.overrides.style }
  // A local stroke binding also keeps the stroke enabled if the master removes it.
  if (property === 'stroke' && tokenId !== null && !Object.hasOwn(style, 'stroke')) style.stroke = {}
  if (tokenId === null) {
    if (property === 'fill') style.fill = node.style.fill
    else if (property === 'shadow') style.shadow = node.style.shadow
    else if (property === 'stroke') style.stroke = { ...style.stroke, color: node.style.stroke!.color }
    else properties[property] = node[property as keyof SceneElement]
  }
  if (!equalValue(node.sizing, updated.sizing)) properties.sizing = updated.sizing
  const sharedStyleBindings = { ...link.overrides.sharedStyleBindings }
  for (const kind of ['color', 'typography', 'effects'] as const) if (node.sharedStyleBindings?.[kind] && !updated.sharedStyleBindings?.[kind]) sharedStyleBindings[kind] = null
  return { ...updated, component: { ...link, overrides: { ...link.overrides, properties, style, ...(Object.keys(sharedStyleBindings).length ? { sharedStyleBindings } : {}), tokenBindings: { ...link.overrides.tokenBindings, [property]: tokenId } } } }
}

export function applyComponentOverrides(source: SceneElement, link: Extract<ComponentLink, { kind: 'instance' }>, tokens: readonly DesignToken[], library: StyleLibrary = EMPTY_LIBRARY): SceneElement {
  const { properties = {}, style = {} } = link.overrides
  // A partial stroke can survive a master removing its stroke, too.
  const stroke = Object.hasOwn(style, 'stroke') ? style.stroke === null ? null : { color: '#080808', width: 1, dash: [], ...source.style.stroke, ...style.stroke } : source.style.stroke
  const tokenBindings = { ...detachEditedBindings(source.tokenBindings, { ...properties, style }, source) }
  // An explicit stroke color remains local even when the master happens to match it.
  if (style.stroke === null || (style.stroke && Object.hasOwn(style.stroke, 'color'))) delete tokenBindings.stroke
  for (const [property, id] of Object.entries(link.overrides.tokenBindings ?? {})) {
    if (id === null) delete tokenBindings[property as TokenProperty]
    else tokenBindings[property as TokenProperty] = id
  }
  const sharedStyleBindings = { ...detachEditedSharedStyles(source.sharedStyleBindings, { ...properties, style }) }
  for (const [kind, id] of Object.entries(link.overrides.sharedStyleBindings ?? {})) {
    if (id === null) delete sharedStyleBindings[kind as SharedStyleKind]
    else sharedStyleBindings[kind as SharedStyleKind] = id
  }
  if (sharedStyleBindings.effects) delete tokenBindings.shadow
  if (sharedStyleBindings.color) delete tokenBindings.fill
  if (sharedStyleBindings.typography) for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const) delete tokenBindings[key]
  const node = { ...source, ...(source.sharedStyleBindings || Object.keys(sharedStyleBindings).length ? { sharedStyleBindings } : {}), ...properties, component: link, tokenBindings, style: { ...source.style, ...style, stroke } } as SceneElement
  if (!source.tokenBindings && !Object.keys(tokenBindings).length) delete (node as { tokenBindings?: unknown }).tokenBindings
  if (node.type === 'path' && Object.hasOwn(properties, 'd') && !Object.hasOwn(properties, 'nodes')) delete (node as { nodes?: unknown }).nodes
  return resolveTokenBindings(resolveSharedStyles(node, library, tokens), tokens)
}

/** Reconcile materialized instance trees, preserving IDs, overrides and unchanged references. */
export function synchronizeComponents(input: Readonly<Record<string, SceneElement>>, tokens: readonly DesignToken[], previous?: Readonly<Record<string, SceneElement>>, library: StyleLibrary = EMPTY_LIBRARY): Readonly<Record<string, SceneElement>> {
  // Prune definitions when a master layer is deleted or moved out of its subtree.
  for (const master of Object.values(input)) if (master.component?.kind === 'master' && master.component.properties?.length) {
    const properties = pruneComponentProperties(master.component.properties, new Set(subtree(input, master.id).map(node => node.id)))
    if (!equalValue(properties, master.component.properties)) input = { ...input, [master.id]: freezeElement({ ...master, component: { ...master.component, properties } }) }
  }
  const roots = Object.values(input).filter(node => node.component?.kind === 'instance' && node.component.instanceId === node.id)
  if (!roots.length) return input
  let elements = input
  const sourceTrees = new Map<string, SceneElement[]>()
  const put = (node: SceneElement) => {
    if (equalValue(elements[node.id], node)) return
    if (elements === input) elements = { ...input }
    ;(elements as Record<string, SceneElement>)[node.id] = freezeElement(node)
  }
  const drop = (id: string) => {
    if (elements === input) elements = { ...input }
    delete (elements as Record<string, SceneElement>)[id]
  }
  for (const root of roots) {
    const link = root.component as Extract<ComponentLink, { kind: 'instance' }>
    const master = input[link.masterId]
    const existing = subtree(input, root.id)
    if (!master || master.component?.kind !== 'master') {
      // Deleting a master retains all instances' current appearance as ordinary layers.
      for (const node of existing) { const { component, ...detached } = node; void component; put(detached) }
      continue
    }
    let sources = sourceTrees.get(master.id)
    if (!sources) { sources = subtree(input, master.id); sourceTrees.set(master.id, sources) }
    if (previous && sources.every(source => source === previous[source.id]) && existing.every(node => node === previous[node.id])) continue
    const definitions = master.component.properties ?? []
    const propertyValues = Object.fromEntries(Object.entries(link.propertyValues ?? {}).filter(([id, value]) => definitions.some(property => property.id === id && validPropertyValue(property, value))))
    const oldBySource = new Map(existing.map(node => [node.component?.kind === 'instance' ? node.component.sourceId : '', node]))
    const ids = new Map(sources.map(source => [source.id, source.id === master.id ? root.id : oldBySource.get(source.id)?.id ?? crypto.randomUUID()]))
    for (const source of sources) {
      const old = oldBySource.get(source.id)
      const id = ids.get(source.id)!
      let component: Extract<ComponentLink, { kind: 'instance' }> = old?.component?.kind === 'instance' ? old.component : { kind: 'instance', masterId: master.id, instanceId: root.id, sourceId: source.id, overrides: {} }
      if (source.id === master.id && link.propertyValues !== undefined) component = { ...component, propertyValues }
      if (source.id === master.id && link.activeState !== undefined) component = { ...component, activeState: link.activeState }
      const configured = resolveComponentProperties(source, definitions, propertyValues, tokens, library, link.activeState)
      let node = applyComponentOverrides(configured, component, tokens, library)
      node = { ...node, id, parentId: source.id === master.id ? root.parentId : ids.get(source.parentId!)!, zIndex: source.id === master.id ? root.zIndex : source.zIndex,
        ...(source.id === master.id ? { x: root.x, y: root.y, rotation: root.rotation } : {}),
        ...(source.type === 'frame' ? { children: source.children.map(child => ids.get(child)!) } : {}),
      } as SceneElement
      validateElement(node)
      put(node)
    }
    const retained = new Set(ids.values())
    for (const old of existing) if (!retained.has(old.id)) drop(old.id)
  }
  return elements
}

/** Cross-reference validation runs after hierarchy validation, before accepting a project. */
export function validateComponentGraph(elements: Readonly<Record<string, SceneElement>>, tokens: readonly DesignToken[], library: StyleLibrary = EMPTY_LIBRARY): void {
  for (const node of Object.values(elements)) {
    const link = node.component
    if (link?.kind === 'master') {
      if (node.parentId && componentRoot(elements, node.parentId)) throw new Error('Nested components are not supported')
      validatePropertyTargets(node, elements, link.properties ?? [], tokens, library)
      continue
    }
    if (link?.kind === 'instance') {
      const root = elements[link.instanceId], master = elements[link.masterId], source = elements[link.sourceId]
      if (!root || root.component?.kind !== 'instance' || root.component.instanceId !== root.id || root.component.sourceId !== link.masterId || root.component.masterId !== link.masterId || master?.component?.kind !== 'master' || !source || source.type !== node.type || componentRoot(elements, source.id)?.id !== master.id) throw new Error('Missing or incompatible component source')
      if (node.id === root.id) {
        if (node.parentId && componentRoot(elements, node.parentId)) throw new Error('Nested components are not supported')
      } else {
        const parent = node.parentId ? elements[node.parentId] : undefined
        if (parent?.component?.kind !== 'instance' || parent.component.instanceId !== root.id || parent.component.sourceId !== source.parentId) throw new Error('Invalid instance hierarchy')
      }
      const definitions = master.component.properties ?? []
      if (node.id !== root.id && link.propertyValues !== undefined) throw new Error('Property values belong to the instance root')
      for (const [id, value] of Object.entries(root.component.propertyValues ?? {})) {
        const property = definitions.find(property => property.id === id)
        if (!property || !validPropertyValue(property, value)) throw new Error('Unknown or incompatible component property value')
      }
      const configured = resolveComponentProperties(source, definitions, root.component.propertyValues ?? {}, tokens, library, root.component.activeState)
      const resolved = applyComponentOverrides(configured, link, tokens, library)
      for (const key of Object.keys(link.overrides.properties ?? {})) if (!(key in source) && key !== 'sizing' && !(source.type === 'frame' && key === 'layout') && !(source.type === 'path' && key === 'nodes')) throw new Error('Unsupported component override')
      validateElement(resolved)
    } else if (node.parentId && componentRoot(elements, node.parentId)?.component?.kind === 'instance') throw new Error('Unlinked instance child')
  }
  for (const root of Object.values(elements).filter(node => node.component?.kind === 'instance' && node.component.instanceId === node.id)) {
    const link = root.component as Extract<ComponentLink, { kind: 'instance' }>
    const sourceIds = subtree(elements, link.masterId).map(node => node.id)
    const instanceIds = subtree(elements, root.id).map(node => node.component?.kind === 'instance' ? node.component.sourceId : '')
    if (sourceIds.length !== instanceIds.length || new Set(instanceIds).size !== instanceIds.length || sourceIds.some(id => !instanceIds.includes(id))) throw new Error('Incomplete component instance')
  }
}
