import type { MeshAnchor, MeshMaterial, ShaderPaint } from './types.ts'
import { grainBlendModes } from './types.ts'

export const clampUnit = (value: number) => Math.max(0, Math.min(1, value))

export function defaultMeshAnchor(index: number): MeshAnchor {
  const angle = index * 2.3999632297 - Math.PI / 2
  return { x: .5 + Math.cos(angle) * .34, y: .5 + Math.sin(angle) * .34, radius: .65 }
}

export function createMeshMaterial(count: number): MeshMaterial {
  return { anchors: Array.from({ length: count }, (_, index) => defaultMeshAnchor(index)), turbulence: .15, frequency: 3, chromaticAberration: 0, grainBlend: 'overlay' }
}

export function validateMeshMaterial(mesh: MeshMaterial, paint: ShaderPaint) {
  const within = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
  if (paint.kind !== 'mesh-gradient' || !mesh || typeof mesh !== 'object' || Object.keys(mesh).length !== 5 || !Array.isArray(mesh.anchors) || mesh.anchors.length !== paint.params.colors.length || !within(mesh.turbulence, 0, 1) || !within(mesh.frequency, 1, 12) || !within(mesh.chromaticAberration, 0, 1) || !grainBlendModes.includes(mesh.grainBlend) || mesh.anchors.some(anchor => !anchor || Object.keys(anchor).length !== 3 || !within(anchor.x, 0, 1) || !within(anchor.y, 0, 1) || !within(anchor.radius, .1, 2))) throw new Error('Invalid shader mesh material')
}

/** Same transform as the fragment shader; handles stay aligned through material transforms. */
export function meshToSurface(anchor: Pick<MeshAnchor, 'x' | 'y'>, paint: ShaderPaint) {
  const angle = paint.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  const x = (anchor.x - .5) * paint.scale, y = (anchor.y - .5) * paint.scale
  return { x: .5 + c * x - s * y + paint.offsetX, y: .5 + s * x + c * y + paint.offsetY }
}

export function surfaceToMesh(point: Pick<MeshAnchor, 'x' | 'y'>, paint: ShaderPaint) {
  const angle = -paint.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  const x = point.x - .5 - paint.offsetX, y = point.y - .5 - paint.offsetY
  return { x: clampUnit(.5 + (c * x - s * y) / paint.scale), y: clampUnit(.5 + (s * x + c * y) / paint.scale) }
}

export function meshUniforms(paint: Extract<ShaderPaint, { kind: 'mesh-gradient' }>) {
  const mesh = paint.mesh ?? createMeshMaterial(paint.params.colors.length)
  const colors = paint.params.colors.map(hex => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255, hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1])
  return {
    u_count: colors.length,
    u_colors: Array.from({ length: 10 }, (_, i) => colors[i] ?? [0, 0, 0, 1]),
    u_anchors: Array.from({ length: 10 }, (_, i) => { const a = mesh.anchors[i] ?? defaultMeshAnchor(i); return [a.x, a.y, a.radius] }),
    u_turbulence: mesh.turbulence, u_frequency: mesh.frequency, u_chromatic: mesh.chromaticAberration,
    u_grainBlend: grainBlendModes.indexOf(mesh.grainBlend), u_distortion: paint.params.distortion,
    u_swirl: paint.params.swirl, u_grainMixer: paint.params.grainMixer, u_grainOverlay: paint.params.grainOverlay,
    u_scale: paint.scale, u_rotation: paint.rotation * Math.PI / 180, u_offset: [paint.offsetX, paint.offsetY],
  }
}

export interface RGBAColor {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

export function parseHexColor(hex: string): RGBAColor {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  if (clean.length === 3 || clean.length === 4) {
    const r = parseInt(clean[0] + clean[0], 16) / 255
    const g = parseInt(clean[1] + clean[1], 16) / 255
    const b = parseInt(clean[2] + clean[2], 16) / 255
    const a = clean.length === 4 ? parseInt(clean[3] + clean[3], 16) / 255 : 1
    return { r: Number.isFinite(r) ? r : 0, g: Number.isFinite(g) ? g : 0, b: Number.isFinite(b) ? b : 0, a: Number.isFinite(a) ? a : 1 }
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1
  return {
    r: Number.isFinite(r) ? r : 0,
    g: Number.isFinite(g) ? g : 0,
    b: Number.isFinite(b) ? b : 0,
    a: Number.isFinite(a) ? a : 1,
  }
}

export function toHexColor(color: RGBAColor): string {
  const r = Math.round(clampUnit(color.r) * 255).toString(16).padStart(2, '0')
  const g = Math.round(clampUnit(color.g) * 255).toString(16).padStart(2, '0')
  const b = Math.round(clampUnit(color.b) * 255).toString(16).padStart(2, '0')
  if (color.a < 0.999) {
    const a = Math.round(clampUnit(color.a) * 255).toString(16).padStart(2, '0')
    return `#${r}${g}${b}${a}`
  }
  return `#${r}${g}${b}`
}

/**
 * Calculates the exact interpolated color at normalized coordinate (x, y)
 * based on the GPU mesh fragment shader's Gaussian RBF inverse-distance field.
 */
export function interpolateMeshColor(
  anchors: readonly MeshAnchor[],
  colors: readonly string[],
  point: { x: number; y: number }
): string {
  if (colors.length === 0) return '#81adec'
  if (anchors.length === 0 || anchors.length !== colors.length) return colors[0] ?? '#81adec'

  let totalWeight = 0
  let r = 0, g = 0, b = 0, a = 0

  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]
    const color = parseHexColor(colors[i])
    const dx = point.x - anchor.x
    const dy = point.y - anchor.y
    const radius = Math.max(0.1, anchor.radius)
    // Same exponential Gaussian falloff as WebGL shader: exp(-d^2 * 8 / radius^2)
    const distSq = dx * dx + dy * dy
    const weight = Math.exp(-distSq * 8.0 / (radius * radius)) + 0.00001

    r += color.r * color.a * weight
    g += color.g * color.a * weight
    b += color.b * color.a * weight
    a += color.a * weight
    totalWeight += weight
  }

  if (totalWeight <= 0) return colors[0]
  const finalA = a / totalWeight
  const safeA = Math.max(0.0001, finalA)
  return toHexColor({
    r: (r / totalWeight) / safeA,
    g: (g / totalWeight) / safeA,
    b: (b / totalWeight) / safeA,
    a: finalA,
  })
}

/**
 * Interpolates an array of palette colors to targetCount colors evenly along the spectrum.
 */
export function interpolatePaletteColors(colors: readonly string[], targetCount: number): string[] {
  if (targetCount <= 0) return []
  if (colors.length === 0) return Array.from({ length: targetCount }, () => '#81adec')
  if (colors.length === 1 || targetCount === 1) return Array.from({ length: targetCount }, () => colors[0])

  const parsed = colors.map(parseHexColor)
  const result: string[] = []

  for (let i = 0; i < targetCount; i++) {
    const t = i / (targetCount - 1)
    const pos = t * (parsed.length - 1)
    const idx = Math.min(Math.floor(pos), parsed.length - 2)
    const frac = pos - idx
    const c1 = parsed[idx]
    const c2 = parsed[idx + 1]

    result.push(toHexColor({
      r: c1.r + (c2.r - c1.r) * frac,
      g: c1.g + (c2.g - c1.g) * frac,
      b: c1.b + (c2.b - c1.b) * frac,
      a: c1.a + (c2.a - c1.a) * frac,
    }))
  }

  return result
}

/**
 * Harmonizes and smooths color stops based on each anchor's position relative to all other stops.
 */
export function smoothMeshColors(anchors: readonly MeshAnchor[], colors: readonly string[]): string[] {
  if (anchors.length <= 2 || anchors.length !== colors.length) return [...colors]
  return anchors.map((anchor, i) => {
    // Other anchors without anchor i
    const others = anchors.filter((_, idx) => idx !== i)
    const otherColors = colors.filter((_, idx) => idx !== i)
    const fieldColor = parseHexColor(interpolateMeshColor(others, otherColors, anchor))
    const selfColor = parseHexColor(colors[i])
    // Blend 60% self + 40% surrounding field
    return toHexColor({
      r: selfColor.r * 0.6 + fieldColor.r * 0.4,
      g: selfColor.g * 0.6 + fieldColor.g * 0.4,
      b: selfColor.b * 0.6 + fieldColor.b * 0.4,
      a: selfColor.a * 0.6 + fieldColor.a * 0.4,
    })
  })
}

/**
 * Distributes count anchors in a balanced Cartesian grid within [0.15, 0.85].
 */
export function generateGridLayout(count: number): MeshAnchor[] {
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  return Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    const x = clampUnit(0.18 + (cols > 1 ? (c / (cols - 1)) * 0.64 : 0.32))
    const y = clampUnit(0.18 + (rows > 1 ? (r / (rows - 1)) * 0.64 : 0.32))
    return { x, y, radius: 0.65 }
  })
}

/**
 * Distributes count anchors in a circular radial pattern with center vertex.
 */
export function generateRadialLayout(count: number): MeshAnchor[] {
  if (count <= 1) return [{ x: 0.5, y: 0.5, radius: 0.75 }]
  const anchors: MeshAnchor[] = [{ x: 0.5, y: 0.5, radius: 0.75 }]
  const outer = count - 1
  for (let i = 0; i < outer; i++) {
    const angle = (i * 2 * Math.PI) / outer - Math.PI / 2
    anchors.push({
      x: clampUnit(0.5 + Math.cos(angle) * 0.36),
      y: clampUnit(0.5 + Math.sin(angle) * 0.36),
      radius: 0.6,
    })
  }
  return anchors
}

/**
 * Spiral distribution (default Paper anchor placement).
 */
export function generateSpiralLayout(count: number): MeshAnchor[] {
  return Array.from({ length: count }, (_, i) => defaultMeshAnchor(i))
}

export const MESH_PALETTE_PRESETS = [
  { name: 'Paper Warm', colors: ['#edebe1', '#81adec', '#516b94', '#222222'] },
  { name: 'Velvet Dusk', colors: ['#080808', '#4338ca', '#81adec', '#f43f5e', '#edebe1'] },
  { name: 'Solar Flare', colors: ['#222222', '#b45309', '#f59e0b', '#fde047', '#edebe1'] },
  { name: 'Cyber Neon', colors: ['#080808', '#06b6d4', '#81adec', '#ec4899', '#edebe1'] },
  { name: 'Forest Mist', colors: ['#080808', '#064e3b', '#10b981', '#81adec', '#edebe1'] },
  { name: 'Monochrome', colors: ['#080808', '#222222', '#555555', '#999999', '#edebe1'] },
] as const

