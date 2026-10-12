import type { Bounds } from '../canvas/types'
import type { SceneSnapshot } from './types'

type Matrix = readonly [number, number, number, number, number, number]
const identity: Matrix = [1, 0, 0, 1, 0, 0]
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
]

/** Match the renderer's center-origin rotation through every ancestor frame. */
export function getWorldMatrix(state: SceneSnapshot, id: string): Matrix {
  const node = state.elements[id]
  if (!node) throw new Error(`Unknown element: ${id}`)
  const radians = node.rotation * Math.PI / 180
  const cos = Math.cos(radians), sin = Math.sin(radians)
  const cx = node.width / 2, cy = node.height / 2
  const local: Matrix = [cos, sin, -sin, cos, node.x + cx - cos * cx + sin * cy, node.y + cy - sin * cx - cos * cy]
  return multiply(node.parentId === null ? identity : getWorldMatrix(state, node.parentId), local)
}

export function getWorldBounds(state: SceneSnapshot, id: string): Bounds {
  const node = state.elements[id]
  if (!node) throw new Error(`Unknown element: ${id}`)
  const [a, b, c, d, e, f] = getWorldMatrix(state, id)
  const corners = [[0, 0], [node.width, 0], [node.width, node.height], [0, node.height]]
  const xs = corners.map(([x, y]) => a * x + c * y + e)
  const ys = corners.map(([x, y]) => b * x + d * y + f)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}
