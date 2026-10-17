import type { Point } from '../canvas/types.ts'
import { isVector, vectorContainsPoint, vectorPathData } from './booleanGeometry.ts'
import { getWorldMatrix } from './geometry.ts'
import type { FrameElement, MaskClipMode, SceneElement, SceneSnapshot, VectorElement } from './types.ts'

export type MaskElement = VectorElement | FrameElement
export const canMask = (node: SceneElement): node is MaskElement => node.type === 'frame' || isVector(node)

export const isVectorMask = (node: MaskElement): boolean => !node.mask?.mode || node.mask.mode === 'vector'
export const isAlphaMask = (node: MaskElement): boolean => node.mask?.mode === 'alpha'
export const isLuminanceMask = (node: MaskElement): boolean => node.mask?.mode === 'luminance'
export const maskLuminanceThreshold = (node: MaskElement): number => node.mask?.luminanceThreshold ?? 0.5
export const isMaskInverted = (node: MaskElement): boolean => Boolean(node.mask?.inverted)

/** Calculate perceived luminance (0..1) from a CSS or hex color string */
export function hexOrColorToLuminance(color: string | null | undefined): number {
  if (!color || color === 'none' || color === 'transparent') return 0
  const trimmed = color.trim()
  if (trimmed.startsWith('#')) {
    let hex = trimmed.slice(1)
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255
      const g = parseInt(hex.slice(2, 4), 16) / 255
      const b = parseInt(hex.slice(4, 6), 16) / 255
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
  }
  const rgbMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10) / 255
    const g = parseInt(rgbMatch[2], 10) / 255
    const b = parseInt(rgbMatch[3], 10) / 255
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  return 1
}

/** Check if world coordinate is within the effective visible region of a mask (accounting for alpha and luminance threshold modes) */
export function maskContainsWorldPoint(state: SceneSnapshot, mask: MaskElement, world: Point): boolean {
  const geomInside = shapeContainsWorldPoint(state, mask, world)
  const mode: MaskClipMode = mask.mask?.mode ?? 'vector'
  const inverted = Boolean(mask.mask?.inverted)

  if (mode === 'vector') {
    return inverted ? !geomInside : geomInside
  }

  if (mode === 'alpha') {
    if (!geomInside) return inverted
    const opacity = (mask.style.opacity ?? 1) * (mask.style.fill === 'none' ? 0 : 1)
    const hasAlpha = opacity > 0.01
    return inverted ? !hasAlpha : hasAlpha
  }

  if (mode === 'luminance') {
    if (!geomInside) return inverted
    const lum = hexOrColorToLuminance(mask.style.fill)
    const threshold = mask.mask?.luminanceThreshold ?? 0.5
    const passes = lum >= threshold
    return inverted ? !passes : passes
  }

  return inverted ? !geomInside : geomInside
}

/** A role lives on the source itself, so cloning/components need no ID remapping. */
export function frameMask(elements: Readonly<Record<string, SceneElement>>, frame: FrameElement): MaskElement | undefined {
  return frame.children.map(id => elements[id]).find((node): node is MaskElement => !!node?.mask?.enabled && node.visible && canMask(node))
}

const frameVectors = new WeakMap<FrameElement, VectorElement>()
function maskVector(node: MaskElement): VectorElement {
  if (node.type !== 'frame') return node
  let vector = frameVectors.get(node)
  if (!vector) {
    vector = { ...node, type: 'rectangle', style: { ...node.style, stroke: null } }
    frameVectors.set(node, vector)
  }
  return vector
}

const outlines = new WeakMap<MaskElement, string>()
export function maskPathData(node: MaskElement): string {
  let d = outlines.get(node)
  if (d === undefined) { d = vectorPathData(maskVector(node)); outlines.set(node, d) }
  return d
}
export const maskFillRule = (node: MaskElement) => node.type === 'path' ? node.fillRule : 'nonzero'

export const isCompoundMask = (node: MaskElement): boolean => node.type === 'path' && !!node.boolean

export function worldToLocal(state: SceneSnapshot, id: string, world: Point): Point {
  const [a, b, c, d, e, f] = getWorldMatrix(state, id)
  const det = a * d - b * c, dx = world.x - e, dy = world.y - f
  return { x: (d * dx - c * dy) / det, y: (-b * dx + a * dy) / det }
}

export function shapeContainsWorldPoint(state: SceneSnapshot, node: SceneElement, world: Point): boolean {
  if (canMask(node)) {
    const parentPoint = node.parentId === null ? world : worldToLocal(state, node.parentId, world)
    return vectorContainsPoint(maskVector(node), parentPoint)
  }
  const p = worldToLocal(state, node.id, world)
  return p.x >= 0 && p.y >= 0 && p.x <= node.width && p.y <= node.height
}

export function validateMaskGraph(elements: Readonly<Record<string, SceneElement>>): void {
  for (const node of Object.values(elements)) {
    if (node.type === 'frame' && node.children.filter(id => elements[id]?.mask).length > 1) throw new Error('A frame can have only one mask source')
  }
}
