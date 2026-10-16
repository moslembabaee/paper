import type { CSSProperties } from 'react'
import { getWorldMatrix } from './geometry.ts'
import { parsePath, serializePath } from './pathGeometry.ts'
import type {
  OpenTypeFeatures,
  SceneElement,
  TextElement,
  TextPathPreset,
  TextTransform,
  VariableFontAxes,
} from './types.ts'

export interface VariableAxisMeta {
  readonly tag: string
  readonly label: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly default: number
  readonly unit?: string
  readonly description?: string
}

export const VARIABLE_AXES_META: Readonly<Record<string, VariableAxisMeta>> = {
  wght: { tag: 'wght', label: 'Weight', min: 1, max: 1000, step: 1, default: 400, description: 'Stroke thickness' },
  wdth: { tag: 'wdth', label: 'Width', min: 25, max: 200, step: 1, default: 100, unit: '%', description: 'Glyph proportion horizontal scale' },
  slnt: { tag: 'slnt', label: 'Slant', min: -20, max: 20, step: 0.5, default: 0, unit: '°', description: 'Oblique shear angle' },
  opsz: { tag: 'opsz', label: 'Optical Size', min: 6, max: 144, step: 1, default: 16, unit: 'pt', description: 'Stroke weight adjustment for display vs caption' },
  grad: { tag: 'GRAD', label: 'Grade', min: -200, max: 200, step: 1, default: 0, description: 'Weight adjustment without changing layout metrics' },
  casl: { tag: 'CASL', label: 'Casual', min: 0, max: 1, step: 0.05, default: 0, description: 'Informality of stroke terminals' },
  crsv: { tag: 'CRSV', label: 'Cursive', min: 0, max: 1, step: 0.05, default: 0, description: 'Continuous script joining' },
}

export interface VariableAxisPreset {
  readonly name: string
  readonly description: string
  readonly axes: VariableFontAxes
}

export const VARIABLE_AXIS_PRESETS: readonly VariableAxisPreset[] = [
  { name: 'Regular', description: 'Neutral body proportion', axes: { wght: 400, wdth: 100, slnt: 0, opsz: 16 } },
  { name: 'Condensed Bold', description: 'Dense headline punch', axes: { wght: 700, wdth: 75, slnt: 0, opsz: 32 } },
  { name: 'Extended Dynamic', description: 'Wide tracking display', axes: { wght: 600, wdth: 135, slnt: -6, opsz: 40 } },
  { name: 'Editorial Italic', description: 'Graceful oblique voice', axes: { wght: 450, wdth: 95, slnt: -14, opsz: 22 } },
  { name: 'Ultra Light Thin', description: 'Delicate technical clarity', axes: { wght: 150, wdth: 100, slnt: 0, opsz: 12 } },
  { name: 'Poster Black', description: 'Maximum visual impact', axes: { wght: 950, wdth: 115, slnt: 0, opsz: 72 } },
]

export interface OpenTypeFeatureMeta {
  readonly tag: string
  readonly name: string
  readonly category: 'Ligatures' | 'Numbers' | 'Capitals' | 'Decorative' | 'Stylistic Sets'
  readonly sample: string
  readonly description: string
  readonly default?: boolean
}

export const OPENTYPE_CATALOG: readonly OpenTypeFeatureMeta[] = [
  { tag: 'liga', name: 'Standard Ligatures', category: 'Ligatures', sample: 'fi fl ff ffi', description: 'Combines adjacent glyphs (fi, fl, ffi) to prevent visual collisions', default: true },
  { tag: 'dlig', name: 'Discretionary Ligatures', category: 'Ligatures', sample: 'st ct sp', description: 'Ornamental and historic glyph connections for display text' },
  { tag: 'calt', name: 'Contextual Alternates', category: 'Ligatures', sample: '-> => !=', description: 'Code arrows and context-sensitive glyph replacements' },
  { tag: 'zero', name: 'Slashed Zero', category: 'Numbers', sample: '0 vs O', description: 'Distinct slashed zero to differentiate from capital letter O' },
  { tag: 'frac', name: 'Fractions', category: 'Numbers', sample: '1/2 3/4', description: 'Converts slashed numbers into true diagonal typographical fractions' },
  { tag: 'tnum', name: 'Tabular Figures', category: 'Numbers', sample: '$1,420.00', description: 'Uniform digit widths for aligned numerical tables and columns' },
  { tag: 'pnum', name: 'Proportional Figures', category: 'Numbers', sample: '123456', description: 'Proportionally spaced numerals matching natural character rhythm' },
  { tag: 'onum', name: 'Oldstyle Figures', category: 'Numbers', sample: '0123456789', description: 'Varying ascenders and descenders blending into running lowercase' },
  { tag: 'lnum', name: 'Lining Figures', category: 'Numbers', sample: '0123456789', description: 'Uniform height numbers aligning with uppercase baseline' },
  { tag: 'ordn', name: 'Ordinals', category: 'Numbers', sample: '1st 2nd 3rd', description: 'Superscript ordinals for dates and rankings' },
  { tag: 'smcp', name: 'Small Capitals', category: 'Capitals', sample: 'Small Caps', description: 'Converts lowercase glyphs into proportional small capitals' },
  { tag: 'c2sc', name: 'Capitals to Small Caps', category: 'Capitals', sample: 'ALL CAPS', description: 'Converts uppercase glyphs into matching small capitals' },
  { tag: 'swsh', name: 'Swashes', category: 'Decorative', sample: 'K Q R &', description: 'Exaggerated flourishing calligraphic entry/exit strokes' },
  { tag: 'salt', name: 'Stylistic Alternates', category: 'Decorative', sample: 'a g k', description: 'Alternate glyph forms for brand-specific typography' },
  { tag: 'ss01', name: 'Stylistic Set 1', category: 'Stylistic Sets', sample: 'Single-story a', description: 'Alternate geometric lowercase letters' },
  { tag: 'ss02', name: 'Stylistic Set 2', category: 'Stylistic Sets', sample: 'Single-story g', description: 'Simplified loop letterforms' },
  { tag: 'ss03', name: 'Stylistic Set 3', category: 'Stylistic Sets', sample: 'Curved l', description: 'Legible curved bottom stem for lowercase l' },
  { tag: 'ss04', name: 'Stylistic Set 4', category: 'Stylistic Sets', sample: 'Square punct', description: 'Architectural square dots and punctuation marks' },
]

/** Perceptual character kerning pairs for optical kerning simulation */
const OPTICAL_KERNING_PAIRS: Readonly<Record<string, number>> = {
  AV: -0.09, AW: -0.07, AY: -0.09, AT: -0.08,
  VA: -0.09, WA: -0.07, YA: -0.09, TA: -0.08,
  To: -0.06, Ta: -0.06, Te: -0.05, Ti: -0.04,
  Vo: -0.06, Va: -0.06, Ve: -0.05,
  Wo: -0.05, Wa: -0.05, We: -0.04,
  Yo: -0.07, Ya: -0.07, Ye: -0.06,
  PA: -0.07, FA: -0.07, LT: -0.07, LV: -0.08, LY: -0.08,
  'T.': -0.1, 'V.': -0.1, 'W.': -0.08, 'Y.': -0.1,
}

/** Compute pairwise optical kerning adjustment in em units */
export function calculateOpticalKerningDelta(text: string, strength = 0): number {
  if (!text || text.length < 2) return 0
  let totalDelta = 0
  let pairCount = 0
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2)
    const metric = OPTICAL_KERNING_PAIRS[pair] ?? OPTICAL_KERNING_PAIRS[pair.toUpperCase()]
    if (metric !== undefined) {
      totalDelta += metric
      pairCount++
    }
  }
  const baseDelta = pairCount > 0 ? totalDelta / text.length : -0.02
  const factor = 1 + (strength / 50)
  return baseDelta * factor
}

/** Apply text transformation */
export function applyTextTransform(text: string, transform?: TextTransform): string {
  if (!transform || transform === 'none') return text
  if (transform === 'uppercase') return text.toUpperCase()
  if (transform === 'lowercase') return text.toLowerCase()
  if (transform === 'capitalize') {
    return text.replace(/\b\w/g, char => char.toUpperCase())
  }
  return text
}

/** Compile CSS font-variation-settings string */
export function compileFontVariationSettings(axes?: VariableFontAxes, fallbackWeight?: number): string | undefined {
  if (!axes && fallbackWeight === undefined) return undefined
  const parts: string[] = []

  // Ensure weight is included
  const weight = axes?.wght ?? fallbackWeight
  if (weight !== undefined && Number.isFinite(weight)) {
    parts.push(`'wght' ${Math.round(weight)}`)
  }

  // Width
  if (axes?.wdth !== undefined && Number.isFinite(axes.wdth)) {
    parts.push(`'wdth' ${Math.round(axes.wdth)}`)
  }

  // Slant
  if (axes?.slnt !== undefined && Number.isFinite(axes.slnt)) {
    parts.push(`'slnt' ${Number(axes.slnt.toFixed(2))}`)
  }

  // Optical size
  if (axes?.opsz !== undefined && Number.isFinite(axes.opsz)) {
    parts.push(`'opsz' ${Number(axes.opsz.toFixed(1))}`)
  }

  // Custom axes (GRAD, CASL, CRSV, etc.)
  if (axes) {
    for (const [tag, val] of Object.entries(axes)) {
      if (['wght', 'wdth', 'slnt', 'opsz'].includes(tag)) continue
      if (val !== undefined && Number.isFinite(val)) {
        const cleanTag = VARIABLE_AXES_META[tag]?.tag ?? tag
        if (/^[a-zA-Z0-9 ]{4}$/.test(cleanTag)) parts.push(`'${cleanTag}' ${Number(val.toFixed(2))}`)
      }
    }
  }

  return parts.length ? parts.join(', ') : undefined
}

/** Compile CSS font-feature-settings string */
export function compileFontFeatureSettings(features?: OpenTypeFeatures): string | undefined {
  if (!features) return undefined
  const parts: string[] = []
  for (const [tag, active] of Object.entries(features)) {
    if (active === true) {
      parts.push(`"${tag}" 1`)
    } else if (active === false) {
      parts.push(`"${tag}" 0`)
    }
  }
  return parts.length ? parts.join(', ') : undefined
}

/** Compile full inline CSSProperties for a TextElement */
export function compileTypographyStyles(node: TextElement): CSSProperties {
  const variation = compileFontVariationSettings(node.variableAxes, node.fontWeight)
  const features = compileFontFeatureSettings(node.openTypeFeatures)

  let effectiveSpacing = node.letterSpacing
  if (node.fontKerning === 'optical') {
    const opticalDeltaEm = calculateOpticalKerningDelta(node.text, node.opticalKerning ?? 0)
    effectiveSpacing += opticalDeltaEm * node.fontSize
  }

  const styles: CSSProperties = {
    fontFamily: node.fontFamily,
    fontSize: node.fontSize,
    fontWeight: node.variableAxes?.wght ?? node.fontWeight,
    lineHeight: node.lineHeight,
    letterSpacing: effectiveSpacing !== 0 ? `${effectiveSpacing}px` : undefined,
    textAlign: node.textAlign,
    fontOpticalSizing: node.variableAxes?.opsz === undefined ? 'auto' : 'none',
    textTransform: node.textTransform && node.textTransform !== 'none' ? node.textTransform : undefined,
  }

  if (variation) {
    styles.fontVariationSettings = variation
  }

  if (features) {
    styles.fontFeatureSettings = features
  }

  if (node.fontKerning) {
    styles.fontKerning = node.fontKerning === 'optical' ? 'normal' : node.fontKerning
  }

  if (node.variableAxes?.wdth && node.variableAxes.wdth !== 100) {
    styles.fontStretch = `${node.variableAxes.wdth}%`
  }

  return styles
}

/** Generate mathematical SVG path presets for Text-on-Path deformation */
export function generatePathPreset(preset: TextPathPreset, width: number, height: number): string {
  const w = Math.max(10, width)
  const h = Math.max(10, height)

  switch (preset) {
    case 'arc': {
      // Graceful arched rainbow curve
      const yBase = h * 0.85
      const yPeak = h * 0.15
      return `M 0,${yBase.toFixed(2)} Q ${(w * 0.5).toFixed(2)},${yPeak.toFixed(2)} ${w.toFixed(2)},${yBase.toFixed(2)}`
    }
    case 'circle': {
      // Circular/orbital path centered in bounds
      const cx = w * 0.5
      const cy = h * 0.5
      const r = Math.min(w, h) * 0.42
      return `M ${(cx - r).toFixed(2)},${cy.toFixed(2)} A ${r.toFixed(2)},${r.toFixed(2)} 0 1,1 ${(cx + r).toFixed(2)},${cy.toFixed(2)} A ${r.toFixed(2)},${r.toFixed(2)} 0 1,1 ${(cx - r).toFixed(2)},${cy.toFixed(2)}`
    }
    case 'scurve': {
      // Dynamic S-curve with twin inflection points
      const y1 = h * 0.8
      const y2 = h * 0.2
      return `M 0,${y1.toFixed(2)} C ${(w * 0.35).toFixed(2)},${y1.toFixed(2)} ${(w * 0.65).toFixed(2)},${y2.toFixed(2)} ${w.toFixed(2)},${y2.toFixed(2)}`
    }
    case 'spiral': {
      // Expanding smooth Archimedean spiral
      const cx = w * 0.5
      const cy = h * 0.5
      const maxR = Math.min(w, h) * 0.45
      const turns = 1.5
      const steps = 36
      const points: string[] = []
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * (turns * Math.PI * 2)
        const r = (i / steps) * maxR
        const x = cx + r * Math.cos(theta)
        const y = cy + r * Math.sin(theta)
        points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)},${y.toFixed(2)}`)
      }
      return points.join(' ')
    }
    case 'banner': {
      // Flowing banner ribbon arch
      const yBase = h * 0.72
      const yPeak = h * 0.28
      return `M 0,${yBase.toFixed(2)} Q ${(w * 0.5).toFixed(2)},${yPeak.toFixed(2)} ${w.toFixed(2)},${yBase.toFixed(2)}`
    }
    case 'zigzag': {
      // Sharp dynamic zigzag waveform
      const segs = 6
      const points: string[] = [`M 0,${(h * 0.5).toFixed(2)}`]
      for (let i = 1; i <= segs; i++) {
        const x = (i / segs) * w
        const y = i % 2 === 1 ? h * 0.15 : h * 0.85
        points.push(`L ${x.toFixed(2)},${y.toFixed(2)}`)
      }
      return points.join(' ')
    }
    case 'wave':
    default: {
      // Smooth sinusoidal cubic wave
      const yMid = h * 0.5
      const amp = h * 0.35
      const cp1x = w * 0.16
      const cp1y = yMid - amp
      const cp2x = w * 0.34
      const cp2y = yMid - amp
      const midX = w * 0.5
      const cp3x = w * 0.66
      const cp3y = yMid + amp
      const cp4x = w * 0.84
      const cp4y = yMid + amp
      return `M 0,${yMid.toFixed(2)} C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${midX.toFixed(2)},${yMid.toFixed(2)} C ${cp3x.toFixed(2)},${cp3y.toFixed(2)} ${cp4x.toFixed(2)},${cp4y.toFixed(2)} ${w.toFixed(2)},${yMid.toFixed(2)}`
    }
  }
}

/** Reverse SVG path data direction with mathematically exact cubic contour inversion */
export function reversePathD(d: string): string {
  try {
    const contours = parsePath(d)
    if (!contours.length) return d
    const reversed = contours.map(contour => {
      // Keep the seam of a closed contour fixed when changing direction.
      const ordered = contour.closed ? [contour.anchors[0], ...contour.anchors.slice(1).reverse()] : contour.anchors.slice().reverse()
      const reversedAnchors = ordered.map(anchor => ({
        ...anchor,
        in: anchor.out ? { ...anchor.out } : undefined,
        out: anchor.in ? { ...anchor.in } : undefined,
      }))
      return {
        closed: contour.closed,
        anchors: reversedAnchors,
      }
    })
    return serializePath(reversed)
  } catch {
    // Fallback to original path if parsing fails
    return d
  }
}

/** Map a linked vector's viewBox through both frame hierarchies into text-local space. */
function linkedPathD(node: TextElement, target: Extract<SceneElement, { type: 'path' }>, elements: Readonly<Record<string, SceneElement>>): string {
  const state = { elements }
  const [a, b, c, d, e, f] = getWorldMatrix(state, node.id)
  const [pa, pb, pc, pd, pe, pf] = getWorldMatrix(state, target.id)
  const det = a * d - b * c
  const [vx, vy, vw, vh] = target.viewBox
  const transform = (p: { x: number; y: number }) => {
    const px = (p.x - vx) * target.width / vw, py = (p.y - vy) * target.height / vh
    const x = pa * px + pc * py + pe - e, y = pb * px + pd * py + pf - f
    return { x: (d * x - c * y) / det, y: (a * y - b * x) / det }
  }
  return serializePath(parsePath(target.d).map(contour => ({
    ...contour,
    anchors: contour.anchors.map(anchor => ({ ...transform(anchor), ...(anchor.in ? { in: transform(anchor.in) } : {}), ...(anchor.out ? { out: transform(anchor.out) } : {}) })),
  })))
}

/** Resolve on every geometry change; no DOM measurements or animation loop needed. */
export function resolveTextPathD(node: TextElement, elements?: Readonly<Record<string, SceneElement>>): string {
  const top = node.textOnPath
  let path = generatePathPreset(top?.preset ?? 'wave', node.width, node.height)
  const target = top?.pathId && elements ? elements[top.pathId] : undefined
  if (target?.type === 'path' && elements) {
    try { path = linkedPathD(node, target, elements) }
    catch { /* Keep text visible while the source path is being edited. */ }
  } else if (top?.preset === 'custom' && top.pathData?.trim()) {
    path = top.pathData
  }
  // Reversing the baseline implements the opposite side portably in SVG renderers.
  return Boolean(top?.reverse) !== (top?.side === 'right') ? reversePathD(path) : path
}

export function textAnchorForPath(align?: 'start' | 'center' | 'end', textAlign?: 'left' | 'center' | 'right'): 'start' | 'middle' | 'end' {
  const effective = align ?? (textAlign === 'center' ? 'center' : textAlign === 'right' ? 'end' : 'start')
  return effective === 'center' ? 'middle' : effective
}

export function textPathOffset(node: TextElement): number {
  const anchor = textAnchorForPath(node.textOnPath?.align, node.textAlign)
  return node.textOnPath?.offset ?? (anchor === 'middle' ? 50 : anchor === 'end' ? 100 : 0)
}

/** One set of declarations for canvas, SVG and developer handoff. */
export function typographyCSS(node: TextElement): Record<string, string> {
  return Object.fromEntries(Object.entries(compileTypographyStyles(node))
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`), `${value}${key === 'fontSize' ? 'px' : ''}`]))
}

/** Embedded fonts use a generated family name so documents never depend on remote services. */
export function embeddedFontCSS(node: TextElement): string {
  if (!node.fontSource || !/^data:font\/(woff2?|ttf|otf);base64,[A-Za-z0-9+/=]+$/.test(node.fontSource)) return ''
  const family = node.fontFamily.replace(/[^a-zA-Z0-9_-]/g, '')
  return `@font-face{font-family:"${family}";src:url("${node.fontSource}");font-weight:1 1000;font-stretch:25% 200%;font-display:swap;}`
}
