import type { DitheringParams, DotOrbitParams, FlutedGlassParams, GrainGradientParams, HalftoneCmykParams, MeshGradientParams, MetaballsParams, NeuroNoiseParams, PerlinNoiseParams, WarpParams } from '@paper-design/shaders-react'

type Controls<T> = Readonly<Required<Omit<T, 'speed' | 'frame' | 'scale' | 'rotation' | 'offsetX' | 'offsetY' | 'fit' | 'originX' | 'originY' | 'worldWidth' | 'worldHeight'>>>
type Palette<T> = Omit<Controls<T>, 'colors'> & { readonly colors: readonly string[] }

export interface ShaderParams {
  'mesh-gradient': Palette<MeshGradientParams>
  'dot-orbit': Palette<DotOrbitParams>
  'grain-gradient': Palette<GrainGradientParams>
  'halftone-cmyk': Omit<Controls<HalftoneCmykParams>, 'image'> & { readonly image: string }
  'neuro-noise': Controls<NeuroNoiseParams>
  gooey: Palette<MetaballsParams>
  dithering: Controls<DitheringParams>
  'perlin-noise': Controls<PerlinNoiseParams>
  'liquid-distortion': Palette<WarpParams>
  'glass-refraction': Omit<Controls<FlutedGlassParams>, 'image' | 'margin'> & { readonly image: string }
}
export type ShaderKind = keyof ShaderParams
export interface ShaderMotion {
  readonly animated: boolean
  readonly speed: number
  /** Deterministic starting time in milliseconds; also the static frame. */
  readonly frame: number
  readonly scale: number
  readonly rotation: number
  readonly offsetX: number
  readonly offsetY: number
}
export const shaderBlendModes = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'darken', 'lighten', 'color-dodge', 'color-burn', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'] as const
export type ShaderBlendMode = typeof shaderBlendModes[number]
export interface ShaderComposite {
  readonly blendMode: ShaderBlendMode
  /** Material opacity is independent of the layer's opacity. */
  readonly opacity: number
}
export interface MeshAnchor {
  readonly x: number
  readonly y: number
  readonly radius: number
}
export const grainBlendModes = ['overlay', 'soft-light', 'multiply', 'screen'] as const
export interface MeshMaterial {
  /** One normalized, top-left-origin anchor per palette color. */
  readonly anchors: readonly MeshAnchor[]
  readonly turbulence: number
  readonly frequency: number
  readonly chromaticAberration: number
  readonly grainBlend: typeof grainBlendModes[number]
}
export type ShaderPaint = { [K in ShaderKind]: ShaderMotion & { readonly kind: K; readonly params: ShaderParams[K]; readonly composite?: ShaderComposite; readonly mesh?: MeshMaterial } }[ShaderKind]
export type ShaderValue = number | string | readonly string[]
export type ShaderControl =
  | { readonly key: string; readonly label: string; readonly type: 'number'; readonly min: number; readonly max: number; readonly step: number; readonly integer?: boolean }
  | { readonly key: string; readonly label: string; readonly type: 'select'; readonly options: readonly string[] }
  | { readonly key: string; readonly label: string; readonly type: 'color' }
  | { readonly key: string; readonly label: string; readonly type: 'image' }
  | { readonly key: string; readonly label: string; readonly type: 'palette'; readonly max: number }
export interface ShaderDefinition<K extends ShaderKind = ShaderKind> {
  readonly label: string
  readonly description: string
  readonly defaults: ShaderParams[K]
  readonly controls: readonly ShaderControl[]
}
