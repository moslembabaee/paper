import type { Point } from '../canvas/types.ts'
import { parsePath, serializePath } from './pathGeometry.ts'
import type { PathContour } from './pathGeometry.ts'
import type { ShapedText } from './fontEngine.ts'
import type { KineticTypography, TextElement } from './types.ts'
import { textAnchorForPath, textPathOffset } from './typography.ts'

export const DEFAULT_KINETIC: KineticTypography = Object.freeze({ enabled: true, playing: true, amplitude: 18, rotation: 8, duration: 2.4, stagger: 70, phase: 0 })
interface Sample extends Point { distance: number }

/** Adaptive arc-length table: handle arbitrary cubic, quadratic and SVG arc baselines. */
export function createBaseline(d: string) {
  const contour = parsePath(d)[0]
  const samples: Sample[] = []
  let length = 0
  const append = (p: Point, connect = true) => {
    const last = samples.at(-1)
    if (last && connect) length += Math.hypot(p.x - last.x, p.y - last.y)
    samples.push({ ...p, distance: length })
  }
  const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const flatten = (a: Point, b: Point, c: Point, e: Point, depth: number) => {
    const chord = Math.hypot(e.x - a.x, e.y - a.y)
    const polygon = Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y) + Math.hypot(e.x - c.x, e.y - c.y)
    if (depth >= 14 || polygon - chord < .005) { append(e); return }
    const ab = middle(a, b), bc = middle(b, c), ce = middle(c, e), abc = middle(ab, bc), bce = middle(bc, ce), mid = middle(abc, bce)
    flatten(a, ab, abc, mid, depth + 1); flatten(mid, bce, ce, e, depth + 1)
  }
  if (contour?.anchors.length) {
    append(contour.anchors[0], false)
    const count = contour.anchors.length - (contour.closed ? 0 : 1)
    for (let i = 0; i < count; i++) {
      const a = contour.anchors[i], b = contour.anchors[(i + 1) % contour.anchors.length]
      if (a.out || b.in) flatten(a, a.out ?? a, b.in ?? b, b, 0)
      else append(b)
    }
  }
  return {
    length,
    at(distance: number) {
      if (samples.length < 2) return { x: samples[0]?.x ?? 0, y: samples[0]?.y ?? 0, angle: 0 }
      let low = 1, high = samples.length - 1
      const clamped = Math.max(0, Math.min(length, distance))
      while (low < high) { const mid = (low + high) >> 1; if (samples[mid].distance < clamped) low = mid + 1; else high = mid }
      const a = samples[low - 1], b = samples[low]
      const t = (clamped - a.distance) / (b.distance - a.distance || 1)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI }
    },
  }
}

export interface GlyphPlacement { d: string; x: number; y: number; angle: number; origin: number; dx: number; dy: number; scale: number; index: number }
export function placeGlyphs(node: TextElement, shaped: ShapedText, unitsPerEm: number, pathD = ''): GlyphPlacement[] {
  const baseline = node.textOnPath?.enabled ? createBaseline(pathD) : null
  const anchor = textAnchorForPath(node.textOnPath?.align, node.textAlign)
  const result: GlyphPlacement[] = []
  let index = 0
  shaped.lines.forEach((line, lineIndex) => {
    let cursor = baseline ? baseline.length * textPathOffset(node) / 100 - (anchor === 'middle' ? line.width / 2 : anchor === 'end' ? line.width : 0)
      : node.textAlign === 'center' ? (node.width - line.width) / 2 : node.textAlign === 'right' ? node.width - line.width : 0
    line.glyphs.forEach(glyph => {
      const center = cursor + glyph.advance / 2
      const position = baseline?.at(center) ?? { x: center, y: shaped.baseline + lineIndex * node.fontSize * node.lineHeight, angle: 0 }
      if (!baseline || (center >= 0 && center <= baseline.length)) result.push({ d: glyph.d, ...position, origin: -glyph.advance / 2, dx: glyph.dx, dy: glyph.dy, scale: node.fontSize / unitsPerEm, index })
      index++; cursor += glyph.advance
    })
  })
  return result
}

/** Matches the quarter-cycle CSS keyframes, so the phase slider and outlines agree. */
export function cascadeOffset(kinetic: KineticTypography | undefined, index: number) {
  if (!kinetic?.enabled) return { y: 0, angle: 0 }
  const cycle = ((kinetic.phase + index * kinetic.stagger / (kinetic.duration * 1000)) % 1 + 1) % 1
  const wave = cycle < .25 ? -4 * cycle : cycle < .75 ? 4 * cycle - 2 : 4 - 4 * cycle
  return { y: wave * kinetic.amplitude, angle: wave * kinetic.rotation }
}

/** Bake the displayed phase into native editable cubic outlines, preserving glyph holes. */
export function glyphOutlines(glyphs: readonly GlyphPlacement[], kinetic?: KineticTypography): string {
  const contours: PathContour[] = []
  for (const glyph of glyphs) {
    const offset = cascadeOffset(kinetic, glyph.index)
    const angle = glyph.angle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
    const spin = offset.angle * Math.PI / 180, sc = Math.cos(spin), ss = Math.sin(spin)
    const transform = (point: Point): Point => {
      const gx = point.x * glyph.scale + glyph.origin + glyph.dx, gy = -point.y * glyph.scale + glyph.dy
      const x = gx * sc - gy * ss, y = gx * ss + gy * sc + offset.y
      return { x: glyph.x + x * cos - y * sin, y: glyph.y + x * sin + y * cos }
    }
    for (const contour of parsePath(glyph.d)) contours.push({ closed: contour.closed, anchors: contour.anchors.map(anchor => ({ ...transform(anchor), ...(anchor.in ? { in: transform(anchor.in) } : {}), ...(anchor.out ? { out: transform(anchor.out) } : {}) })) })
  }
  return serializePath(contours)
}
