import type { Point } from '../canvas/types.ts'

export type HandleType = 'mirrored' | 'asymmetric' | 'disconnected'
export type CurveMode = 'cubic' | 'quadratic'
export interface PathAnchor extends Point {
  in?: Point
  out?: Point
  handleType?: HandleType
  cornerRadius?: number
  curveMode?: CurveMode
}
export interface PathContour { anchors: PathAnchor[]; closed: boolean }
export interface PathNodes { readonly anchors: readonly PathAnchor[]; readonly closed: boolean }
export interface AnchorSelection { contour: number; anchor: number }
export const copyContours = (contours: readonly PathNodes[]): PathContour[] => contours.map(c => ({ ...c, anchors: c.anchors.map(a => ({ ...a, ...(a.in ? { in: { ...a.in } } : {}), ...(a.out ? { out: { ...a.out } } : {}) })) }))
const point = (x: number, y: number): Point => ({ x, y })
const reflect = (handle: Point, anchor: Point): Point => point(2 * anchor.x - handle.x, 2 * anchor.y - handle.y)
const format = (n: number) => Number(n.toFixed(4))
const pair = (p: Point) => `${format(p.x)} ${format(p.y)}`

/** SVG endpoint arcs normalized to cubic segments of at most 90 degrees. */
function arcCubics(start: Point, end: Point, radiusX: number, radiusY: number, rotation: number, large: number, sweep: number): [Point, Point, Point][] {
  let rx = Math.abs(radiusX), ry = Math.abs(radiusY)
  if (start.x === end.x && start.y === end.y) return []
  if (!rx || !ry) return [[start, end, end]]
  const phi = rotation * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi)
  const dx = (start.x - end.x) / 2, dy = (start.y - end.y) / 2
  const x = cos * dx + sin * dy, y = -sin * dx + cos * dy
  const scale = Math.sqrt(x * x / (rx * rx) + y * y / (ry * ry))
  if (scale > 1) { rx *= scale; ry *= scale }
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y * y - ry * ry * x * x) / (rx * rx * y * y + ry * ry * x * x)))
  const cx = factor * rx * y / ry, cy = -factor * ry * x / rx
  const center = point(cos * cx - sin * cy + (start.x + end.x) / 2, sin * cx + cos * cy + (start.y + end.y) / 2)
  const theta = Math.atan2((y - cy) / ry, (x - cx) / rx)
  let delta = Math.atan2((-y - cy) / ry, (-x - cx) / rx) - theta
  if (sweep && delta < 0) delta += Math.PI * 2
  if (!sweep && delta > 0) delta -= Math.PI * 2
  const count = Math.ceil(Math.abs(delta) / (Math.PI / 2)), step = delta / count
  const map = (a: number, b: number) => point(center.x + rx * cos * a - ry * sin * b, center.y + rx * sin * a + ry * cos * b)
  return Array.from({ length: count }, (_, index) => {
    const a = theta + step * index, b = a + step, alpha = 4 / 3 * Math.tan(step / 4)
    return [map(Math.cos(a) - alpha * Math.sin(a), Math.sin(a) + alpha * Math.cos(a)), map(Math.cos(b) + alpha * Math.sin(b), Math.sin(b) - alpha * Math.cos(b)), index === count - 1 ? end : map(Math.cos(b), Math.sin(b))]
  })
}

/** Keep the design anchors intact; round only straight corners in the rendered outline. */
export function roundPathContours(contours: readonly PathNodes[]): PathContour[] {
  return contours.map(({ anchors, closed }) => ({ closed, anchors: anchors.flatMap((a, i): PathAnchor[] => {
    const prev = anchors[(i + anchors.length - 1) % anchors.length], next = anchors[(i + 1) % anchors.length]
    if (!a.cornerRadius || a.in || a.out || prev?.out || next?.in || (!closed && (i === 0 || i === anchors.length - 1))) return [{ ...a }]
    const l1 = Math.hypot(prev.x - a.x, prev.y - a.y), l2 = Math.hypot(next.x - a.x, next.y - a.y)
    if (l1 < 1e-8 || l2 < 1e-8) return [{ ...a }]
    const u = point((prev.x - a.x) / l1, (prev.y - a.y) / l1), v = point((next.x - a.x) / l2, (next.y - a.y) / l2)
    const angle = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)))
    if (angle < 1e-5 || Math.PI - angle < 1e-5) return [{ ...a }]
    const tangent = Math.tan(angle / 2), trim = Math.min(a.cornerRadius / tangent, l1 / 2, l2 / 2)
    const handle = 4 / 3 * Math.tan((Math.PI - angle) / 4) * trim * tangent
    const entry = point(a.x + u.x * trim, a.y + u.y * trim), exit = point(a.x + v.x * trim, a.y + v.y * trim)
    return [{ ...entry, out: point(entry.x - u.x * handle, entry.y - u.y * handle) }, { ...exit, in: point(exit.x - v.x * handle, exit.y - v.y * handle) }]
  }) }))
}

export function serializePath(contours: readonly PathNodes[]): string {
  return roundPathContours(contours).map(({ anchors, closed }) => {
    if (!anchors.length) return ''
    let d = `M ${pair(anchors[0])}`
    const segment = (a: PathAnchor, b: PathAnchor) => a.out || b.in ? ` C ${pair(a.out ?? a)} ${pair(b.in ?? b)} ${pair(b)}` : ` L ${pair(b)}`
    for (let i = 1; i < anchors.length; i++) d += segment(anchors[i - 1], anchors[i])
    if (closed) { if (anchors.at(-1)!.out || anchors[0].in) d += segment(anchors.at(-1)!, anchors[0]); d += ' Z' }
    return d
  }).filter(Boolean).join(' ')
}

/** Normalize SVG lines, shorthand and quadratic curves into editable cubic anchors. */
export function parsePath(d: string): PathContour[] {
  const tokens = d.match(/[a-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) ?? []
  if (d.replace(/[a-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?|[\s,]/gi, '')) throw new Error('Invalid SVG path data.')
  const contours: PathContour[] = []
  let index = 0, command = '', current: PathContour | undefined, cursor = point(0, 0), previous = '', quadratic: Point | undefined
  const number = () => {
    const token = tokens[index++]
    if (token === undefined || /^[a-z]$/i.test(token) || !Number.isFinite(Number(token))) throw new Error('Invalid SVG path data.')
    return Number(token)
  }
  const flag = () => {
    const token = tokens[index]
    if (!token || !/^[01]/.test(token)) throw new Error('Invalid SVG arc flags.')
    // Arc flags are single characters; SVG permits both flags and the next
    // coordinate to be adjacent, such as "A50 50 0 01100 50".
    if (token.length === 1) index++
    else tokens[index] = token.slice(1)
    return Number(token[0])
  }
  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++]
    if (!command) throw new Error('A path must start with Move.')
    const op = command.toUpperCase(), relative = command !== op
    const readPoint = () => { const x = number(), y = number(); return point(x + (relative ? cursor.x : 0), y + (relative ? cursor.y : 0)) }
    const last = () => { if (!current?.anchors.length) throw new Error('A path must start with Move.'); return current.anchors.at(-1)! }
    if (op === 'Z') {
      if (!current) throw new Error('Invalid closed path.')
      const first = current.anchors[0], end = current.anchors.at(-1)!
      if (current.anchors.length > 1 && first.x === end.x && first.y === end.y) { first.in = end.in; current.anchors.pop() }
      current.closed = true; cursor = { ...first }; previous = op; quadratic = undefined; command = ''; continue
    }
    let end: Point, incoming: Point | undefined, outgoing: Point | undefined
    if (op === 'M') {
      end = readPoint(); current = { anchors: [{ ...end }], closed: false }; contours.push(current); cursor = end
      command = relative ? 'l' : 'L'; previous = op; quadratic = undefined; continue
    }
    if (previous === 'Z') {
      current = { anchors: [{ ...cursor }], closed: false }
      contours.push(current)
    }
    if (op === 'L') end = readPoint()
    else if (op === 'H') end = point(number() + (relative ? cursor.x : 0), cursor.y)
    else if (op === 'V') end = point(cursor.x, number() + (relative ? cursor.y : 0))
    else if (op === 'C') { outgoing = readPoint(); incoming = readPoint(); end = readPoint() }
    else if (op === 'S') { outgoing = /[CS]/.test(previous) && last().in ? reflect(last().in!, cursor) : cursor; incoming = readPoint(); end = readPoint() }
    else if (op === 'Q' || op === 'T') {
      const control: Point = op === 'Q' ? readPoint() : /[QT]/.test(previous) && quadratic ? reflect(quadratic, cursor) : cursor
      end = readPoint(); outgoing = point(cursor.x + 2 / 3 * (control.x - cursor.x), cursor.y + 2 / 3 * (control.y - cursor.y))
      incoming = point(end.x + 2 / 3 * (control.x - end.x), end.y + 2 / 3 * (control.y - end.y)); quadratic = control
    } else if (op === 'A') {
      last()
      const rx = number(), ry = number(), rotation = number(), large = flag(), sweep = flag()
      end = readPoint()
      for (const [out, incoming, target] of arcCubics(cursor, end, rx, ry, rotation, large, sweep)) {
        last().out = out; current!.anchors.push({ ...target, in: incoming })
      }
      cursor = end; previous = op; quadratic = undefined; continue
    } else throw new Error('Unsupported SVG path command.')
    if (outgoing) last().out = outgoing
    last(); current!.anchors.push({ ...end, ...(incoming ? { in: incoming } : {}) }); cursor = end; previous = op
    if (op !== 'Q' && op !== 'T') quadratic = undefined
  }
  return contours
}

export function pathBounds(contours: readonly PathContour[], padding = 1) {
  const points = contours.flatMap(contour => contour.anchors.flatMap(anchor => [anchor, ...(anchor.in ? [anchor.in] : []), ...(anchor.out ? [anchor.out] : [])]))
  if (!points.length) return { x: 0, y: 0, width: 1, height: 1 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }
  return { x: minX - padding, y: minY - padding, width: Math.max(1, maxX - minX + padding * 2), height: Math.max(1, maxY - minY + padding * 2) }
}

export function moveAnchor(anchor: PathAnchor, next: Point): PathAnchor {
  const delta = point(next.x - anchor.x, next.y - anchor.y)
  const shift = (handle: Point) => point(handle.x + delta.x, handle.y + delta.y)
  return { ...anchor, ...next, ...(anchor.in ? { in: shift(anchor.in) } : {}), ...(anchor.out ? { out: shift(anchor.out) } : {}) }
}
export function snapPathPoint(p: Point, enabled: boolean): Point { return enabled ? point(Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2) : p }

export function getHandleType(anchor: PathAnchor): HandleType {
  if (anchor.handleType) return anchor.handleType
  if (!anchor.in || !anchor.out) return 'disconnected'
  const a = point(anchor.in.x - anchor.x, anchor.in.y - anchor.y), b = point(anchor.out.x - anchor.x, anchor.out.y - anchor.y)
  const length = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)
  if (!length || Math.abs(a.x * b.y - a.y * b.x) > length * 1e-5 || a.x * b.x + a.y * b.y >= 0) return 'disconnected'
  return Math.hypot(a.x + b.x, a.y + b.y) < 1e-4 ? 'mirrored' : 'asymmetric'
}

export function setHandleType(contour: PathNodes, index: number, type: HandleType): PathAnchor {
  const a = contour.anchors[index], prev = contour.anchors[(index + contour.anchors.length - 1) % contour.anchors.length], next = contour.anchors[(index + 1) % contour.anchors.length]
  let direction = a.out ? point(a.out.x - a.x, a.out.y - a.y) : a.in ? point(a.x - a.in.x, a.y - a.in.y) : point(next.x - prev.x, next.y - prev.y)
  if (!Math.hypot(direction.x, direction.y)) direction = point(1, 0)
  const magnitude = Math.hypot(direction.x, direction.y), unit = point(direction.x / magnitude, direction.y / magnitude)
  const fallback = Math.max(8, Math.min(Math.hypot(prev.x - a.x, prev.y - a.y), Math.hypot(next.x - a.x, next.y - a.y)) / 3)
  const outLength = a.out ? Math.hypot(a.out.x - a.x, a.out.y - a.y) || fallback : a.in ? magnitude : fallback
  const inLength = type === 'mirrored' ? outLength : a.in ? Math.hypot(a.in.x - a.x, a.in.y - a.y) || fallback : fallback
  return { ...a, handleType: type, cornerRadius: 0,
    out: type === 'disconnected' && a.out ? { ...a.out } : point(a.x + unit.x * outLength, a.y + unit.y * outLength),
    in: type === 'disconnected' && a.in ? { ...a.in } : point(a.x - unit.x * inLength, a.y - unit.y * inLength),
  }
}

export function moveHandle(anchor: PathAnchor, handle: 'in' | 'out', target: Point, breakHandle = false): PathAnchor {
  const type = breakHandle ? 'disconnected' : getHandleType(anchor), other = handle === 'in' ? 'out' : 'in'
  const result = { ...anchor, [handle]: target, handleType: type, cornerRadius: 0 }
  const distance = Math.hypot(target.x - anchor.x, target.y - anchor.y)
  if (type !== 'disconnected' && distance > 1e-8) {
    const length = type === 'mirrored' ? distance : anchor[other] ? Math.hypot(anchor[other]!.x - anchor.x, anchor[other]!.y - anchor.y) : distance
    result[other] = point(anchor.x - (target.x - anchor.x) * length / distance, anchor.y - (target.y - anchor.y) * length / distance)
  } else if (type === 'mirrored') result[other] = { x: anchor.x, y: anchor.y }
  return result
}

const lerp = (a: Point, b: Point, t: number): Point => point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
export function segmentPoint(a: PathAnchor, b: PathAnchor, t: number): Point {
  if (!a.out && !b.in) return lerp(a, b, t)
  return lerp(lerp(lerp(a, a.out ?? a, t), lerp(a.out ?? a, b.in ?? b, t), t), lerp(lerp(a.out ?? a, b.in ?? b, t), lerp(b.in ?? b, b, t), t), t)
}

/** De Casteljau subdivision preserves the entire cubic, including closing segments. */
export function insertPathAnchor(contour: PathContour, segment: number, t: number): number {
  const next = (segment + 1) % contour.anchors.length, a = contour.anchors[segment], b = contour.anchors[next]
  t = Math.max(.001, Math.min(.999, t))
  let anchor: PathAnchor
  if (!a.out && !b.in) anchor = { ...lerp(a, b, t), cornerRadius: 0 }
  else {
    const p = lerp(a, a.out ?? a, t), q = lerp(a.out ?? a, b.in ?? b, t), r = lerp(b.in ?? b, b, t)
    const s = lerp(p, q, t), u = lerp(q, r, t)
    anchor = { ...lerp(s, u, t), in: s, out: u, handleType: 'asymmetric', cornerRadius: 0 }
    a.out = p; b.in = r
    // Subdivision changes handle lengths; retain tangent direction, not symmetry.
    if (getHandleType(a) === 'mirrored') a.handleType = 'asymmetric'
    if (getHandleType(b) === 'mirrored') b.handleType = 'asymmetric'
  }
  contour.anchors.splice(segment + 1, 0, anchor)
  return segment + 1
}

/** Search in screen coordinates so insertion has a constant target size at every zoom. */
export function nearestPathSegment(contours: readonly PathNodes[], target: Point, map: (p: Point) => Point, tolerance = 10): { contour: number; segment: number; t: number } | null {
  let best = tolerance * tolerance, hit: { contour: number; segment: number; t: number } | null = null
  contours.forEach((c, ci) => {
    const count = c.closed ? c.anchors.length : c.anchors.length - 1
    for (let i = 0; i < count; i++) {
      const sourceA = c.anchors[i], sourceB = c.anchors[(i + 1) % c.anchors.length]
      if (sourceA.cornerRadius || sourceB.cornerRadius) continue
      const a: PathAnchor = { ...map(sourceA), ...(sourceA.out ? { out: map(sourceA.out) } : {}) }, b: PathAnchor = { ...map(sourceB), ...(sourceB.in ? { in: map(sourceB.in) } : {}) }
      const hull = [a, b, a.out ?? a, b.in ?? b]
      if (target.x < Math.min(...hull.map(p => p.x)) - tolerance || target.x > Math.max(...hull.map(p => p.x)) + tolerance || target.y < Math.min(...hull.map(p => p.y)) - tolerance || target.y > Math.max(...hull.map(p => p.y)) + tolerance) continue
      const sample = (t: number) => { const p = segmentPoint(a, b, t); return (p.x - target.x) ** 2 + (p.y - target.y) ** 2 }
      const steps = a.out || b.in ? 48 : 1
      let previous: Point = a, coarseDistance = Infinity, approx = .5
      for (let j = 1; j <= steps; j++) {
        const end = segmentPoint(a, b, j / steps), dx = end.x - previous.x, dy = end.y - previous.y
        const fraction = Math.max(0, Math.min(1, ((target.x - previous.x) * dx + (target.y - previous.y) * dy) / (dx * dx + dy * dy || 1)))
        const distance = (previous.x + dx * fraction - target.x) ** 2 + (previous.y + dy * fraction - target.y) ** 2
        if (distance < coarseDistance) { coarseDistance = distance; approx = (j - 1 + fraction) / steps }
        previous = end
      }
      let t = approx
      if (steps > 1) {
        let low = Math.max(0, approx - 1 / steps), high = Math.min(1, approx + 1 / steps)
        for (let k = 0; k < 14; k++) { const l = low + (high - low) / 3, r = high - (high - low) / 3; if (sample(l) < sample(r)) high = r; else low = l }
        t = (low + high) / 2
      }
      const distance = sample(t)
      if (distance < best) { best = distance; hit = { contour: ci, segment: i, t } }
    }
  })
  return hit
}

/** Converts a quadratic control point (Q) into equivalent cubic Bézier incoming/outgoing handles. */
export function quadToCubicHandles(p0: Point, q: Point, p1: Point): { out: Point; in: Point } {
  return {
    out: point(p0.x + (2 / 3) * (q.x - p0.x), p0.y + (2 / 3) * (q.y - p0.y)),
    in: point(p1.x + (2 / 3) * (q.x - p1.x), p1.y + (2 / 3) * (q.y - p1.y)),
  }
}

/** Computes the quadratic Bézier apex control point Q from endpoints and cubic handles. */
export function cubicHandlesToQuadApex(p0: Point, out: Point, in_: Point, p1: Point): Point {
  const q1 = point(p0.x + 1.5 * (out.x - p0.x), p0.y + 1.5 * (out.y - p0.y))
  const q2 = point(p1.x + 1.5 * (in_.x - p1.x), p1.y + 1.5 * (in_.y - p1.y))
  return point((q1.x + q2.x) / 2, (q1.y + q2.y) / 2)
}

/** Interactively bends a path segment to match a target pointer point in cubic or quadratic mode. */
export function bendSegment(
  a: PathAnchor,
  b: PathAnchor,
  t: number,
  dragPoint: Point,
  mode: CurveMode = 'cubic'
): { out: Point; in: Point; quadApex?: Point } {
  const clampedT = Math.max(0.05, Math.min(0.95, t))
  if (mode === 'quadratic' || (!a.out && !b.in)) {
    // Solve for quadratic control point Q: P(t) = (1-t)^2*P0 + 2*(1-t)*t*Q + t^2*P1
    const denom = 2 * (1 - clampedT) * clampedT
    const qx = (dragPoint.x - (1 - clampedT) ** 2 * a.x - clampedT ** 2 * b.x) / denom
    const qy = (dragPoint.y - (1 - clampedT) ** 2 * a.y - clampedT ** 2 * b.y) / denom
    const quadApex = point(qx, qy)
    const { out, in: in_ } = quadToCubicHandles(a, quadApex, b)
    return { out, in: in_, quadApex }
  } else {
    // Cubic Bézier curvature distribution:
    const current = segmentPoint(a, b, clampedT)
    const delta = point(dragPoint.x - current.x, dragPoint.y - current.y)
    const factor = 4 / 3
    const w1 = factor * 2 * (1 - clampedT)
    const w2 = factor * 2 * clampedT
    const out = point((a.out?.x ?? a.x) + delta.x * w1, (a.out?.y ?? a.y) + delta.y * w1)
    const in_ = point((b.in?.x ?? b.x) + delta.x * w2, (b.in?.y ?? b.y) + delta.y * w2)
    return { out, in: in_ }
  }
}

/** Toggles an anchor between sharp corner (no handles) and smooth continuous curvature (mirrored handles). */
export function toggleNodeCornerSmooth(anchor: PathAnchor, contour: PathNodes, index: number): PathAnchor {
  if (anchor.in || anchor.out) {
    return {
      x: anchor.x,
      y: anchor.y,
      cornerRadius: anchor.cornerRadius ?? 0,
      handleType: 'disconnected',
    }
  } else {
    return setHandleType(contour, index, 'mirrored')
  }
}

/** Checks whether a path anchor represents a smooth continuous curvature node. */
export function isSmoothNode(anchor: PathAnchor): boolean {
  if (!anchor.in && !anchor.out) return false
  const type = getHandleType(anchor)
  return type === 'mirrored' || type === 'asymmetric'
}

/** Snaps a world point to 120px major or 24px minor engineering grid lines within screen tolerance. */
export function snapToGrid(
  p: Point,
  enabled: boolean,
  major = 120,
  minor = 24,
  screenTolerance = 8,
  zoom = 1
): { point: Point; snapped: boolean; type?: 'major' | 'minor' } {
  if (!enabled) return { point: p, snapped: false }
  const worldTol = screenTolerance / Math.max(zoom, 0.001)

  const snapCoord = (val: number, step: number): { value: number; snapped: boolean } => {
    const nearest = Math.round(val / step) * step
    if (Math.abs(val - nearest) <= worldTol) {
      return { value: nearest, snapped: true }
    }
    return { value: val, snapped: false }
  }

  const snapMajorX = snapCoord(p.x, major)
  const snapMajorY = snapCoord(p.y, major)

  if (snapMajorX.snapped || snapMajorY.snapped) {
    return {
      point: point(snapMajorX.value, snapMajorY.value),
      snapped: true,
      type: 'major',
    }
  }

  const snapMinorX = snapCoord(p.x, minor)
  const snapMinorY = snapCoord(p.y, minor)

  if (snapMinorX.snapped || snapMinorY.snapped) {
    return {
      point: point(snapMinorX.value, snapMinorY.value),
      snapped: true,
      type: 'minor',
    }
  }

  return { point: p, snapped: false }
}

/** Euclidean length between two points. */
export function segmentLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** Angle in degrees [0, 360) from a to b. */
export function segmentAngle(a: Point, b: Point): number {
  return ((Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) + 360) % 360
}

/** Estimates curvature radius (Menger curvature) through three points. */
export function curveRadius(p0: Point, p1: Point, p2: Point): number {
  const d01 = segmentLength(p0, p1)
  const d12 = segmentLength(p1, p2)
  const d02 = segmentLength(p0, p2)
  const area2 = Math.abs((p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x))
  if (area2 < 1e-6) return Infinity
  return (d01 * d12 * d02) / (2 * area2)
}

