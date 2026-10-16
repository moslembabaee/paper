import type { ComponentOverrides, ComponentProperty, ComponentPropertyValue, SceneElement } from './types.ts'
import type { DesignToken, StyleLibrary } from '../tokens/types.ts'
import { applyComponentOverrides, subtree, validateComponent } from './components.ts'
import { validateElement } from './elements.ts'
import { validateStateMachine } from './stateMachine.ts'

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
      if (property.stateMachine !== undefined) {
        validateStateMachine(property.stateMachine, Array.from(values))
      }
    } else if (property.kind === 'boolean') {
      if (!safeId(property.sourceId) || typeof property.defaultValue !== 'boolean') throw new Error('Invalid component property')
      if (property.targetProperty && !['visible', 'kinetic.enabled', 'clipContent'].includes(property.targetProperty)) throw new Error('Invalid boolean target property')
    } else if (property.kind === 'text') {
      if (!safeId(property.sourceId) || typeof property.defaultValue !== 'string') throw new Error('Invalid component property')
    } else if (property.kind === 'color') {
      if (!safeId(property.sourceId) || typeof property.defaultValue !== 'string') throw new Error('Invalid component property')
      if (property.targetProperty && !['fill', 'stroke', 'shader'].includes(property.targetProperty)) throw new Error('Invalid color target property')
    } else if (property.kind === 'number') {
      if (!safeId(property.sourceId) || typeof property.defaultValue !== 'number' || !Number.isFinite(property.defaultValue)) throw new Error('Invalid component property')
    } else if (property.kind === 'kinetic') {
      if (!safeId(property.sourceId) || !property.targetProperty) throw new Error('Invalid component property')
      const validTargets = ['enabled', 'amplitude', 'rotation', 'duration', 'stagger', 'waveShape', 'staggerMode', 'weightModulation', 'slantModulation', 'scaleModulation']
      if (!validTargets.includes(property.targetProperty)) throw new Error('Invalid kinetic target property')
    } else if (property.kind === 'shader') {
      if (!safeId(property.sourceId) || !property.targetProperty) throw new Error('Invalid component property')
      const validTargets = ['speed', 'scale', 'rotation', 'frequency', 'octaves', 'turbulence', 'displacement', 'viewMode', 'blendMode']
      if (!validTargets.includes(property.targetProperty)) throw new Error('Invalid shader target property')
    } else {
      throw new Error('Invalid component property')
    }
  }
}

export function validPropertyValue(property: ComponentProperty, value: ComponentPropertyValue): boolean {
  if (property.kind === 'boolean') {
    return typeof value === 'boolean'
  }
  if (property.kind === 'variant') {
    return typeof value === 'string' && (
      property.options.some(option => option.value === value) ||
      Boolean(property.stateMachine?.states.includes(value))
    )
  }
  if (property.kind === 'text' || property.kind === 'color') {
    return typeof value === 'string'
  }
  if (property.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false
    if (property.min !== undefined && value < property.min) return false
    if (property.max !== undefined && value > property.max) return false
    return true
  }
  if (property.kind === 'kinetic') {
    if (property.targetProperty === 'enabled') return typeof value === 'boolean'
    if (property.targetProperty === 'waveShape') return typeof value === 'string' && ['triangle', 'sine', 'bounce', 'spring'].includes(value)
    if (property.targetProperty === 'staggerMode') return typeof value === 'string' && ['cascade', 'wave', 'center-out', 'random', 'elastic'].includes(value)
    return typeof value === 'number' && Number.isFinite(value)
  }
  if (property.kind === 'shader') {
    if (property.targetProperty === 'blendMode' || property.targetProperty === 'viewMode') return typeof value === 'string'
    return typeof value === 'number' && Number.isFinite(value)
  }
  return false
}

/** Variants compose first; slots then win over variants, and local layer edits win last. */
export function resolveComponentProperties(source: SceneElement, properties: readonly ComponentProperty[], values: Readonly<Record<string, ComponentPropertyValue>>, tokens: readonly DesignToken[], library: StyleLibrary, activeState?: string): SceneElement {
  let next = source
  const apply = (overrides: ComponentOverrides) => {
    next = applyComponentOverrides(next, { kind: 'instance', masterId: source.id, sourceId: source.id, instanceId: source.id, overrides }, tokens, library)
  }
  for (const property of properties) {
    if (property.kind !== 'variant') continue
    let value = values[property.id] ?? property.defaultValue
    if (activeState && (property.options.some(option => option.value === activeState) || property.stateMachine?.states.includes(activeState))) {
      value = activeState
    }
    const overrides = property.options.find(option => option.value === value)?.layers[source.id]
    if (overrides) apply(overrides)
  }
  for (const property of properties) {
    if (property.kind === 'variant' || property.sourceId !== source.id) continue
    const value = values[property.id] ?? property.defaultValue
    if (property.kind === 'text') {
      apply({ properties: { text: String(value) } })
    } else if (property.kind === 'boolean') {
      const boolVal = Boolean(value)
      if (property.targetProperty === 'clipContent' && source.type === 'frame') {
        apply({ properties: { clipContent: boolVal } })
      } else if (property.targetProperty === 'kinetic.enabled' && source.type === 'text') {
        const kineticOverrides = { ...(source.kinetic ?? { enabled: true, playing: true, amplitude: 16, rotation: 0, duration: 800, stagger: 40, phase: 0 }), enabled: boolVal }
        apply({ properties: { kinetic: kineticOverrides } as any })
      } else {
        apply({ properties: { visible: boolVal } })
      }
    } else if (property.kind === 'color') {
      const colorVal = String(value)
      if (property.targetProperty === 'stroke') {
        apply({ style: { stroke: { color: colorVal, width: source.style.stroke?.width ?? 1, dash: source.style.stroke?.dash ?? [] } } })
      } else if (property.targetProperty === 'shader') {
        if (source.style.shader) {
          apply({ style: { shader: { ...source.style.shader, params: { ...source.style.shader.params, color: colorVal, tint: colorVal } as any } } })
        }
      } else {
        apply({ style: { fill: colorVal } })
      }
    } else if (property.kind === 'number') {
      const numVal = Number(value)
      if (Number.isFinite(numVal)) {
        const target = property.targetProperty ?? 'opacity'
        if (target === 'opacity') {
          apply({ style: { opacity: numVal } })
        } else if (target === 'cornerRadius' && ('cornerRadius' in source)) {
          apply({ properties: { cornerRadius: numVal } as any })
        } else if (target === 'width') {
          apply({ properties: { width: numVal } })
        } else if (target === 'height') {
          apply({ properties: { height: numVal } })
        } else if (target === 'strokeWidth') {
          apply({ style: { stroke: { color: source.style.stroke?.color ?? '#080808', width: numVal, dash: source.style.stroke?.dash ?? [] } } })
        } else if (target === 'fontSize' && source.type === 'text') {
          apply({ properties: { fontSize: numVal } })
        } else if (target === 'fontWeight' && source.type === 'text') {
          apply({ properties: { fontWeight: numVal } })
        } else if (target === 'letterSpacing' && source.type === 'text') {
          apply({ properties: { letterSpacing: numVal } })
        } else if (target === 'lineHeight' && source.type === 'text') {
          apply({ properties: { lineHeight: numVal } })
        }
      }
    } else if (property.kind === 'kinetic' && source.type === 'text') {
      const currentKinetic = source.kinetic ?? {
        enabled: true,
        playing: true,
        amplitude: 16,
        rotation: 0,
        duration: 800,
        stagger: 40,
        phase: 0,
        staggerMode: 'cascade',
        waveShape: 'sine',
      }
      apply({ properties: { kinetic: { ...currentKinetic, [property.targetProperty]: value } } as any })
    } else if (property.kind === 'shader' && source.style.shader) {
      const prop = property.targetProperty
      const existingShader = source.style.shader
      if (['speed', 'scale', 'rotation'].includes(prop)) {
        apply({ style: { shader: { ...existingShader, [prop]: typeof value === 'number' ? value : Number(value) } } })
      } else {
        apply({ style: { shader: { ...existingShader, params: { ...existingShader.params, [prop]: value } as any } } })
      }
    }
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
      if (!source) throw new Error('Choose a compatible layer inside this master')
      if (property.kind === 'text' && source.type !== 'text') throw new Error('Choose a text layer for a text slot')
      if (property.kind === 'kinetic' && source.type !== 'text') throw new Error('Choose a text layer for kinetic typography')
      if (property.kind === 'shader' && !source.style.shader) throw new Error('Choose a layer with a shader for shader properties')
    } else for (const option of property.options) for (const [id, overrides] of Object.entries(option.layers)) {
      const source = sources.get(id)
      if (!source) throw new Error('Variant layer is outside this master')
      for (const key of Object.keys(overrides.properties ?? {})) {
        if (!(key in source) && key !== 'sizing' && !(source.type === 'frame' && key === 'layout') && !(source.type === 'path' && key === 'nodes') && !(source.type === 'text' && ['kinetic', 'variableAxes', 'openTypeFeatures', 'fontKerning', 'opticalKerning', 'textOnPath', 'textTransform'].includes(key))) {
          throw new Error('Unsupported variant override')
        }
      }
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
