export type InteractionTrigger = 'click' | 'hover' | 'drag' | 'delay'
export type NavigationAction = 'navigate' | 'overlay' | 'scroll'
export type TransitionKind = 'instant' | 'dissolve' | 'smart' | 'slide-in' | 'slide-out'
export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'custom'
export type SlideDirection = 'left' | 'right' | 'up' | 'down'
export type DeviceFrame = 'none' | 'phone' | 'tablet' | 'desktop'
export type BezierCurve = readonly [number, number, number, number]

export interface PrototypeTransition {
  readonly kind: TransitionKind
  readonly duration: number
  readonly easing: Easing
  readonly curve: BezierCurve
  readonly direction: SlideDirection
}

export interface PrototypeInteraction {
  readonly id: string
  readonly sourceId: string
  readonly targetId: string
  readonly trigger: InteractionTrigger
  readonly action: NavigationAction
  readonly delay: number
  readonly transition: PrototypeTransition
}

export interface PrototypeDocument {
  readonly startFrameId: string | null
  readonly device: DeviceFrame
  readonly interactions: readonly PrototypeInteraction[]
}
