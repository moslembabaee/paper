import { effectFilterMarkup } from '../tokens/effects.ts'
import { optimizeSVGPath } from './pathOptimize.ts'
import type { Bounds } from '../canvas/types.ts'
import { unionBounds } from '../canvas/math.ts'
import { getWorldBounds, getWorldMatrix } from '../scene/geometry.ts'
import { selectionRoots } from '../scene/selectionGeometry.ts'
import { frameMask, maskPathData, maskFillRule } from '../scene/maskGeometry.ts'
import { parsePath, pathBounds } from '../scene/pathGeometry.ts'
import { resolveTextPathD } from '../scene/typography.ts'
import { textMarkup } from '../scene/textMarkup.ts'
import type { SceneElement, SceneSnapshot, TextElement } from '../scene/types.ts'

export interface ExportOptions {
  readonly scope: 'selection' | 'canvas'
  readonly scale: 1 | 2 | 3 | 4
  readonly background: 'transparent' | 'cream'
  /** Raster output gamut. SVG retains native CSS paints. PDF/WebP use sRGB. */
  readonly colorSpace?: 'srgb' | 'display-p3'
  readonly quality?: number
}
export interface ExportAssets {
  readonly images: ReadonlyMap<string, string>
  readonly shaders: ReadonlyMap<string, string>
  readonly measureText?: (text: string, node: TextElement) => number
  readonly textBaseline?: (node: TextElement) => number
}
const EMPTY_ASSETS: ExportAssets = { images: new Map(), shaders: new Map() }
export const xml = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)
const num = (value: number) => String(Math.round(value * 1e6) / 1e6)
const matrix = (values: readonly number[]) => `matrix(${values.map(num).join(' ')})`

export function exportRoots(state: SceneSnapshot, scope: ExportOptions['scope']): string[] {
  const ids = scope === 'selection' ? selectionRoots(state, state.selection) : [...state.rootIds]
  const visible = ids.filter(id => {
    let node: SceneElement | undefined = state.elements[id]
    while (node) { if (!node.visible) return false; node = node.parentId ? state.elements[node.parentId] : undefined }
    return true
  })
  // Paint order is independent of the order in which layers were selected.
  const order = new Map<string, number>()
  let index = 0
  const visit = (id: string) => { order.set(id, index++); const node = state.elements[id]; if (node.type === 'frame') node.children.forEach(visit) }
  state.rootIds.forEach(visit)
  return visible.sort((a, b) => order.get(a)! - order.get(b)!)
}

export function exportBounds(state: SceneSnapshot, scope: ExportOptions['scope']): Bounds | null {
  const roots = exportRoots(state, scope)
  if (!roots.length) return null
  const bounds: Bounds[] = []
  const visit = (id: string, crop: boolean) => {
    const node = state.elements[id]
    if (!node.visible) return
    let b = getWorldBounds(state, id)
    if (node.type === 'text' && node.textOnPath?.enabled && !crop) {
      const curve = pathBounds(parsePath(resolveTextPathD(node, state.elements)), node.fontSize * 1.5)
      const [a, c, d, e, f, g] = getWorldMatrix(state, id)
      const corners = [[curve.x, curve.y], [curve.x + curve.width, curve.y], [curve.x, curve.y + curve.height], [curve.x + curve.width, curve.y + curve.height]]
      const xs = corners.map(([x, y]) => a * x + d * y + f), ys = corners.map(([x, y]) => c * x + e * y + g)
      b = unionBounds([b, { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }])!
    }
    // Selected frames are artboards: export their exact dimensions. Unclipped
    // descendants contribute to the extent of a whole-canvas export.
    const shadow = node.style.shadow
    const effectPadding = (node.style.effects ?? []).filter(effect => effect.enabled && effect.type !== 'inner-shadow').reduce((sum, effect) => sum + effect.blur * 2 + (effect.type === 'layer-blur' ? 0 : Math.abs(effect.x) + Math.abs(effect.y) + Math.abs(effect.spread)), 0)
    const padding = crop ? 0 : Math.max(effectPadding, Math.max(node.style.stroke?.width ?? 0, shadow ? shadow.blur * 2 + Math.abs(shadow.x) + Math.abs(shadow.y) : 0))
    bounds.push({ x: b.x - padding, y: b.y - padding, width: b.width + padding * 2, height: b.height + padding * 2 })
    if (node.type === 'frame' && !node.clipContent && !frameMask(state.elements, node) && !crop) node.children.forEach(child => visit(child, false))
  }
  roots.forEach(id => visit(id, scope === 'selection' && state.elements[id].type === 'frame'))
  return unionBounds(bounds)
}

export { textMarkup } from '../scene/textMarkup.ts'

/** Native SVG, with no editor chrome, CSS dependency, or foreignObject. */
export function sceneToSVG(state: SceneSnapshot, options: ExportOptions, assets = EMPTY_ASSETS, outputSize?: Pick<Bounds, 'width' | 'height'>): string {
  const bounds = exportBounds(state, options.scope)
  if (!bounds) throw new Error(options.scope === 'selection' ? 'Select a frame or layer to export.' : 'The canvas has no visible layers to export.')
  const defs: string[] = []
  let serial = 0
  const unique = () => `paper-export-${++serial}`
  const rect = (node: SceneElement, inset = 0) => `<rect x="${num(inset)}" y="${num(inset)}" width="${num(Math.max(0, node.width - inset * 2))}" height="${num(Math.max(0, node.height - inset * 2))}" rx="${'cornerRadius' in node ? num(node.cornerRadius) : 0}"/>`
  const clip = (content: string) => { const id = unique(); defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse">${content}</clipPath>`); return `clip-path="url(#${id})"` }
  const shape = (node: SceneElement, inset = 0) => {
    if (node.type === 'ellipse') return `<ellipse cx="${num(node.width / 2)}" cy="${num(node.height / 2)}" rx="${num(Math.max(0, node.width / 2 - inset))}" ry="${num(Math.max(0, node.height / 2 - inset))}"/>`
    if (node.type === 'path') {
      const [x, y, width, height] = node.viewBox, sx = node.width / width, sy = node.height / height
      // clipPath accepts paths directly, rather than nested SVG viewports.
      return `<path d="${xml(optimizeSVGPath(node.d))}" transform="${matrix([sx, 0, 0, sy, -x * sx, -y * sy])}" fill-rule="${node.fillRule}" clip-rule="${node.fillRule}"/>`
    }
    return rect(node, inset)
  }
  const render = (id: string, root = false): string => {
    const node = state.elements[id]
    if (!node.visible) return ''
    const { fill, stroke, shadow, shader } = node.style
    const shaderSrc = assets.shaders.get(id)
    if (shader && !shaderSrc) throw new Error(`The shader on “${node.name}” could not be captured.`)
    let shadowAttr = ''
    if (node.style.effects?.some(effect => effect.enabled)) {
      const filter = unique()
      defs.push(effectFilterMarkup(node.style.effects, filter))
      shadowAttr = `filter="url(#${filter})"`
    } else if (shadow) {
      const filter = unique()
      defs.push(`<filter id="${filter}" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feDropShadow dx="${num(shadow.x)}" dy="${num(shadow.y)}" stdDeviation="${num(shadow.blur / 2)}" flood-color="${xml(shadow.color)}"/></filter>`)
      shadowAttr = `filter="url(#${filter})"`
    }
    const strokeAttrs = `stroke="${xml(stroke?.color ?? 'none')}" stroke-width="${num(stroke?.width ?? 0)}" stroke-dasharray="${stroke?.dash.map(num).join(' ') ?? ''}" stroke-linejoin="round"`
    let content = ''
    if (shaderSrc) {
      const maskContent = node.type === 'text' ? textMarkup(node, '#ffffff', assets.measureText, assets.textBaseline, state.elements, unique()) : shape(node)
      const base = `<rect width="${num(node.width)}" height="${num(node.height)}" fill="${xml(fill ?? 'none')}"/>`
      const imageBase = node.type === 'image' ? `<image href="${xml(assets.images.get(id) ?? node.src)}" width="${num(node.width)}" height="${num(node.height)}" preserveAspectRatio="${node.fit === 'fill' ? 'none' : node.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}"/>` : ''
      content += `<g ${clip(maskContent)} style="isolation:isolate">${base}${imageBase}<image href="${xml(shaderSrc)}" width="${num(node.width)}" height="${num(node.height)}" preserveAspectRatio="none" opacity="${num(shader?.composite?.opacity ?? 1)}" style="mix-blend-mode:${shader?.composite?.blendMode ?? 'normal'}"/></g>`
    }
    if (node.type === 'frame') {
      const mask = frameMask(state.elements, node)
      if (!shaderSrc) content += `<g fill="${xml(fill ?? 'none')}">${rect(node)}</g>`
      const children = node.children.filter(child => child !== mask?.id).map(child => render(child)).join('')
      const masked = mask ? `<g ${clip(`<path d="${xml(optimizeSVGPath(maskPathData(mask)))}" clip-rule="${maskFillRule(mask)}"/>`)}>${children}</g>` : children
      content += `<g ${node.clipContent ? clip(rect(node)) : ''}>${masked}</g>`
      content += `<g fill="none" ${strokeAttrs}>${rect(node, (stroke?.width ?? 0) / 2)}</g>`
    } else if (node.type === 'text') {
      content += `<g ${node.textOnPath?.enabled ? '' : clip(rect(node))} ${strokeAttrs}>${textMarkup(node, shaderSrc ? 'none' : fill ?? 'none', assets.measureText, assets.textBaseline, state.elements, unique())}</g>`
    } else if (node.type === 'image') {
      const src = assets.images.get(id) ?? node.src
      content += `${shaderSrc ? '' : `<g ${clip(rect(node))}><g fill="${xml(fill ?? 'none')}">${rect(node)}</g><image href="${xml(src)}" width="${num(node.width)}" height="${num(node.height)}" preserveAspectRatio="${node.fit === 'fill' ? 'none' : node.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}"/></g>`}<g fill="none" ${strokeAttrs}>${rect(node, (stroke?.width ?? 0) / 2)}</g>`
    } else content += `<g fill="${xml(shaderSrc ? 'none' : fill ?? 'none')}" ${strokeAttrs}>${shape(node, (stroke?.width ?? 0) / 2)}</g>`
    const transform = root ? matrix(getWorldMatrix(state, id)) : `translate(${num(node.x)} ${num(node.y)}) rotate(${num(node.rotation)} ${num(node.width / 2)} ${num(node.height / 2)})`
    // A selected descendant retains inherited opacity, without exporting siblings.
    let opacity = node.style.opacity
    if (root) { let parent = node.parentId; while (parent) { opacity *= state.elements[parent].style.opacity; parent = state.elements[parent].parentId } }
    return `<g transform="${transform}" opacity="${num(opacity)}" ${shadowAttr}><title>${xml(node.name)}</title>${content}</g>`
  }
  const content = exportRoots(state, options.scope).map(id => {
    let output = render(id, true)
    let parent = state.elements[id].parentId
    let branch = id
    while (parent) {
      const frame = state.elements[parent]
      if (frame.type === 'frame') {
        if (frame.clipContent) output = `<g ${clip(`<g transform="${matrix(getWorldMatrix(state, parent))}">${rect(frame)}</g>`)}>${output}</g>`
        const mask = frameMask(state.elements, frame)
        if (mask && branch !== mask.id) output = `<g ${clip(`<path transform="${matrix(getWorldMatrix(state, parent))}" d="${xml(optimizeSVGPath(maskPathData(mask)))}" clip-rule="${maskFillRule(mask)}"/>`)}>${output}</g>`
      }
      branch = parent
      parent = frame.parentId
    }
    return output
  }).join('')
  const background = options.background === 'cream' ? `<rect x="${num(bounds.x)}" y="${num(bounds.y)}" width="${num(bounds.width)}" height="${num(bounds.height)}" fill="#edebe1"/>` : ''
  const shader = options.scope === 'canvas' && state.backgroundShader ? assets.shaders.get('paper:background') : null
  if (options.scope === 'canvas' && state.backgroundShader && !shader) throw new Error('The canvas shader could not be captured.')
  const shaderBackground = shader ? `<image x="${num(bounds.x)}" y="${num(bounds.y)}" width="${num(bounds.width)}" height="${num(bounds.height)}" href="${xml(shader)}" preserveAspectRatio="none" opacity="${num(state.backgroundShader?.composite?.opacity ?? 1)}" style="mix-blend-mode:${state.backgroundShader?.composite?.blendMode ?? 'normal'}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(outputSize?.width ?? bounds.width * options.scale)}" height="${num(outputSize?.height ?? bounds.height * options.scale)}" viewBox="${[bounds.x, bounds.y, bounds.width, bounds.height].map(num).join(' ')}"><defs>${defs.join('')}</defs>${background}${shaderBackground}${content}</svg>`
}
