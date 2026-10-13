import { designSystemToCSS } from '../tokens/libraryCodegen'
import { buildCSSProps, buildTailwindClasses, buildReactComponent, elementToComponentName } from '../tokens/codegen'
import type { CSSProp } from '../tokens/codegen'
import type { DesignToken } from '../tokens/types'
import { useState } from 'react'
import { Check, ChevronRight, Copy, X } from 'lucide-react'
import type { SceneStore } from './store'
import type { SceneElement } from './types'
import { useScene } from './useScene'
import { getWorldBounds } from './geometry'

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

function TailwindBlock({ node, tokens, parent }: { node: SceneElement; tokens: readonly DesignToken[]; parent?: SceneElement }) {
  const classes = buildTailwindClasses(node, tokens, parent)
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

function ReactBlock({ node, tokens, parent }: { node: SceneElement; tokens: readonly DesignToken[]; parent?: SceneElement }) {
  const code = buildReactComponent(node, tokens, parent)
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
  const p = node.type === 'frame' ? node.layout?.padding : null
  const padding = p ? `${p.top} / ${p.right} / ${p.bottom} / ${p.left}` : '0'
  const { width, height } = node

  return (
    <div className="dev-box-model">
      <div className="dev-bm-label">Box model</div>
      <div className="dev-bm-outer" title="Margin (always 0 — use parent gap)">
        <span className="dev-bm-dim">{margin}</span>
        <div className="dev-bm-border" title={`Border: ${border}px`}>
          <span className="dev-bm-dim">{border > 0 ? border : '—'}</span>
          <div className="dev-bm-padding" title={`Padding, top / right / bottom / left: ${padding}`}>
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

  const parent = node?.parentId ? state.elements[node.parentId] : undefined
  const cssProps = node ? buildCSSProps(node, state.tokens, parent) : []
  const worldBounds = node ? (() => {
    try { return getWorldBounds(state, node.id) } catch { return null }
  })() : null

  return (
    <aside className="inspector-panel dev-mode-panel" data-testid="dev-mode-panel" aria-label="Dev mode properties">
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
                <TokenBadge token={cssProps.find(p => p.token && (p.property === 'background-color' || p.property === 'color'))!.token!} />
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
            <TailwindBlock node={node} tokens={state.tokens} parent={parent} />
          </div>
          <div className="inspector-section">
            <ReactBlock node={node} tokens={state.tokens} parent={parent} />
          </div>
        </>
      )}

      {(state.tokens.length > 0 || state.styleLibrary.styles.length > 0) && <div className="inspector-section"><span className="section-caption">THEME / TOKENS</span><div className="dev-code-block"><div className="dev-code-header"><span>{tab === 'code' ? 'Tailwind theme' : 'CSS variables'}</span><CopyButton text={designSystemToCSS(state.tokens, state.styleLibrary, tab === 'code')} /></div><pre className="dev-code-pre">{designSystemToCSS(state.tokens, state.styleLibrary, tab === 'code')}</pre></div></div>}
      <div className="inspector-bottom">
        <p>Copy any snippet.<br />Paste into your codebase.</p>
        <span>DEV MODE · PAPER HANDOFF</span>
      </div>
    </aside>
  )
}
