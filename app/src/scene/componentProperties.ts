import type { ComponentOverrides, ComponentProperty, ComponentPropertyValue, SceneElement } from './types.ts'
import type { DesignToken, StyleLibrary } from '../tokens/types.ts'
import { applyComponentOverrides, subtree, validateComponent } from './components.ts'
import { validateElement } from './elements.ts'

const safeId = (id: unknown): id is string => typeof id === 'string' && !!id && id.length <= 200 && !['__proto__', 'constructor', 'prototype'].includes(id)
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

export function validateComponentProperties(properties: readonly ComponentProperty[]): void {
  if (!Array.isArray(properties) || properties.length > 100) throw new Error('Invalid component properties')
  const ids = new Set<string>(), names = new Set<string>()
  for (const property of properties) {
    if (!property || !safeId(property.id) || typeof property.name !== 'string' || !property.name.trim() || property.name.length > 100 || ids.has(property.id) || names.has(property.name.trim().toLowerCase())) throw new Error('Component property names must be unique')
    ids.add(property.id); names.add(property.name.trim().toLowerCase())
    if (property.kind === 'variant') {
      if (!Array.isArray(property.options) || !property.options.length || property.options.length > 100) throw new Error('A variant needs at least one option')
      const values = new Set<string>()
      for (const option of property.options) {
        if (!option || typeof option.value !== 'string' || !option.value.trim() || option.value.length > 100 || values.has(option.value) || !isRecord(option.layers)) throw new Error('Invalid variant option')
        values.add(option.value)
        for (const [id, overrides] of Object.entries(option.layers)) {
          if (!safeId(id)) throw new Error('Invalid variant layer')
          validateComponent({ kind: 'instance', masterId: id, sourceId: id, instanceId: id, overrides: overrides as ComponentOverrides })
        }
      }
      if (!values.has(property.defaultValue)) throw new Error('Choose a valid default variant')
    } else if ((property.kind !== 'boolean' && property.kind !== 'text') || !safeId(property.sourceId) || typeof property.defaultValue !== (property.kind === 'boolean' ? 'boolean' : 'string')) throw new Error('Invalid component property')
  }
}

export function validPropertyValue(property: ComponentProperty, value: ComponentPropertyValue): boolean {
  return property.kind === 'boolean' ? typeof value === 'boolean' : typeof value === 'string' && (property.kind === 'text' || property.options.some(option => option.value === value))
}

/** Variants compose first; slots then win over variants, and local layer edits win last. */
export function resolveComponentProperties(source: SceneElement, properties: readonly ComponentProperty[], values: Readonly<Record<string, ComponentPropertyValue>>, tokens: readonly DesignToken[], library: StyleLibrary): SceneElement {
  let next = source
  const apply = (overrides: ComponentOverrides) => {
    next = applyComponentOverrides(next, { kind: 'instance', masterId: source.id, sourceId: source.id, instanceId: source.id, overrides }, tokens, library)
  }
  for (const property of properties) {
    if (property.kind !== 'variant') continue
    const value = values[property.id] ?? property.defaultValue
    const overrides = property.options.find(option => option.value === value)?.layers[source.id]
    if (overrides) apply(overrides)
  }
  for (const property of properties) {
    if (property.kind === 'variant' || property.sourceId !== source.id) continue
    const value = values[property.id] ?? property.defaultValue
    apply({ properties: property.kind === 'text' ? { text: value as string } : { visible: value as boolean } })
  }
  return next
}

/** Validate every option, including ones that no instance has selected yet. */
export function validatePropertyTargets(master: SceneElement, elements: Readonly<Record<string, SceneElement>>, properties: readonly ComponentProperty[], tokens: readonly DesignToken[], library: StyleLibrary): void {
  validateComponentProperties(properties)
  const sources = new Map(subtree(elements, master.id).map(node => [node.id, node]))
  for (const property of properties) {
    if (property.kind !== 'variant') {
      const source = sources.get(property.sourceId)
      if (!source || (property.kind === 'text' && source.type !== 'text')) throw new Error('Choose a compatible layer inside this master')
    } else for (const option of property.options) for (const [id, overrides] of Object.entries(option.layers)) {
      const source = sources.get(id)
      if (!source) throw new Error('Variant layer is outside this master')
      for (const key of Object.keys(overrides.properties ?? {})) if (!(key in source) && key !== 'sizing' && !(source.type === 'frame' && key === 'layout') && !(source.type === 'path' && key === 'nodes')) throw new Error('Unsupported variant override')
      validateElement(applyComponentOverrides(source, { kind: 'instance', masterId: master.id, sourceId: id, instanceId: master.id, overrides }, tokens, library))
    }
  }
}

/** Structural edits release slots for deleted layers and discard orphaned variant patches. */
export function pruneComponentProperties(properties: readonly ComponentProperty[], sources: ReadonlySet<string>): readonly ComponentProperty[] {
  if (properties.every(property => property.kind === 'variant' ? property.options.every(option => Object.keys(option.layers).every(id => sources.has(id))) : sources.has(property.sourceId))) return properties
  return properties.flatMap<ComponentProperty>(property => {
    if (property.kind !== 'variant') return sources.has(property.sourceId) ? [property] : []
    return [{ ...property, options: property.options.map(option => ({ ...option, layers: Object.fromEntries(Object.entries(option.layers).filter(([id]) => sources.has(id))) })) }]
  })
}

/** Deleting a resource freezes its current appearance in every saved variant. */
export function releaseComponentResources(master: SceneElement, elements: Readonly<Record<string, SceneElement>>, tokens: readonly DesignToken[], library: StyleLibrary, removed: ReadonlySet<string>, resource: 'tokens' | 'styles'): SceneElement {
  if (master.component?.kind !== 'master' || !master.component.properties?.length) return master
  let changed = false
  const properties = master.component.properties.map(property => property.kind !== 'variant' ? property : { ...property, options: property.options.map(option => ({ ...option, layers: Object.fromEntries(Object.entries(option.layers).map(([id, overrides]) => {
    const hasToken = Object.values(overrides.tokenBindings ?? {}).some(id => id && removed.has(id)) || overrides.style?.effects?.some(effect => effect.type !== 'layer-blur' && effect.colorTokenId && removed.has(effect.colorTokenId))
    const hasStyle = Object.values(overrides.sharedStyleBindings ?? {}).some(id => id && removed.has(id))
    if (!(resource === 'tokens' ? hasToken : hasStyle)) return [id, overrides]
    changed = true
    const resolved = applyComponentOverrides(elements[id], { kind: 'instance', masterId: master.id, sourceId: id, instanceId: master.id, overrides }, tokens, library)
    const style = { ...overrides.style }, props = { ...overrides.properties }, tokenBindings = { ...overrides.tokenBindings }, sharedStyleBindings = { ...overrides.sharedStyleBindings }
    if (resource === 'tokens') {
      for (const [key, tokenId] of Object.entries(tokenBindings)) if (tokenId && removed.has(tokenId)) {
        Object.assign(tokenBindings, { [key]: null })
        if (key === 'fill') style.fill = resolved.style.fill
        else if (key === 'stroke') style.stroke = resolved.style.stroke
        else if (key === 'shadow') style.shadow = resolved.style.shadow
        else Object.assign(props, { [key]: resolved[key as keyof SceneElement] })
      }
      if (style.effects) style.effects = style.effects.map(effect => {
        if (effect.type === 'layer-blur' || !effect.colorTokenId || !removed.has(effect.colorTokenId)) return effect
        const { colorTokenId, ...literal } = effect
        return { ...literal, color: tokens.find(token => token.id === colorTokenId)!.value as string }
      })
    } else for (const [kind, styleId] of Object.entries(sharedStyleBindings)) if (styleId && removed.has(styleId)) {
      Object.assign(sharedStyleBindings, { [kind]: null })
      if (kind === 'color') style.fill = resolved.style.fill
      if (kind === 'effects') { style.effects = resolved.style.effects; style.shadow = resolved.style.shadow }
      if (kind === 'typography' && resolved.type === 'text') Object.assign(props, { fontFamily: resolved.fontFamily, fontSize: resolved.fontSize, fontWeight: resolved.fontWeight, lineHeight: resolved.lineHeight, letterSpacing: resolved.letterSpacing, textAlign: resolved.textAlign })
    }
    return [id, { ...overrides, properties: props, style, tokenBindings, sharedStyleBindings }]
  })) })) })
  return changed ? { ...master, component: { ...master.component, properties } } : master
}
