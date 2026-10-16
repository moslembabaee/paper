import type { BezierCurve, SpringParameters } from '../prototype/types.ts'

export type MotionTransformProperty = 'x' | 'y' | 'rotation' | 'scale' | 'opacity'
export type MotionShaderProperty =
  | 'shaderSpeed'
  | 'shaderScale'
  | 'shaderRotation'
  | 'shaderOffsetX'
  | 'shaderOffsetY'
  | 'shaderOpacity'

/** Translations and rotation are offsets from the design; scale is a multiplier; shader parameters modulate material uniforms. */
export type MotionProperty = MotionTransformProperty | MotionShaderProperty
export type MotionEasing = { readonly kind: 'bezier'; readonly curve: BezierCurve } | { readonly kind: 'spring'; readonly spring: SpringParameters }
export interface MotionKeyframe {
  readonly id: string
  readonly time: number
  readonly value: number
  /** Outgoing segment easing. The final keyframe retains it for later edits. */
  readonly easing: MotionEasing
}
export interface MotionTrack {
  readonly id: string
  readonly elementId: string
  readonly property: MotionProperty
  readonly enabled: boolean
  readonly keyframes: readonly MotionKeyframe[]
}
export interface MotionDocument {
  readonly duration: number
  readonly tracks: readonly MotionTrack[]
  readonly loop?: boolean
  readonly fps?: number
}
