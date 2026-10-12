import type { SceneSnapshot, TextElement } from '../scene/types.ts'
import { exportBounds, exportRoots, sceneToSVG } from './svg.ts'
import type { ExportAssets, ExportOptions } from './svg.ts'
import { sanitizeSVG } from './import.ts'

export const MAX_EXPORT_PIXELS = 64_000_000
export const MAX_EXPORT_DIMENSION = 16384

export function pngDimensions(state: SceneSnapshot, options: ExportOptions): { width: number; height: number } {
  const bounds = exportBounds(state, options.scope)
  if (!bounds) throw new Error('There are no visible layers to export.')
  const width = Math.ceil(bounds.width * options.scale), height = Math.ceil(bounds.height * options.scale)
  if (width > MAX_EXPORT_DIMENSION || height > MAX_EXPORT_DIMENSION || width * height > MAX_EXPORT_PIXELS) throw new Error('This PNG is too large. Choose a lower scale or export a smaller selection (maximum 64 megapixels / 16,384 px per side).')
  return { width, height }
}

const blobURL = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('Could not read an image asset.'))
  reader.readAsDataURL(blob)
})

export async function embedImage(src: string): Promise<string> {
  if (/^data:image\/(png|jpeg|webp|gif);/i.test(src)) return src
  const url = new URL(src, document.baseURI)
  if (!['http:', 'https:', 'data:', 'blob:'].includes(url.protocol)) throw new Error('Unsupported image URL.')
  let response: Response
  try { response = await fetch(url, { signal: AbortSignal.timeout(15_000), credentials: url.origin === location.origin ? 'same-origin' : 'omit' }) }
  catch { throw new Error('An image could not be embedded. Check its URL and CORS permissions.') }
  if (!response.ok) throw new Error('An image asset could not be loaded.')
  const blob = await response.blob()
  if (blob.type.includes('svg') || url.pathname.endsWith('.svg')) {
    const svg = sanitizeSVG(await blob.text())
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.source)}`
  }
  if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) throw new Error('The image must be PNG, JPEG, WebP, GIF, or SVG.')
  return blobURL(blob)
}

async function prepareAssets(state: SceneSnapshot, options: ExportOptions): Promise<ExportAssets> {
  await document.fonts.ready
  const images = new Map<string, string>(), shaders = new Map<string, string>()
  const visited: string[] = []
  const visit = (id: string) => { const node = state.elements[id]; if (!node.visible) return; visited.push(id); if (node.type === 'frame') node.children.forEach(visit) }
  exportRoots(state, options.scope).forEach(visit)
  // Deduplicate image URLs and limit concurrent fetches to avoid resource spikes.
  const imageCache = new Map<string, string>()
  const shaderNodes = visited.filter(id => state.elements[id].style.shader)
  const background = options.scope === 'canvas' ? state.backgroundShader : null
  const capture = shaderNodes.length || background ? (await import('./captureShader')).captureShader : null
  if (background && capture) {
    const bounds = exportBounds(state, options.scope)
    if (bounds) {
      pngDimensions(state, options)
      shaders.set('paper:background', await capture(background, bounds.width, bounds.height, options.scale))
    }
  }
  for (const id of visited) {
    const node = state.elements[id]
    if (node.type === 'image' && !node.style.shader) {
      let source = imageCache.get(node.src)
      if (!source) { source = await embedImage(node.src); imageCache.set(node.src, source) }
      images.set(id, source)
    }
    if (node.style.shader && capture) {
      if (node.width * node.height * options.scale ** 2 > MAX_EXPORT_PIXELS || Math.max(node.width, node.height) * options.scale > MAX_EXPORT_DIMENSION) throw new Error('A shader layer is too large to export at this scale.')
      shaders.set(id, await capture(node.style.shader, node.width, node.height, options.scale))
    }
  }
  const context = document.createElement('canvas').getContext('2d')
  const measureText = context ? (text: string, node: TextElement) => {
    context.font = `${node.fontWeight} ${node.fontSize}px ${node.fontFamily}`
    return context.measureText(text).width
  } : undefined
  const textBaseline = context ? (node: TextElement) => {
    context.font = `${node.fontWeight} ${node.fontSize}px ${node.fontFamily}`
    const metrics = context.measureText('Mg')
    const ascent = metrics.fontBoundingBoxAscent ?? node.fontSize * .9
    const descent = metrics.fontBoundingBoxDescent ?? node.fontSize * .2
    return ascent + (node.fontSize * node.lineHeight - ascent - descent) / 2
  } : undefined
  return { images, shaders, measureText, textBaseline }
}

export async function exportSVG(state: SceneSnapshot, options: ExportOptions): Promise<Blob> {
  return new Blob([sceneToSVG(state, options, await prepareAssets(state, options))], { type: 'image/svg+xml;charset=utf-8' })
}

export async function exportPNG(state: SceneSnapshot, options: ExportOptions): Promise<Blob> {
  const { width, height } = pngDimensions(state, options)
  const svg = await exportSVG(state, options)
  const url = URL.createObjectURL(svg)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not create a PNG canvas.')
    context.drawImage(image, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed. Try a lower scale.')), 'image/png'))
  } finally { URL.revokeObjectURL(url) }
}
