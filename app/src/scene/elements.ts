import type { BooleanCompound, ElementInput, ElementOf, ElementType, SceneElement, VectorElement } from './types.ts'
import { freezeShader, validateShader } from '../shaders/catalog.ts'
import { serializePath } from './pathGeometry.ts'
import { freezeComponent, validateComponent } from './components.ts'

const names: Record<ElementType, string> = { frame: 'Frame', rectangle: 'Rectangle', ellipse: 'Ellipse', path: 'Vector path', text: 'Text', image: 'Image' }
const frozenElements = new WeakSet<SceneElement>()
const frozenCompounds = new WeakSet<BooleanCompound>()

function freezeCompound(compound: BooleanCompound): BooleanCompound {
  if (frozenCompounds.has(compound)) return compound
  const frozen = Object.freeze({ operation: compound.operation, operands: Object.freeze(compound.operands.map(operand => freezeElement(operand) as VectorElement)) })
  frozenCompounds.add(frozen)
  return frozen
}

/** Freeze records at the boundary so consumers cannot corrupt the observable state. */
export function freezeElement(element: SceneElement): SceneElement {
  if (frozenElements.has(element)) return element
  const tokenBindings = element.tokenBindings ? Object.freeze({ ...element.tokenBindings }) : undefined
  element = { ...element, ...(tokenBindings ? { tokenBindings } : {}) }
  if (element.component) element = { ...element, component: freezeComponent(element.component) }
  if (element.sizing) element = { ...element, sizing: Object.freeze({ ...element.sizing }) }
  if (element.type === 'frame' && element.layout) element = { ...element, layout: Object.freeze({ ...element.layout, padding: Object.freeze({ ...element.layout.padding }) }) }
  const style = Object.freeze({
    ...element.style,
    shader: element.style.shader ? freezeShader(element.style.shader) : null,
    stroke: element.style.stroke ? Object.freeze({ ...element.style.stroke, dash: Object.freeze([...element.style.stroke.dash]) }) : null,
    shadow: element.style.shadow ? Object.freeze({ ...element.style.shadow }) : null,
  })
  const frozen: SceneElement = element.type === 'frame'
    ? Object.freeze({ ...element, style, children: Object.freeze([...element.children]) })
    : element.type === 'path'
      ? Object.freeze({ ...element, style, viewBox: Object.freeze([...element.viewBox]) as typeof element.viewBox,
        ...(element.nodes ? { nodes: Object.freeze(element.nodes.map(c => Object.freeze({ closed: c.closed, anchors: Object.freeze(c.anchors.map(a => Object.freeze({ ...a, ...(a.in ? { in: Object.freeze({ ...a.in }) } : {}), ...(a.out ? { out: Object.freeze({ ...a.out }) } : {}) }))) }))) } : {}),
        ...(element.boolean ? { boolean: freezeCompound(element.boolean) } : {}),
      })
      : Object.freeze({ ...element, style })
  frozenElements.add(frozen)
  return frozen
}

export function validateElement(element: SceneElement, depth = 0): void {
  if (element.component !== undefined) validateComponent(element.component)
  if (depth > 16) throw new Error('Boolean compounds may be nested up to 16 levels')
  if (typeof element.id !== 'string' || !element.id || typeof element.name !== 'string' || !element.name || (element.parentId !== null && typeof element.parentId !== 'string') || !['frame', 'rectangle', 'ellipse', 'path', 'text', 'image'].includes(element.type)) throw new Error('Invalid element identity')
  for (const key of ['x', 'y', 'width', 'height', 'rotation', 'zIndex'] as const) {
    if (!Number.isFinite(element[key])) throw new Error(`Invalid ${key}`)
  }
  if (element.width <= 0 || element.height <= 0 || !Number.isInteger(element.zIndex) || element.zIndex < 0) throw new Error('Invalid element dimensions or order')
  if (element.sizing !== undefined && (!element.sizing || !['fixed', 'hug', 'fill'].includes(element.sizing.width) || !['fixed', 'hug', 'fill'].includes(element.sizing.height))) throw new Error('Invalid sizing rules')
  if ('layout' in element && element.layout !== undefined && element.layout !== null) {
    if (element.type !== 'frame') throw new Error('Only frames support auto layout')
    const layout = element.layout
    if (!['horizontal', 'vertical'].includes(layout.direction) || !['start', 'center', 'end', 'space-between'].includes(layout.justify) || !['start', 'center', 'end'].includes(layout.align) || !Number.isFinite(layout.gap) || layout.gap < 0 || !layout.padding || !['top', 'right', 'bottom', 'left'].every(key => Number.isFinite(layout.padding[key as keyof typeof layout.padding]) && layout.padding[key as keyof typeof layout.padding] >= 0)) throw new Error('Invalid auto layout')
  }
  if (typeof element.visible !== 'boolean' || typeof element.locked !== 'boolean') throw new Error('Invalid element flags')
  const { fill, stroke, opacity, shadow } = element.style
  if (element.style.shader !== undefined && element.style.shader !== null) validateShader(element.style.shader)
  if ((fill !== null && typeof fill !== 'string') || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('Invalid fill or opacity')
  if (stroke && (typeof stroke.color !== 'string' || !Number.isFinite(stroke.width) || stroke.width < 0 || !Array.isArray(stroke.dash) || stroke.dash.some(n => !Number.isFinite(n) || n < 0))) throw new Error('Invalid stroke')
  if (shadow && (typeof shadow.color !== 'string' || ![shadow.x, shadow.y, shadow.blur].every(Number.isFinite) || shadow.blur < 0)) throw new Error('Invalid shadow')
  if ('cornerRadius' in element && (!Number.isFinite(element.cornerRadius) || element.cornerRadius < 0)) throw new Error('Invalid corner radius')
  if (element.type === 'frame' && (!Array.isArray(element.children) || typeof element.clipContent !== 'boolean')) throw new Error('Invalid frame')
  if (element.type === 'path' && (typeof element.d !== 'string' || !Array.isArray(element.viewBox) || element.viewBox.length !== 4 || !element.viewBox.every(Number.isFinite) || element.viewBox[2] <= 0 || element.viewBox[3] <= 0 || !['nonzero', 'evenodd'].includes(element.fillRule))) throw new Error('Invalid path')
  if (element.type === 'path' && element.nodes !== undefined) {
    if (!Array.isArray(element.nodes) || element.boolean) throw new Error('Invalid editable path')
    for (const c of element.nodes) {
      if (!c || typeof c.closed !== 'boolean' || !Array.isArray(c.anchors) || !c.anchors.length) throw new Error('Invalid path contour')
      for (const a of c.anchors) {
        if (!a || ![a.x, a.y].every(Number.isFinite) || (a.cornerRadius !== undefined && (!Number.isFinite(a.cornerRadius) || a.cornerRadius < 0)) || (a.handleType !== undefined && !['mirrored', 'asymmetric', 'disconnected'].includes(a.handleType))) throw new Error('Invalid path anchor')
        for (const h of [a.in, a.out]) if (h !== undefined && (!h || ![h.x, h.y].every(Number.isFinite))) throw new Error('Invalid path handle')
      }
    }
    if (serializePath(element.nodes) !== element.d) throw new Error('Path outline does not match its anchors')
  }
  if (element.type === 'path' && element.boolean !== undefined) {
    const compound = element.boolean
    if (!compound || !['union', 'subtract', 'intersect', 'exclude'].includes(compound.operation) || !Array.isArray(compound.operands) || compound.operands.length < 2 || compound.operands.length > 2000) throw new Error('Invalid boolean compound')
    const ids = new Set<string>()
    for (const operand of compound.operands) {
      if (!operand || !['rectangle', 'ellipse', 'path'].includes(operand.type) || ids.has(operand.id)) throw new Error('Invalid boolean operand')
      ids.add(operand.id)
      validateElement(operand, depth + 1)
    }
  }
  if (element.type === 'text' && (typeof element.text !== 'string' || typeof element.fontFamily !== 'string' || ![element.fontSize, element.fontWeight, element.lineHeight, element.letterSpacing].every(Number.isFinite) || element.fontSize <= 0 || element.lineHeight <= 0 || element.fontWeight < 1 || element.fontWeight > 1000 || !['left', 'center', 'right'].includes(element.textAlign))) throw new Error('Invalid text')
  if (element.type === 'image' && (typeof element.src !== 'string' || typeof element.alt !== 'string' || !['cover', 'contain', 'fill'].includes(element.fit))) throw new Error('Invalid image')
}

export function createElement<T extends ElementType>(type: T, input: ElementInput<T> = {}): ElementOf<T> {
  if (Object.hasOwn(input, 'component')) throw new Error('Components are managed by the store')
  if (Object.hasOwn(input, 'children') || Object.hasOwn(input, 'zIndex')) throw new Error('Children and order are managed by the store')
  const defaults: Record<ElementType, object> = {
    frame: { children: [], clipContent: true, cornerRadius: 0 },
    rectangle: { cornerRadius: 0 },
    ellipse: {},
    path: { d: 'M 0 120 L 60 0 L 120 120 Z', viewBox: [0, 0, 120, 120], fillRule: 'nonzero' },
    text: { text: 'A new idea.', fontFamily: 'Inter, Matter, ui-sans-serif, system-ui, sans-serif', fontSize: 32, fontWeight: 400, lineHeight: 1.2, letterSpacing: -0.5, textAlign: 'left' },
    image: { src: '/favicon.svg', alt: 'Paper mark', fit: 'contain', cornerRadius: 0 },
  }
  const element = {
    id: crypto.randomUUID(), name: names[type], parentId: null, zIndex: 0,
    x: 0, y: 0, width: type === 'frame' ? 720 : type === 'text' ? 240 : 120,
    height: type === 'frame' ? 480 : type === 'text' ? 48 : 120,
    rotation: 0, visible: true, locked: false,
    ...defaults[type], ...input, type,
    style: { fill: type === 'text' ? '#080808' : type === 'frame' ? '#f5f4ee' : type === 'image' ? null : '#81adec', stroke: null, opacity: 1, shadow: null, ...input.style },
  } as SceneElement
  const normalized = element.type === 'path' && element.nodes ? { ...element, d: serializePath(element.nodes) } : element
  validateElement(normalized)
  return freezeElement(normalized) as ElementOf<T>
}
