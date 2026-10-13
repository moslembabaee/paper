import { freezeElement } from './elements.ts'
import type { AutoLayout, ElementSizing, SceneElement, TextElement } from './types.ts'

export const FIXED_SIZING: ElementSizing = Object.freeze({ width: 'fixed', height: 'fixed' })
export const DEFAULT_AUTO_LAYOUT: AutoLayout = Object.freeze({
  direction: 'horizontal', gap: 16,
  padding: Object.freeze({ top: 24, right: 24, bottom: 24, left: 24 }),
  justify: 'start', align: 'start',
})
// Scene geometry must remain positive (including empty frames and exhausted fill space).
const MIN_SIZE = .01
const size = (value: number) => {
  if (!Number.isFinite(value)) throw new Error('Invalid auto layout dimensions')
  return Math.max(MIN_SIZE, value)
}
interface LayoutBox { width: number; height: number; children: readonly PlacedBox[] }
interface PlacedBox { id: string; x: number; y: number; box: LayoutBox }

let context: CanvasRenderingContext2D | null | undefined
const textCache = new Map<string, number>()
export function invalidateLayoutTextMetrics(): void { textCache.clear() }
function textWidth(text: string, node: TextElement): number {
  const font = `${node.fontWeight} ${node.fontSize}px ${node.fontFamily}`
  const key = JSON.stringify([font, node.letterSpacing, text])
  const cached = textCache.get(key)
  if (cached !== undefined) return cached
  if (context === undefined) context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  if (context) context.font = font
  // Headless integrations can lay out documents without a DOM. Browser measurements
  // replace this estimate when the document opens in the editor.
  const advance = context ? context.measureText(text).width : Array.from(text).length * node.fontSize * .6
  const result = Math.max(0, advance + Array.from(text).length * node.letterSpacing)
  if (textCache.size > 4096) textCache.clear()
  textCache.set(key, result)
  return result
}

function textHeight(node: TextElement, width: number): number {
  let lines = 0
  for (const paragraph of node.text.split('\n')) {
    if (textWidth(paragraph, node) <= width) { lines++; continue }
    let line = ''
    for (const word of paragraph.split(/(\s+)/)) {
      if (line && textWidth(line + word, node) > width && !/^\s+$/.test(word)) { lines++; line = '' }
      if (textWidth(word, node) > width) {
        for (const char of word) {
          if (line && textWidth(line + char, node) > width) { lines++; line = '' }
          line += char
        }
      } else line += word
    }
    lines++
  }
  return size(lines * node.fontSize * node.lineHeight)
}

/** Resolve intrinsic sizes before distributing available space. Fixed children never
 * shrink; fill siblings share the remainder equally. A fill child inside a hug axis
 * uses its intrinsic size, breaking the otherwise circular dependency. Hidden layers
 * retain geometry and do not occupy space. Rotation does not affect the layout box.
 * No DOM layout reads, iterative convergence, or extra history commands are needed.
 */
export function reflowAutoLayout(input: Readonly<Record<string, SceneElement>>, roots: readonly string[]): Readonly<Record<string, SceneElement>> {
  if (!Object.values(input).some(node => node.sizing?.width === 'hug' || node.sizing?.height === 'hug' || (node.type === 'frame' && node.layout))) return input
  const memo = new Map<string, Map<string, LayoutBox>>()
  const measure = (id: string, assignedWidth?: number, assignedHeight?: number): LayoutBox => {
    const node = input[id], sizing = node.sizing ?? FIXED_SIZING
    const key = `${assignedWidth ?? ''}:${assignedHeight ?? ''}`
    let entries = memo.get(id)
    const cached = entries?.get(key)
    if (cached) return cached
    if (!entries) { entries = new Map(); memo.set(id, entries) }
    let width = assignedWidth ?? node.width, height = assignedHeight ?? node.height
    let placed: PlacedBox[] = []
    if (node.type === 'text') {
      if (assignedWidth === undefined && sizing.width === 'hug') width = size(Math.max(0, ...node.text.split('\n').map(line => textWidth(line, node))))
      if (assignedHeight === undefined && sizing.height === 'hug') height = textHeight(node, width)
    } else if (node.type === 'frame') {
      const children = node.children.filter(child => input[child].visible)
      const natural = children.map(child => measure(child))
      const layout = node.layout
      if (!layout) {
        if (assignedWidth === undefined && sizing.width === 'hug') width = size(Math.max(0, ...children.map((child, i) => input[child].x + natural[i].width)))
        if (assignedHeight === undefined && sizing.height === 'hug') height = size(Math.max(0, ...children.map((child, i) => input[child].y + natural[i].height)))
        placed = children.map((child, i) => ({ id: child, x: input[child].x, y: input[child].y, box: natural[i] }))
      } else {
        const horizontal = layout.direction === 'horizontal'
        const p = layout.padding, gaps = Math.max(0, children.length - 1) * layout.gap
        const hugWidth = sizing.width === 'hug' && assignedWidth === undefined
        const hugHeight = sizing.height === 'hug' && assignedHeight === undefined
        if (hugWidth) width = size(p.left + p.right + (horizontal ? natural.reduce((sum, box) => sum + box.width, 0) + gaps : Math.max(0, ...natural.map(box => box.width))))
        const innerWidth = Math.max(0, width - p.left - p.right)
        const fillWidths = children.filter(child => input[child].sizing?.width === 'fill').length
        const fixedWidths = natural.reduce((sum, box, i) => sum + (input[children[i]].sizing?.width === 'fill' ? 0 : box.width), 0)
        const fillWidth = size((innerWidth - fixedWidths - gaps) / Math.max(1, fillWidths))
        // Resolve width first so wrapped text contributes its actual height to a hug frame.
        const widths = children.map((child, i) => input[child].sizing?.width === 'fill' && !hugWidth ? horizontal ? fillWidth : size(innerWidth) : natural[i].width)
        const constrained = children.map((child, i) => measure(child, widths[i]))
        if (hugHeight) height = size(p.top + p.bottom + (horizontal ? Math.max(0, ...constrained.map(box => box.height)) : constrained.reduce((sum, box) => sum + box.height, 0) + gaps))
        const innerHeight = Math.max(0, height - p.top - p.bottom)
        const fillHeights = children.filter(child => input[child].sizing?.height === 'fill').length
        const fixedHeights = constrained.reduce((sum, box, i) => sum + (input[children[i]].sizing?.height === 'fill' ? 0 : box.height), 0)
        const fillHeight = size((innerHeight - fixedHeights - gaps) / Math.max(1, fillHeights))
        const boxes = children.map((child, i) => input[child].sizing?.height === 'fill' && !hugHeight ? measure(child, widths[i], horizontal ? size(innerHeight) : fillHeight) : constrained[i])
        const mainSpace = horizontal ? innerWidth : innerHeight
        const used = boxes.reduce((sum, box) => sum + (horizontal ? box.width : box.height), 0) + gaps
        const remaining = Math.max(0, mainSpace - used)
        let cursor = (horizontal ? p.left : p.top) + (layout.justify === 'center' ? remaining / 2 : layout.justify === 'end' ? remaining : 0)
        const gap = layout.gap + (layout.justify === 'space-between' && children.length > 1 ? remaining / (children.length - 1) : 0)
        placed = children.map((child, i) => {
          const box = boxes[i]
          const crossSpace = Math.max(0, (horizontal ? innerHeight - box.height : innerWidth - box.width))
          const cross = (horizontal ? p.top : p.left) + (layout.align === 'center' ? crossSpace / 2 : layout.align === 'end' ? crossSpace : 0)
          const result = { id: child, x: horizontal ? cursor : cross, y: horizontal ? cross : cursor, box }
          cursor += (horizontal ? box.width : box.height) + gap
          return result
        })
      }
    }
    const result = { width: size(width), height: size(height), children: placed }
    entries.set(key, result)
    return result
  }
  let output = input
  const apply = (id: string, box: LayoutBox, x = input[id].x, y = input[id].y) => {
    const node = input[id]
    if (![x, y, box.width, box.height].every(Number.isFinite)) throw new Error('Invalid auto layout dimensions')
    if (node.x !== x || node.y !== y || node.width !== box.width || node.height !== box.height) {
      if (output === input) output = { ...input }
      ;(output as Record<string, SceneElement>)[id] = freezeElement({ ...node, x, y, width: box.width, height: box.height })
    }
    for (const child of box.children) apply(child.id, child.box, child.x, child.y)
  }
  for (const id of roots) apply(id, measure(id))
  return output
}
