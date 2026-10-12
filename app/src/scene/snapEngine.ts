import type { Bounds } from '../canvas/types.ts'

export interface SnapGuide {
  /** A horizontal line has constant y; a vertical line has constant x. */
  axis: 'h' | 'v'
  value: number
  span: [number, number]
  /** Equal-spacing guides include end ticks and a world-distance label. */
  distance?: number
}
export interface SnapResult { dx: number; dy: number; guides: SnapGuide[] }
export interface SnapOptions {
  xAnchors?: readonly number[]
  yAnchors?: readonly number[]
  distances?: boolean
}
const anchors = [0, .5, 1] as const
const epsilon = 1e-6

/** Threshold is in world units, so callers can keep an 8px screen tolerance. */
export function computeSnap(moving: Bounds, targets: readonly Bounds[], threshold: number, options: SnapOptions = {}): SnapResult {
  const xAnchors = options.xAnchors ?? anchors, yAnchors = options.yAnchors ?? anchors
  let dx = 0, dy = 0, bestX = threshold + epsilon, bestY = threshold + epsilon
  let distanceX: SnapGuide[] = [], distanceY: SnapGuide[] = []
  const consider = (axis: 'x' | 'y', delta: number, guides: SnapGuide[] = []) => {
    const best = axis === 'x' ? bestX : bestY
    if (Math.abs(delta) > threshold || Math.abs(delta) >= best) return
    if (axis === 'x') { dx = delta; bestX = Math.abs(delta); distanceX = guides }
    else { dy = delta; bestY = Math.abs(delta); distanceY = guides }
  }
  for (const target of targets) {
    for (const m of xAnchors) for (const t of anchors) consider('x', target.x + target.width * t - moving.x - moving.width * m)
    for (const m of yAnchors) for (const t of anchors) consider('y', target.y + target.height * t - moving.y - moving.height * m)
  }

  if (options.distances !== false) {
    for (const axis of ['x', 'y'] as const) {
      if (!(axis === 'x' ? xAnchors : yAnchors).length) continue
      const cross = axis === 'x' ? 'y' : 'x'
      const size = axis === 'x' ? 'width' : 'height'
      const crossSize = axis === 'x' ? 'height' : 'width'
      const relevant = targets.filter(t => t[cross] < moving[cross] + moving[crossSize] && t[cross] + t[crossSize] > moving[cross]).sort((a, b) => a[axis] - b[axis])
      const gapGuide = (start: number, end: number, distance: number): SnapGuide => ({ axis: axis === 'x' ? 'h' : 'v', value: moving[cross] + moving[crossSize] / 2, span: [start, end], distance })
      for (let i = 1; i < relevant.length; i++) {
        const a = relevant[i - 1], b = relevant[i]
        const aEnd = a[axis] + a[size], bEnd = b[axis] + b[size]
        const gap = b[axis] - aEnd
        if (gap < 0 || Math.min(a[cross] + a[crossSize], b[cross] + b[crossSize]) <= Math.max(a[cross], b[cross])) continue
        const before = a[axis] - gap - moving[size], after = bEnd + gap
        consider(axis, before - moving[axis], [gapGuide(before + moving[size], a[axis], gap), gapGuide(aEnd, b[axis], gap)])
        consider(axis, after - moving[axis], [gapGuide(aEnd, b[axis], gap), gapGuide(bEnd, after, gap)])
        if (gap >= moving[size]) {
          const space = (gap - moving[size]) / 2, between = aEnd + space
          consider(axis, between - moving[axis], [gapGuide(aEnd, between, space), gapGuide(between + moving[size], b[axis], space)])
        }
      }
    }
  }

  const snapped = { ...moving, x: moving.x + dx, y: moving.y + dy }
  const guides: SnapGuide[] = []
  // Keep guides visible at exact alignment, including zero correction.
  for (const target of targets) {
    if (bestX <= threshold) for (const m of xAnchors) for (const t of anchors) {
      const value = target.x + target.width * t
      if (Math.abs(value - snapped.x - snapped.width * m) < epsilon) guides.push({ axis: 'v', value, span: [Math.min(snapped.y, target.y), Math.max(snapped.y + snapped.height, target.y + target.height)] })
    }
    if (bestY <= threshold) for (const m of yAnchors) for (const t of anchors) {
      const value = target.y + target.height * t
      if (Math.abs(value - snapped.y - snapped.height * m) < epsilon) guides.push({ axis: 'h', value, span: [Math.min(snapped.x, target.x), Math.max(snapped.x + snapped.width, target.x + target.width)] })
    }
  }
  guides.push(...distanceX.map(g => g.axis === 'h' ? { ...g, value: g.value + dy } : g), ...distanceY.map(g => g.axis === 'v' ? { ...g, value: g.value + dx } : g))
  const unique = new Map<string, SnapGuide>()
  for (const guide of guides) unique.set(`${guide.axis}:${guide.value}:${guide.span.join(':')}:${guide.distance ?? ''}`, guide)
  return { dx, dy, guides: [...unique.values()] }
}
