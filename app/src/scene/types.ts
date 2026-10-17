import type { MotionDocument } from '../motion/types.ts'
import type { DesignToken, LayerEffect, SharedStyleBindings, StyleLibrary, TokenBindings, TokenProperty } from '../tokens/types.ts'
import type { ShaderPaint } from '../shaders/types.ts'
import type { PathNodes } from './pathGeometry.ts'
import type { CommentDocument } from '../comments/types.ts'
import type { PrototypeDocument, SpringParameters } from '../prototype/types.ts'
import type { ElementPhysicsConfig, PhysicsDocument } from '../physics/types.ts'

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
  /** Real-time 2D spring dynamics physics properties */
  readonly physics?: ElementPhysicsConfig
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

export interface VariableFontAxes {
  /** Weight axis (wght): 1 to 1000 */
  readonly wght?: number
  /** Width axis (wdth): 25 to 200 (%) */
  readonly wdth?: number
  /** Slant axis (slnt): -90 to +90 (degrees) */
  readonly slnt?: number
  /** Optical size axis (opsz): in points/px (typically 6 to 144) */
  readonly opsz?: number
  /** Grade axis (GRAD): -200 to +200 */
  readonly grad?: number
  /** Casual axis (CASL): 0 to 1 */
  readonly casl?: number
  /** Cursive axis (CRSV): 0 to 1 */
  readonly crsv?: number
  /** Italic axis (ital): 0 to 1 */
  readonly ital?: number
  /** Fill axis (FILL): 0 to 1 */
  readonly fill?: number
  /** Softness axis (SOFT): 0 to 100 */
  readonly soft?: number
  /** Additional custom or registered variable axes */
  readonly [axisTag: string]: number | undefined
}

export type FontKerningMode = 'auto' | 'normal' | 'none' | 'optical'

export interface OpenTypeFeatures {
  /** Standard Ligatures (liga) */
  readonly liga?: boolean
  /** Discretionary Ligatures (dlig) */
  readonly dlig?: boolean
  /** Contextual Alternates (calt) */
  readonly calt?: boolean
  /** Small Capitals (smcp) */
  readonly smcp?: boolean
  /** Capitals to Small Caps (c2sc) */
  readonly c2sc?: boolean
  /** Slashed Zero (zero) */
  readonly zero?: boolean
  /** Fractions (frac) */
  readonly frac?: boolean
  /** Ordinals (ordn) */
  readonly ordn?: boolean
  /** Tabular Numbers (tnum) */
  readonly tnum?: boolean
  /** Proportional Numbers (pnum) */
  readonly pnum?: boolean
  /** Oldstyle Figures (onum) */
  readonly onum?: boolean
  /** Lining Figures (lnum) */
  readonly lnum?: boolean
  /** Kerning (kern) */
  readonly kern?: boolean
  /** Stylistic Sets */
  readonly ss01?: boolean
  readonly ss02?: boolean
  readonly ss03?: boolean
  readonly ss04?: boolean
  /** Swashes (swsh) */
  readonly swsh?: boolean
  /** Stylistic Alternates (salt) */
  readonly salt?: boolean
  /** Titling Alternates (titl) */
  readonly titl?: boolean
  /** Additional OpenType feature tags */
  readonly [featureTag: string]: boolean | undefined
}

export type TextPathPreset = 'custom' | 'wave' | 'arc' | 'circle' | 'scurve' | 'spiral' | 'banner' | 'zigzag'

export interface TextOnPath {
  readonly enabled: boolean
  /** Reference to a Vector node (path, rectangle, ellipse) in the scene (by element id) */
  readonly pathId?: string | null
  /** Explicit SVG path data string (d attribute) */
  readonly pathData?: string
  /** Start offset along the path (percentage 0-100 or units) */
  readonly offset?: number
  /** Unit of start offset: percentage (default) or pixels */
  readonly offsetMode?: 'percent' | 'pixels'
  /** Side of path: 'left' (standard/above) or 'right' (flipped/below) */
  readonly side?: 'left' | 'right'
  /** Alignment on path relative to offset */
  readonly align?: 'start' | 'center' | 'end' | 'justify'
  /** Letter spacing delta along the curve */
  readonly spacing?: number
  /** Reverse the direction of the path */
  readonly reverse?: boolean
  /** Built-in curve preset type */
  readonly preset?: TextPathPreset
  /** Baseline shift / normal offset perpendicular to curve in canvas pixels */
  readonly baselineShift?: number
}

export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'

export type KineticStaggerMode = 'cascade' | 'left-to-right' | 'right-to-left' | 'center-out' | 'wave' | 'random' | 'elastic'
export type KineticWaveShape = 'triangle' | 'sine' | 'bounce' | 'spring'

export interface KineticTypography {
  readonly enabled: boolean
  readonly playing: boolean
  /** Displacement in the baseline's normal direction, in canvas pixels. */
  readonly amplitude: number
  readonly rotation: number
  readonly duration: number
  /** Phase delay per shaped glyph, in milliseconds. */
  readonly stagger: number
  readonly phase: number
  readonly staggerMode?: KineticStaggerMode
  readonly waveShape?: KineticWaveShape
  /** Real-time variable font weight modulation delta undulating across glyphs */
  readonly weightModulation?: number
  /** Oblique shear slant modulation delta across glyphs */
  readonly slantModulation?: number
  /** Proportional scale modulation across glyphs (0 to 1) */
  readonly scaleModulation?: number
  /** Variable font width (wdth) modulation percentage across glyphs */
  readonly widthModulation?: number
  /** Displacement in the baseline's tangent/horizontal direction, in canvas pixels. */
  readonly horizontalAmplitude?: number
  /** Variable font optical size (opsz) modulation across glyphs */
  readonly opticalSizeModulation?: number
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
  /** Variable font axis controls (wght, wdth, slnt, opsz, etc.) */
  /** Embedded local font; persists with this layer for offline use. */
  readonly fontSource?: string
  readonly variableAxes?: VariableFontAxes
  /** OpenType feature toggles (liga, dlig, calt, smcp, zero, frac, tnum, etc.) */
  readonly openTypeFeatures?: OpenTypeFeatures
  /** Kerning mode: 'auto' | 'normal' | 'none' | 'optical' */
  readonly fontKerning?: FontKerningMode
  /** Optical kerning adjustment factor when mode is 'optical' */
  readonly opticalKerning?: number
  /** Dynamic text-on-vector path deformation */
  readonly textOnPath?: TextOnPath
  /** Text capitalization transformation */
  readonly textTransform?: TextTransform
  readonly kinetic?: KineticTypography
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
export type ComponentPropertyValue = string | boolean | number
export type ComponentStateTrigger =
  | 'on-click'
  | 'on-hover'
  | 'while-pressed'
  | 'on-pointerdown'
  | 'on-pointerup'
  | 'on-hover-end'
  | 'after-delay'
export type InteractiveStateType = 'default' | 'hover' | 'pressed' | 'active'

export interface ComponentStateTransition {
  readonly id: string
  readonly fromState: string
  readonly trigger: ComponentStateTrigger
  readonly targetState: string
  readonly spring: SpringParameters
  readonly delay?: number
}

export interface ComponentStateMachine {
  readonly initial: string
  readonly states: readonly string[]
  readonly transitions: readonly ComponentStateTransition[]
}

export type ComponentPropertyKind = 'text' | 'boolean' | 'color' | 'number' | 'kinetic' | 'shader' | 'variant'

export type ComponentProperty = Readonly<{ id: string; name: string }> & (
  | { readonly kind: 'text'; readonly sourceId: string; readonly defaultValue: string; readonly targetProperty?: 'text' | 'fontFamily' | 'src' | 'alt' | 'textTransform' }
  | { readonly kind: 'boolean'; readonly sourceId: string; readonly defaultValue: boolean; readonly targetProperty?: 'visible' | 'kinetic.enabled' | 'clipContent' | 'shader.animated' | 'locked' }
  | { readonly kind: 'color'; readonly sourceId: string; readonly defaultValue: string; readonly targetProperty?: 'fill' | 'stroke' | 'shader' | 'shader.colorFront' | 'shader.colorMid' | 'shader.colorBack' | 'shadow' }
  | { readonly kind: 'number'; readonly sourceId: string; readonly defaultValue: number; readonly min?: number; readonly max?: number; readonly step?: number; readonly targetProperty?: string }
  | { readonly kind: 'kinetic'; readonly sourceId: string; readonly defaultValue: string | number | boolean; readonly targetProperty: 'enabled' | 'amplitude' | 'rotation' | 'duration' | 'stagger' | 'waveShape' | 'staggerMode' | 'weightModulation' | 'slantModulation' | 'scaleModulation' | 'playing' | 'phase' | 'horizontalAmplitude' | 'widthModulation' | 'opticalSizeModulation' }
  | { readonly kind: 'shader'; readonly sourceId: string; readonly defaultValue: string | number | boolean; readonly targetProperty: 'speed' | 'scale' | 'rotation' | 'frequency' | 'octaves' | 'turbulence' | 'displacement' | 'viewMode' | 'blendMode' | 'lacunarity' | 'persistence' | 'normalPerturbation' | 'grainOverlay' | 'chromaticAberration' | 'warpModulation' | 'fluidAdvection' | 'fluidViscosity' | 'noiseType' }
  | { readonly kind: 'variant'; readonly defaultValue: string; readonly options: readonly ComponentVariant[]; readonly stateMachine?: ComponentStateMachine }
)

export type ComponentPropertySchema = ComponentProperty
export type ExposedPropertySchema = ComponentProperty

export interface ComponentVariant {
  readonly value: string
  /** Patches use master layer IDs; instance IDs never leak into definitions. */
  readonly layers: Readonly<Record<string, ComponentOverrides>>
}

export interface MasterComponentMetadata {
  readonly description?: string
  readonly createdAt?: number
  readonly updatedAt?: number
  readonly author?: string
  readonly tags?: readonly string[]
  readonly category?: string
}

export type MasterComponentLink = {
  readonly kind: 'master'
  readonly properties?: readonly ComponentProperty[]
  readonly stateMachine?: ComponentStateMachine
  readonly description?: string
  readonly createdAt?: number
  readonly updatedAt?: number
  readonly metadata?: MasterComponentMetadata
}

export type ComponentInstanceLink = {
  readonly kind: 'instance'
  readonly masterId: string
  readonly sourceId: string
  readonly instanceId: string
  readonly overrides: ComponentOverrides
  /** Stored on the instance root only. Absent entries inherit the current default. */
  readonly propertyValues?: Readonly<Record<string, ComponentPropertyValue>>
  /** Active interactive state for live preview or runtime display */
  readonly activeState?: string
}

export type ComponentLink = MasterComponentLink | ComponentInstanceLink

/** MasterComponent node: A scene element defined as a master symbol with exposed properties and state */
export type MasterComponent<T extends SceneElement = SceneElement> = T & {
  readonly component: MasterComponentLink
}

/** ComponentInstance node: A scene element instantiated from a master symbol with local overrides */
export type ComponentInstance<T extends SceneElement = SceneElement> = T & {
  readonly component: ComponentInstanceLink
}

export type MasterComponentNode<T extends SceneElement = SceneElement> = MasterComponent<T>
export type ComponentInstanceNode<T extends SceneElement = SceneElement> = ComponentInstance<T>

export interface MasterComponentSchema {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly masterId: string
  readonly properties: readonly ComponentProperty[]
  readonly stateMachine?: ComponentStateMachine
  readonly instanceCount: number
  readonly instanceIds: readonly string[]
  readonly createdAt?: number
  readonly updatedAt?: number
}

export interface ComponentRegistryEntry {
  readonly masterId: string
  readonly name: string
  readonly description?: string
  readonly properties: readonly ComponentProperty[]
  readonly stateMachine?: ComponentStateMachine
  readonly instanceIds: readonly string[]
  readonly createdAt?: number
  readonly updatedAt?: number
}

export type ComponentRegistry = Readonly<Record<string, ComponentRegistryEntry>>

export interface SceneDocument {
  readonly version: 1
  readonly comments?: CommentDocument
  readonly motion?: MotionDocument
  readonly prototype?: PrototypeDocument
  /** Absent in legacy documents. */
  readonly tokens?: readonly DesignToken[]
  readonly styleLibrary?: StyleLibrary
  readonly backgroundShader?: ShaderPaint | null
  /** Active physics simulation document. Absent means the simulation layer is disabled. */
  readonly physics?: PhysicsDocument
  readonly componentRegistry?: ComponentRegistry
  readonly elements: Readonly<Record<string, SceneElement>>
  readonly rootIds: readonly string[]
}

export interface SceneSnapshot extends SceneDocument {
  readonly tokens: readonly DesignToken[]
  readonly styleLibrary: StyleLibrary
  readonly selection: readonly string[]
  readonly componentRegistry?: ComponentRegistry
}
