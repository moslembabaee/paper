import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { SceneElement } from '../scene/types'
import { ShaderSurface } from './ShaderSurface'

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!)

type TextLayout = Pick<Extract<SceneElement, { type: 'text' }>, 'text' | 'width' | 'fontWeight' | 'fontSize' | 'fontFamily' | 'letterSpacing' | 'textAlign' | 'lineHeight'>

function textMask(node: TextLayout) {
  // Match the text layer's pre-wrap layout, including wrapping in its own font.
  const context = document.createElement('canvas').getContext('2d')
  if (context) context.font = `${node.fontWeight} ${node.fontSize}px ${node.fontFamily}`
  const measure = (s: string) => (context?.measureText(s).width ?? s.length * node.fontSize * .6) + Math.max(0, s.length - 1) * node.letterSpacing
  const lines: string[] = []
  for (const paragraph of node.text.split('\n')) {
    let line = ''
    for (const char of paragraph) {
      if (line && measure(line + char) > node.width) {
        const breakAt = line.lastIndexOf(' ')
        if (breakAt > 0) { lines.push(line.slice(0, breakAt + 1)); line = line.slice(breakAt + 1) }
        else { lines.push(line); line = '' }
      }
      line += char
    }
    lines.push(line)
  }
  const x = node.textAlign === 'center' ? node.width / 2 : node.textAlign === 'right' ? node.width : 0
  const anchor = node.textAlign === 'center' ? 'middle' : node.textAlign === 'right' ? 'end' : 'start'
  const baseline = context?.measureText('Mg').fontBoundingBoxAscent ?? node.fontSize * .9
  const descent = context?.measureText('Mg').fontBoundingBoxDescent ?? node.fontSize * .2
  const leading = (node.fontSize * node.lineHeight - baseline - descent) / 2
  return `<text fill="white" font-family="${escape(node.fontFamily)}" font-size="${node.fontSize}" font-weight="${node.fontWeight}" letter-spacing="${node.letterSpacing}" text-anchor="${anchor}" xml:space="preserve">${lines.map((line, i) => `<tspan x="${x}" y="${baseline + leading + i * node.fontSize * node.lineHeight}">${escape(line)}</tspan>`).join('')}</text>`
}

export function ShapeShader({ node }: { node: SceneElement }) {
  const { type, width, height } = node
  const textNode = node.type === 'text' ? node : undefined
  const text = textNode?.text ?? '', fontWeight = textNode?.fontWeight ?? 400, fontSize = textNode?.fontSize ?? 16
  const fontFamily = textNode?.fontFamily ?? 'sans-serif', letterSpacing = textNode?.letterSpacing ?? 0
  const textAlign = textNode?.textAlign ?? 'left', lineHeight = textNode?.lineHeight ?? 1
  // Uniform and composite edits do not remeasure every glyph in a text layer.
  const textSvg = useMemo(() => type === 'text' ? textMask({ width, text, fontWeight, fontSize, fontFamily, letterSpacing, textAlign, lineHeight }) : '', [type, width, text, fontWeight, fontSize, fontFamily, letterSpacing, textAlign, lineHeight])
  const d = node.type === 'path' ? node.d : ''
  const fillRule = node.type === 'path' ? node.fillRule : 'nonzero'
  const viewBox = node.type === 'path' ? node.viewBox.join(' ') : `0 0 ${width} ${height}`
  const mask = useMemo(() => {
    if (type !== 'path' && type !== 'text') return undefined
    const content = type === 'path' ? `<path fill="white" fill-rule="${fillRule}" d="${escape(d)}"/>` : textSvg
    return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" preserveAspectRatio="none">${content}</svg>`)}")`
  }, [type, width, height, viewBox, fillRule, d, textSvg])
  if (!node.style.shader) return null
  const style: CSSProperties = {
    borderRadius: node.type === 'ellipse' ? '50%' : 'cornerRadius' in node ? node.cornerRadius : undefined,
    maskImage: mask, maskSize: '100% 100%', maskRepeat: 'no-repeat',
  }
  const shadow = node.type !== 'frame' && node.type !== 'image' && !node.style.effects?.some(effect => effect.enabled) ? node.style.shadow : null
  return <div className="shape-shader-wrap" style={{ filter: shadow ? `drop-shadow(${shadow.x}px ${shadow.y}px ${shadow.blur / 2}px ${shadow.color})` : undefined }}>
    <div className="shader-base-paint" style={{ ...style, background: node.style.fill ?? undefined }}>
      {node.type === 'image' && <img src={node.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: node.fit }} />}
    </div>
    <ShaderSurface paint={node.style.shader} style={style} />
  </div>
}
