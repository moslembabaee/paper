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
