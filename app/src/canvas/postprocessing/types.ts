export type PostProcessPassType =
  | 'bloom'
  | 'chromatic-aberration'
  | 'film-grain'
  | 'vignette'
  | 'color-grade'

export const postProcessPassTypes: readonly PostProcessPassType[] = [
  'bloom',
  'chromatic-aberration',
  'film-grain',
  'vignette',
  'color-grade',
] as const

export interface BloomPassParams {
  /** Luminance cutoff threshold below which pixels do not bleed (0 to 1). */
  readonly threshold: number
  /** Strength multiplier of the blurred glow composite (0 to 3). */
  readonly intensity: number
  /** Kernel spread radius of the bloom blur (0 to 2). */
  readonly radius: number
  /** Softness knee for gradual threshold falloff (0 to 1). */
  readonly knee: number
}

export interface FilmGrainPassParams {
  /** Opacity / amplitude of procedural film stock noise (0 to 1). */
  readonly intensity: number
  /** Grain particle physical scale in canvas pixels (0.5 to 5). */
  readonly size: number
  /** Animation speed of temporal jitter (0 to 3). */
  readonly speed: number
  /** Whether the grain updates dynamically at 60fps or stays fixed. */
  readonly temporal: boolean
  /** Single-channel luminance grain vs tri-color RGB grain. */
  readonly monochrome: boolean
}

export interface ChromaticAberrationPassParams {
  /** Channel offset distance multiplier (0 to 1). */
  readonly intensity: number
  /** Relative spectral spread between R, G, and B bands (0 to 1). */
  readonly spread: number
  /** True for radial dispersion from viewport center; false for directional angle. */
  readonly radial: boolean
  /** Angle in degrees when directional mode is active (0 to 360). */
  readonly angle: number
}

export interface VignettePassParams {
  /** Darkness attenuation at outer corners (0 to 1). */
  readonly intensity: number
  /** Normalized radius where falloff starts (0 to 1.5). */
  readonly radius: number
  /** Feather softness of the gradient edge (0 to 1). */
  readonly smoothness: number
  /** Aspect ratio compensation (1.0 = circular, <1.0 = elliptical). */
  readonly roundness: number
  /** Hex color tint for shadow falloff (defaults to #080808). */
  readonly color: string
}

export interface ColorGradePassParams {
  readonly contrast: number
  readonly brightness: number
  readonly saturation: number
  readonly exposure: number
  readonly tint: string
}

export interface PostProcessPassParamsMap {
  bloom: BloomPassParams
  'chromatic-aberration': ChromaticAberrationPassParams
  'film-grain': FilmGrainPassParams
  vignette: VignettePassParams
  'color-grade': ColorGradePassParams
}

export type PostProcessPass<T extends PostProcessPassType = PostProcessPassType> = { [K in T]: {
  readonly id: string
  readonly type: K
  readonly name: string
  readonly enabled: boolean
  readonly opacity: number
  readonly blendMode: 'normal' | 'screen' | 'multiply' | 'overlay'
  readonly params: PostProcessPassParamsMap[K]
} }[T]

export interface CanvasPostProcessingPipeline {
  readonly version: 1
  readonly enabled: boolean
  readonly preset: string
  readonly passes: readonly PostProcessPass[]
}

export interface PostProcessingPreset {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly createPipeline: () => CanvasPostProcessingPipeline
}
