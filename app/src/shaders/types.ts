import type { DitheringParams, DotOrbitParams, GrainGradientParams, HalftoneCmykParams, MeshGradientParams, MetaballsParams, NeuroNoiseParams } from '@paper-design/shaders-react'

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
export type ShaderPaint = { [K in ShaderKind]: ShaderMotion & { readonly kind: K; readonly params: ShaderParams[K] } }[ShaderKind]
export type ShaderValue = number | string | readonly string[]
export type ShaderControl =
  | { readonly key: string; readonly label: string; readonly type: 'number'; readonly min: number; readonly max: number; readonly step: number }
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
