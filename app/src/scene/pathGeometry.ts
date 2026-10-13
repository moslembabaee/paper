import type { Point } from '../canvas/types.ts'

export interface PathAnchor extends Point { in?: Point; out?: Point }
export interface PathContour { anchors: PathAnchor[]; closed: boolean }
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

export function serializePath(contours: readonly PathContour[]): string {
  return contours.map(({ anchors, closed }) => {
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
  return { ...next, ...(anchor.in ? { in: shift(anchor.in) } : {}), ...(anchor.out ? { out: shift(anchor.out) } : {}) }
}
export function snapPathPoint(p: Point, enabled: boolean): Point { return enabled ? point(Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2) : p }
