import type { ElementInput, ElementOf, ElementType, SceneElement } from './types.ts'

const names: Record<ElementType, string> = { frame: 'Frame', rectangle: 'Rectangle', ellipse: 'Ellipse', path: 'Vector path', text: 'Text', image: 'Image' }

/** Freeze records at the boundary so consumers cannot corrupt the observable state. */
export function freezeElement(element: SceneElement): SceneElement {
  const style = Object.freeze({
    ...element.style,
    stroke: element.style.stroke ? Object.freeze({ ...element.style.stroke, dash: Object.freeze([...element.style.stroke.dash]) }) : null,
    shadow: element.style.shadow ? Object.freeze({ ...element.style.shadow }) : null,
  })
  if (element.type === 'frame') return Object.freeze({ ...element, style, children: Object.freeze([...element.children]) })
  if (element.type === 'path') return Object.freeze({ ...element, style, viewBox: Object.freeze([...element.viewBox]) as typeof element.viewBox })
  return Object.freeze({ ...element, style })
}

export function validateElement(element: SceneElement): void {
  if (typeof element.id !== 'string' || !element.id || typeof element.name !== 'string' || !element.name || (element.parentId !== null && typeof element.parentId !== 'string') || !['frame', 'rectangle', 'ellipse', 'path', 'text', 'image'].includes(element.type)) throw new Error('Invalid element identity')
  for (const key of ['x', 'y', 'width', 'height', 'rotation', 'zIndex'] as const) {
    if (!Number.isFinite(element[key])) throw new Error(`Invalid ${key}`)
  }
  if (element.width <= 0 || element.height <= 0 || !Number.isInteger(element.zIndex) || element.zIndex < 0) throw new Error('Invalid element dimensions or order')
  if (typeof element.visible !== 'boolean' || typeof element.locked !== 'boolean') throw new Error('Invalid element flags')
  const { fill, stroke, opacity, shadow } = element.style
  if ((fill !== null && typeof fill !== 'string') || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('Invalid fill or opacity')
  if (stroke && (typeof stroke.color !== 'string' || !Number.isFinite(stroke.width) || stroke.width < 0 || !Array.isArray(stroke.dash) || stroke.dash.some(n => !Number.isFinite(n) || n < 0))) throw new Error('Invalid stroke')
  if (shadow && (typeof shadow.color !== 'string' || ![shadow.x, shadow.y, shadow.blur].every(Number.isFinite) || shadow.blur < 0)) throw new Error('Invalid shadow')
  if ('cornerRadius' in element && (!Number.isFinite(element.cornerRadius) || element.cornerRadius < 0)) throw new Error('Invalid corner radius')
  if (element.type === 'frame' && (!Array.isArray(element.children) || typeof element.clipContent !== 'boolean')) throw new Error('Invalid frame')
  if (element.type === 'path' && (typeof element.d !== 'string' || !Array.isArray(element.viewBox) || element.viewBox.length !== 4 || !element.viewBox.every(Number.isFinite) || element.viewBox[2] <= 0 || element.viewBox[3] <= 0 || !['nonzero', 'evenodd'].includes(element.fillRule))) throw new Error('Invalid path')
  if (element.type === 'text' && (typeof element.text !== 'string' || typeof element.fontFamily !== 'string' || ![element.fontSize, element.fontWeight, element.lineHeight, element.letterSpacing].every(Number.isFinite) || element.fontSize <= 0 || element.lineHeight <= 0 || element.fontWeight < 1 || element.fontWeight > 1000 || !['left', 'center', 'right'].includes(element.textAlign))) throw new Error('Invalid text')
  if (element.type === 'image' && (typeof element.src !== 'string' || typeof element.alt !== 'string' || !['cover', 'contain', 'fill'].includes(element.fit))) throw new Error('Invalid image')
}

export function createElement<T extends ElementType>(type: T, input: ElementInput<T> = {}): ElementOf<T> {
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
  validateElement(element)
  return freezeElement(element) as ElementOf<T>
}
