import type { DesignToken, LayerEffect, SharedStyleBindings, StyleLibrary, TokenBindings, TokenProperty } from '../tokens/types.ts'
import type { ShaderPaint } from '../shaders/types.ts'
import type { PathNodes } from './pathGeometry.ts'
import type { CommentDocument } from '../comments/types.ts'
import type { PrototypeDocument } from '../prototype/types.ts'

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
  readonly effects?: readonly LayerEffect[]
}

export interface BaseElement extends ElementGeometry {
  /** A vector or frame can clip its siblings without consuming its geometry. */
  readonly mask?: VectorMask
  /** Materialized symbols stay compatible with every renderer and export format. */
  readonly component?: ComponentLink
  /** Absent in legacy documents: both axes are fixed. */
  readonly sizing?: ElementSizing
  readonly tokenBindings?: TokenBindings
  readonly sharedStyleBindings?: SharedStyleBindings
  readonly id: string
  readonly name: string
  readonly parentId: string | null
  /** Sibling index, back to front. The store keeps this contiguous. */
  readonly zIndex: number
  readonly visible: boolean
  readonly locked: boolean
  readonly style: ElementStyle
}

export interface VectorMask {
  readonly enabled: boolean
  /** Editor-only outline, omitted from exports. */
  readonly showOutline: boolean
}

export interface FrameElement extends BaseElement {
  readonly type: 'frame'
  readonly children: readonly string[]
  readonly clipContent: boolean
  readonly cornerRadius: number
  /** Null or absent keeps free positioning. */
  readonly layout?: AutoLayout | null
}

export type SizingRule = 'fixed' | 'hug' | 'fill'
export interface ElementSizing {
  readonly width: SizingRule
  readonly height: SizingRule
  /** Positive share of available space on the parent's main axis. Defaults to 1. */
  readonly flexGrow?: number
  /** Bounds apply to fixed, hug and fill alike; absent means unconstrained. */
  readonly minWidth?: number
  readonly maxWidth?: number
  readonly minHeight?: number
  readonly maxHeight?: number
}
export interface LayoutPadding {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}
export interface AutoLayout {
  readonly direction: 'horizontal' | 'vertical'
  /** Absent on older documents means a single line. */
  readonly wrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
  /** Packs wrapped lines on the cross axis; absent means start. */
  readonly alignContent?: 'start' | 'center' | 'end' | 'space-between' | 'stretch'
  readonly gap: number
  readonly padding: LayoutPadding
  readonly justify: 'start' | 'center' | 'end' | 'space-between'
  readonly align: 'start' | 'center' | 'end'
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
  /** Editable subpaths, with handle constraints and unbaked corner radii. d is their rendered outline. */
  readonly nodes?: readonly PathNodes[]
  /** Editable sources; d is the cached, merged outline used by all renderers. */
  readonly boolean?: BooleanCompound
}

export type BooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude'
export type VectorElement = RectangleElement | EllipseElement | PathElement
export interface BooleanCompound {
  readonly operation: BooleanOperation
  /** Back to front, in the coordinate system of the compound's viewBox. */
  readonly operands: readonly VectorElement[]
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
export type ElementInput<T extends ElementType> = Partial<Omit<ElementOf<T>, 'component' | 'type' | 'children' | 'zIndex' | 'style'>> & { readonly style?: Partial<ElementStyle> }
export type ElementPatch<T extends ElementType> = T extends ElementType ? Partial<Omit<ElementOf<T>, 'mask' | 'component' | 'type' | 'id' | 'parentId' | 'children' | 'zIndex' | 'boolean' | 'style'>> & { readonly style?: Partial<ElementStyle> } : never

type OverrideProperties<T extends ElementType> = T extends ElementType ? Omit<ElementPatch<T>, 'style' | 'tokenBindings' | 'sharedStyleBindings'> : never
export interface ComponentOverrides {
  readonly sharedStyleBindings?: Readonly<Partial<Record<keyof SharedStyleBindings, string | null>>>
  readonly properties?: OverrideProperties<ElementType>
  /** Stroke channels override independently; a color edit still inherits width. */
  readonly style?: Partial<Omit<ElementStyle, 'stroke'>> & { readonly stroke?: Partial<Stroke> | null }
  /** Only local bindings are stored. Null releases a binding while retaining its value. */
  readonly tokenBindings?: Readonly<Partial<Record<TokenProperty, string | null>>>
}
export type ComponentPropertyValue = string | boolean
export type ComponentProperty = Readonly<{ id: string; name: string }> & (
  | { readonly kind: 'text'; readonly sourceId: string; readonly defaultValue: string }
  | { readonly kind: 'boolean'; readonly sourceId: string; readonly defaultValue: boolean }
  | { readonly kind: 'variant'; readonly defaultValue: string; readonly options: readonly ComponentVariant[] }
)
export interface ComponentVariant {
  readonly value: string
  /** Patches use master layer IDs; instance IDs never leak into definitions. */
  readonly layers: Readonly<Record<string, ComponentOverrides>>
}
export type ComponentLink = { readonly kind: 'master'; readonly properties?: readonly ComponentProperty[] } | {
  readonly kind: 'instance'
  readonly masterId: string
  readonly sourceId: string
  readonly instanceId: string
  readonly overrides: ComponentOverrides
  /** Stored on the instance root only. Absent entries inherit the current default. */
  readonly propertyValues?: Readonly<Record<string, ComponentPropertyValue>>
}

export interface SceneDocument {
  readonly version: 1
  readonly comments?: CommentDocument
  readonly prototype?: PrototypeDocument
  /** Absent in legacy documents. */
  readonly tokens?: readonly DesignToken[]
  readonly styleLibrary?: StyleLibrary
  readonly backgroundShader?: ShaderPaint | null
  readonly elements: Readonly<Record<string, SceneElement>>
  readonly rootIds: readonly string[]
}

export interface SceneSnapshot extends SceneDocument {
  readonly tokens: readonly DesignToken[]
  readonly styleLibrary: StyleLibrary
  readonly selection: readonly string[]
}
