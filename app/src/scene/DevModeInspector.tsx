import { useState } from 'react'
import { Check, ChevronRight, Copy, X } from 'lucide-react'
import type { SceneStore } from './store'
import type { SceneElement, TextElement } from './types'
import { useScene } from './useScene'
import { getWorldBounds } from './geometry'

// ─── CSS generation ──────────────────────────────────────────────────────────

function hexToRgba(color: string): string {
  const hex = color.replace('#', '')
  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const a = (parseInt(hex.slice(6, 8), 16) / 255).toFixed(2)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgb(${r}, ${g}, ${b})`
  }
  return color
}

interface CSSProp { property: string; value: string; token?: string }

function buildCSSProps(node: SceneElement): CSSProp[] {
  const props: CSSProp[] = []

  props.push({ property: 'position', value: 'absolute' })
  props.push({ property: 'left', value: `${node.x}px` })
  props.push({ property: 'top', value: `${node.y}px` })
  props.push({ property: 'width', value: `${node.width}px` })
  props.push({ property: 'height', value: `${node.height}px` })

  if (node.rotation !== 0) {
    props.push({ property: 'transform', value: `rotate(${node.rotation}deg)` })
  }

  if (node.style.opacity !== 1) {
    props.push({ property: 'opacity', value: String(node.style.opacity) })
  }

  if (node.style.fill !== null) {
    const raw = node.style.fill
    let token: string | undefined
    if (raw === '#edebe1') token = '--paper-cream'
    else if (raw === '#080808') token = '--paper-ink'
    else if (raw === '#81adec') token = '--paper-blue'
    else if (raw === '#4c8eef') token = '--paper-blue-deep'
    else if (raw === '#222222') token = '--paper-charcoal'
    else if (raw === '#f5f4ee') token = '--paper-surface'
    if (node.type === 'text') {
      props.push({ property: 'color', value: raw, token })
    } else {
      props.push({ property: 'background-color', value: raw, token })
    }
  }

  if ('cornerRadius' in node && node.cornerRadius > 0) {
    props.push({ property: 'border-radius', value: `${node.cornerRadius}px` })
  }

  if (node.style.stroke) {
    const { color, width } = node.style.stroke
    props.push({ property: 'border', value: `${width}px solid ${color}` })
  }

  if (node.style.shadow) {
    const { x, y, blur, color } = node.style.shadow
    props.push({ property: 'box-shadow', value: `${x}px ${y}px ${blur}px ${hexToRgba(color)}` })
  }

  if (node.type === 'text') {
    const t = node as TextElement
    props.push({ property: 'font-size', value: `${t.fontSize}px` })
    props.push({ property: 'font-weight', value: String(t.fontWeight) })
    props.push({ property: 'line-height', value: String(t.lineHeight) })
    if (t.letterSpacing !== 0) props.push({ property: 'letter-spacing', value: `${t.letterSpacing}px` })
    if (t.textAlign !== 'left') props.push({ property: 'text-align', value: t.textAlign })
  }

  if (node.type === 'frame' && node.clipContent) {
    props.push({ property: 'overflow', value: 'hidden' })
  }

  return props
}

// ─── Tailwind generation ──────────────────────────────────────────────────────

function colorToTailwind(color: string, prefix: 'bg' | 'text' | 'border'): string {
  const map: Record<string, string> = {
    '#080808': `${prefix}-neutral-950`,
    '#edebe1': `${prefix}-[#edebe1]`,
    '#81adec': `${prefix}-blue-300`,
    '#4c8eef': `${prefix}-blue-500`,
    '#222222': `${prefix}-neutral-900`,
    '#f5f4ee': `${prefix}-[#f5f4ee]`,
    '#ffffff': `${prefix}-white`,
    '#000000': `${prefix}-black`,
  }
  return map[color.toLowerCase()] ?? `${prefix}-[${color}]`
}

function buildTailwindClasses(node: SceneElement): string {
  const classes: string[] = ['absolute']

  if (node.style.opacity !== 1) {
    const pct = Math.round(node.style.opacity * 100)
    classes.push(`opacity-${pct}`)
  }

  if (node.style.fill !== null && node.type !== 'text') {
    classes.push(colorToTailwind(node.style.fill, 'bg'))
  }

  if (node.style.fill !== null && node.type === 'text') {
    classes.push(colorToTailwind(node.style.fill, 'text'))
  }

  if ('cornerRadius' in node && node.cornerRadius > 0) {
    const r = node.cornerRadius
    if (r === 2) classes.push('rounded-sm')
    else if (r === 4) classes.push('rounded')
    else if (r === 6) classes.push('rounded-md')
    else if (r === 8) classes.push('rounded-lg')
    else if (r === 12) classes.push('rounded-xl')
    else if (r === 16) classes.push('rounded-2xl')
    else if (r === 9999 || r >= 9999) classes.push('rounded-full')
    else classes.push(`rounded-[${r}px]`)
  }

  if (node.style.stroke) {
    const { width } = node.style.stroke
    classes.push('border')
    if (width !== 1) classes.push(`border-[${width}px]`)
    classes.push(colorToTailwind(node.style.stroke.color, 'border'))
  }

  if (node.style.shadow) {
    const { x, y, blur } = node.style.shadow
    if (x === 0 && y === 2 && blur === 4) classes.push('shadow-sm')
    else if (x === 0 && y === 4 && blur === 8) classes.push('shadow')
    else if (x === 0 && y === 4 && blur === 16) classes.push('shadow-md')
    else classes.push(`shadow-[${x}px_${y}px_${blur}px]`)
  }

  if (node.type === 'text') {
    const t = node as TextElement
    const fsSizes: Record<number, string> = { 10: 'text-xs', 12: 'text-sm', 14: 'text-sm', 16: 'text-base', 18: 'text-lg', 20: 'text-xl', 24: 'text-2xl', 30: 'text-3xl', 36: 'text-4xl', 48: 'text-5xl', 57: 'text-[57px]', 60: 'text-6xl', 72: 'text-7xl' }
    classes.push(fsSizes[t.fontSize] ?? `text-[${t.fontSize}px]`)
    const fwMap: Record<number, string> = { 100: 'font-thin', 200: 'font-extralight', 300: 'font-light', 400: 'font-normal', 500: 'font-medium', 600: 'font-semibold', 700: 'font-bold', 800: 'font-extrabold', 900: 'font-black' }
    const fw = fwMap[t.fontWeight]
    if (fw && t.fontWeight !== 400) classes.push(fw)
    if (t.textAlign === 'center') classes.push('text-center')
    if (t.textAlign === 'right') classes.push('text-right')
  }

  if (node.type === 'frame' && node.clipContent) {
    classes.push('overflow-hidden')
  }

  return classes.join(' ')
}

// ─── React component code gen ─────────────────────────────────────────────────

function elementToComponentName(node: SceneElement): string {
  return node.name.replace(/[^a-zA-Z0-9]/g, '') || node.type.charAt(0).toUpperCase() + node.type.slice(1)
}

function buildReactComponent(node: SceneElement): string {
  const name = elementToComponentName(node)
  const tw = buildTailwindClasses(node)
  const styleProps = buildCSSProps(node).filter(p => !['position', 'background-color', 'color', 'border', 'border-radius', 'box-shadow', 'opacity', 'overflow', 'font-size', 'font-weight', 'line-height', 'text-align', 'letter-spacing'].includes(p.property))
  const inlineStyle = styleProps.length > 0 ? `{{ left: ${node.x}, top: ${node.y}, width: ${node.width}, height: ${node.height}${node.rotation !== 0 ? `, transform: 'rotate(${node.rotation}deg)'` : ''} }}` : null

  if (node.type === 'text') {
    const t = node as TextElement
    const tag = t.fontSize >= 36 ? 'h2' : t.fontSize >= 24 ? 'h3' : 'p'
    if (inlineStyle) {
      return `export function ${name}() {\n  return (\n    <${tag}\n      className="${tw}"\n      style=${inlineStyle}\n    >\n      ${t.text}\n    </${tag}>\n  )\n}`
    }
    return `export function ${name}() {\n  return (\n    <${tag} className="${tw}">\n      ${t.text}\n    </${tag}>\n  )\n}`
  }

  if (node.type === 'image') {
    return `export function ${name}() {\n  return (\n    <div\n      className="${tw}"\n      style={{ left: ${node.x}, top: ${node.y}, width: ${node.width}, height: ${node.height} }}\n    >\n      <img\n        src="${node.src}"\n        alt="${node.alt}"\n        className="w-full h-full object-${node.fit}"\n      />\n    </div>\n  )\n}`
  }

  if (node.type === 'frame') {
    return `export function ${name}({ children }: { children?: React.ReactNode }) {\n  return (\n    <div\n      className="${tw}"\n      style={{ left: ${node.x}, top: ${node.y}, width: ${node.width}, height: ${node.height} }}\n    >\n      {children}\n    </div>\n  )\n}`
  }

  if (node.type === 'ellipse') {
    return `export function ${name}() {\n  return (\n    <div\n      className="${tw} rounded-full"\n      style={{ left: ${node.x}, top: ${node.y}, width: ${node.width}, height: ${node.height} }}\n    />\n  )\n}`
  }

  return `export function ${name}() {\n  return (\n    <div\n      className="${tw}"\n      style={{ left: ${node.x}, top: ${node.y}, width: ${node.width}, height: ${node.height} }}\n    />\n  )\n}`
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="dev-copy-btn"
      aria-label="Copy to clipboard"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        })
      }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function TokenBadge({ token }: { token: string }) {
  return <span className="dev-token-badge">{token}</span>
}

function CSSBlock({ props }: { props: CSSProp[] }) {
  const text = props.map(p => `${p.property}: ${p.value};`).join('\n')
  return (
    <div className="dev-code-block">
      <div className="dev-code-header">
        <span>CSS</span>
        <CopyButton text={text} />
      </div>
      <pre className="dev-code-pre">
        {props.map((p, i) => (
          <div key={i} className="dev-code-line">
            <span className="dev-css-prop">{p.property}</span>
            <span className="dev-css-colon">: </span>
            <span className="dev-css-val">{p.value}</span>
            <span className="dev-css-semi">;</span>
            {p.token && <TokenBadge token={p.token} />}
          </div>
        ))}
      </pre>
    </div>
  )
}

function TailwindBlock({ node }: { node: SceneElement }) {
  const classes = buildTailwindClasses(node)
  return (
    <div className="dev-code-block">
      <div className="dev-code-header">
        <span>Tailwind CSS</span>
        <CopyButton text={classes} />
      </div>
      <pre className="dev-code-pre dev-tailwind-classes">
        {classes.split(' ').map((cls, i) => (
          <span key={i} className="dev-tw-class">{cls}</span>
        ))}
      </pre>
    </div>
  )
}

function ReactBlock({ node }: { node: SceneElement }) {
  const code = buildReactComponent(node)
  return (
    <div className="dev-code-block">
      <div className="dev-code-header">
        <span>React</span>
        <CopyButton text={code} />
      </div>
      <pre className="dev-code-pre dev-code-jsx">{code}</pre>
    </div>
  )
}

function BoxModel({ node }: { node: SceneElement }) {
  const margin = 0
  const border = node.style.stroke?.width ?? 0
  const padding = 0
  const { width, height } = node

  return (
    <div className="dev-box-model">
      <div className="dev-bm-label">Box model</div>
      <div className="dev-bm-outer" title="Margin (always 0 — use parent gap)">
        <span className="dev-bm-dim">{margin}</span>
        <div className="dev-bm-border" title={`Border: ${border}px`}>
          <span className="dev-bm-dim">{border > 0 ? border : '—'}</span>
          <div className="dev-bm-padding" title="Padding (always 0)">
            <span className="dev-bm-dim">{padding}</span>
            <div className="dev-bm-content">
              <span className="dev-bm-size">{Math.round(width)} × {Math.round(height)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DevModeInspector({ store, onExit }: { store: SceneStore; onExit: () => void }) {
  const state = useScene(store, s => s)
  const node = state.selection.length === 1 ? state.elements[state.selection[0]] : undefined
  const [tab, setTab] = useState<'inspect' | 'code'>('inspect')

  const cssProps = node ? buildCSSProps(node) : []
  const worldBounds = node ? (() => {
    try { return getWorldBounds(state, node.id) } catch { return null }
  })() : null

  return (
    <aside className="inspector-panel dev-mode-panel" aria-label="Dev mode properties">
      <div className="panel-heading dev-mode-heading">
        <div className="dev-mode-badge">
          <span className="dev-mode-dot" />
          <span>Dev</span>
        </div>
        <div className="dev-mode-tabs">
          <button
            className={`dev-tab ${tab === 'inspect' ? 'active' : ''}`}
            onClick={() => setTab('inspect')}
          >Inspect</button>
          <button
            className={`dev-tab ${tab === 'code' ? 'active' : ''}`}
            onClick={() => setTab('code')}
          >Code</button>
        </div>
        <button className="quiet-button" aria-label="Exit dev mode" onClick={onExit}>
          <X size={14} />
        </button>
      </div>

      {!node ? (
        <div className="inspector-section">
          <span className="section-caption">DEV MODE</span>
          <h3>Select a layer</h3>
          <p>Click any element on the canvas to inspect its CSS properties and generate production-ready React + Tailwind code.</p>
          <div className="dev-hint-list">
            <div className="dev-hint-row"><span className="dev-hint-icon">⌘</span><span>Click to select</span></div>
            <div className="dev-hint-row"><span className="dev-hint-icon">⇧</span><span>Multi-select layers</span></div>
          </div>
        </div>
      ) : tab === 'inspect' ? (
        <>
          <div className="inspector-section">
            <span className="section-caption">ELEMENT</span>
            <div className="dev-element-name">{node.name}</div>
            <div className="dev-element-type">{node.type.toUpperCase()}</div>
          </div>

          <div className="inspector-section">
            <span className="section-caption">DIMENSIONS</span>
            <div className="dev-dims-grid">
              <div className="dev-dim-cell">
                <span className="dev-dim-label">W</span>
                <span className="dev-dim-val">{Math.round(node.width)}</span>
              </div>
              <div className="dev-dim-cell">
                <span className="dev-dim-label">H</span>
                <span className="dev-dim-val">{Math.round(node.height)}</span>
              </div>
              <div className="dev-dim-cell">
                <span className="dev-dim-label">X</span>
                <span className="dev-dim-val">{Math.round(node.x)}</span>
              </div>
              <div className="dev-dim-cell">
                <span className="dev-dim-label">Y</span>
                <span className="dev-dim-val">{Math.round(node.y)}</span>
              </div>
              {node.rotation !== 0 && (
                <div className="dev-dim-cell">
                  <span className="dev-dim-label">°</span>
                  <span className="dev-dim-val">{Math.round(node.rotation)}</span>
                </div>
              )}
              {node.style.opacity !== 1 && (
                <div className="dev-dim-cell">
                  <span className="dev-dim-label">Op</span>
                  <span className="dev-dim-val">{Math.round(node.style.opacity * 100)}%</span>
                </div>
              )}
            </div>
            {worldBounds && (
              <div className="dev-world-bounds">
                <span className="dev-dim-label">World</span>
                <span className="dev-dim-val">{Math.round(worldBounds.x)}, {Math.round(worldBounds.y)}</span>
              </div>
            )}
          </div>

          <div className="inspector-section">
            <BoxModel node={node} />
          </div>

          {node.style.fill !== null && (
            <div className="inspector-section">
              <span className="section-caption">FILL</span>
              <div className="dev-color-row">
                <span className="dev-color-swatch" style={{ background: node.style.fill }} />
                <span className="dev-color-hex">{node.style.fill}</span>
                <CopyButton text={node.style.fill} />
              </div>
              {cssProps.find(p => p.token && (p.property === 'background-color' || p.property === 'color')) && (
                <TokenBadge token={cssProps.find(p => p.token)!.token!} />
              )}
            </div>
          )}

          {node.style.stroke && (
            <div className="inspector-section">
              <span className="section-caption">STROKE</span>
              <div className="dev-color-row">
                <span className="dev-color-swatch" style={{ background: node.style.stroke.color }} />
                <span className="dev-color-hex">{node.style.stroke.color}</span>
                <span className="dev-color-meta">{node.style.stroke.width}px</span>
                <CopyButton text={node.style.stroke.color} />
              </div>
            </div>
          )}

          {node.style.shadow && (
            <div className="inspector-section">
              <span className="section-caption">SHADOW</span>
              <div className="dev-color-row">
                <span className="dev-color-swatch" style={{ background: node.style.shadow.color }} />
                <span className="dev-color-hex">{node.style.shadow.color}</span>
              </div>
              <div className="dev-dims-grid" style={{ marginTop: 8 }}>
                <div className="dev-dim-cell"><span className="dev-dim-label">X</span><span className="dev-dim-val">{node.style.shadow.x}</span></div>
                <div className="dev-dim-cell"><span className="dev-dim-label">Y</span><span className="dev-dim-val">{node.style.shadow.y}</span></div>
                <div className="dev-dim-cell"><span className="dev-dim-label">Blur</span><span className="dev-dim-val">{node.style.shadow.blur}</span></div>
              </div>
            </div>
          )}

          {node.type === 'text' && (
            <div className="inspector-section">
              <span className="section-caption">TYPOGRAPHY</span>
              <div className="dev-dims-grid">
                <div className="dev-dim-cell">
                  <span className="dev-dim-label">Size</span>
                  <span className="dev-dim-val">{node.fontSize}px</span>
                </div>
                <div className="dev-dim-cell">
                  <span className="dev-dim-label">Weight</span>
                  <span className="dev-dim-val">{node.fontWeight}</span>
                </div>
                <div className="dev-dim-cell">
                  <span className="dev-dim-label">Line</span>
                  <span className="dev-dim-val">{node.lineHeight}</span>
                </div>
                <div className="dev-dim-cell">
                  <span className="dev-dim-label">Track</span>
                  <span className="dev-dim-val">{node.letterSpacing}px</span>
                </div>
              </div>
            </div>
          )}

          <div className="inspector-section">
            <CSSBlock props={cssProps} />
          </div>

          <button className="text-action dev-go-code" onClick={() => setTab('code')}>
            View generated code <ChevronRight size={12} />
          </button>
        </>
      ) : (
        <>
          <div className="inspector-section">
            <span className="section-caption">COMPONENT</span>
            <div className="dev-element-name">{elementToComponentName(node)}</div>
          </div>
          <div className="inspector-section">
            <TailwindBlock node={node} />
          </div>
          <div className="inspector-section">
            <ReactBlock node={node} />
          </div>
        </>
      )}

      <div className="inspector-bottom">
        <p>Copy any snippet.<br />Paste into your codebase.</p>
        <span>DEV MODE · PAPER HANDOFF</span>
      </div>
    </aside>
  )
}
