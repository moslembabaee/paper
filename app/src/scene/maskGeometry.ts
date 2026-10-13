import type { Point } from '../canvas/types.ts'
import { isVector, vectorContainsPoint, vectorPathData } from './booleanGeometry.ts'
import { getWorldMatrix } from './geometry.ts'
import type { FrameElement, SceneElement, SceneSnapshot, VectorElement } from './types.ts'

export type MaskElement = VectorElement | FrameElement
export const canMask = (node: SceneElement): node is MaskElement => node.type === 'frame' || isVector(node)

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
