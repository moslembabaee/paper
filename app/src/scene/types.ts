import type { DesignToken, TokenBindings } from '../tokens/types.ts'
import type { ShaderPaint } from '../shaders/types.ts'

/** Coordinates are relative to the parent frame. Rotation is in degrees. */
export interface ElementGeometry {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
}

export interface Stroke {
  readonly color: string
  readonly width: number
  readonly dash: readonly number[]
}

export interface Shadow {
  readonly color: string
  readonly x: number
  readonly y: number
  readonly blur: number
}

export interface ElementStyle {
  /** Optional to retain compatibility with version 1 documents. */
  readonly shader?: ShaderPaint | null
  /** Any CSS color; null means no paint. Text uses fill as its text color. */
  readonly fill: string | null
  readonly stroke: Stroke | null
  readonly opacity: number
  readonly shadow: Shadow | null
}

export interface BaseElement extends ElementGeometry {
  readonly tokenBindings?: TokenBindings
  readonly id: string
  readonly name: string
  readonly parentId: string | null
  /** Sibling index, back to front. The store keeps this contiguous. */
  readonly zIndex: number
  readonly visible: boolean
  readonly locked: boolean
  readonly style: ElementStyle
}

export interface FrameElement extends BaseElement {
  readonly type: 'frame'
  readonly children: readonly string[]
  readonly clipContent: boolean
  readonly cornerRadius: number
}

export interface RectangleElement extends BaseElement {
  readonly type: 'rectangle'
  readonly cornerRadius: number
}

export interface EllipseElement extends BaseElement { readonly type: 'ellipse' }

export interface PathElement extends BaseElement {
  readonly type: 'path'
  /** SVG path data, in the local coordinate system defined by viewBox. */
  readonly d: string
  readonly viewBox: readonly [number, number, number, number]
  readonly fillRule: 'nonzero' | 'evenodd'
}

export interface TextElement extends BaseElement {
  readonly type: 'text'
  readonly text: string
  readonly fontFamily: string
  readonly fontSize: number
  readonly fontWeight: number
  /** Unitless line height. */
  readonly lineHeight: number
  readonly letterSpacing: number
  readonly textAlign: 'left' | 'center' | 'right'
}

export interface ImageElement extends BaseElement {
  readonly type: 'image'
  readonly src: string
  readonly alt: string
  readonly fit: 'cover' | 'contain' | 'fill'
  readonly cornerRadius: number
}

export type SceneElement = FrameElement | RectangleElement | EllipseElement | PathElement | TextElement | ImageElement
export type ElementType = SceneElement['type']
export type ElementOf<T extends ElementType> = Extract<SceneElement, { type: T }>
export type ElementInput<T extends ElementType> = Partial<Omit<ElementOf<T>, 'type' | 'children' | 'zIndex' | 'style'>> & { readonly style?: Partial<ElementStyle> }
export type ElementPatch<T extends ElementType> = T extends ElementType ? Partial<Omit<ElementOf<T>, 'type' | 'id' | 'parentId' | 'children' | 'zIndex' | 'style'>> & { readonly style?: Partial<ElementStyle> } : never

export interface SceneDocument {
  readonly version: 1
  /** Absent in legacy documents. */
  readonly tokens?: readonly DesignToken[]
  readonly backgroundShader?: ShaderPaint | null
  readonly elements: Readonly<Record<string, SceneElement>>
  readonly rootIds: readonly string[]
}

export interface SceneSnapshot extends SceneDocument {
  readonly tokens: readonly DesignToken[]
  readonly selection: readonly string[]
}
