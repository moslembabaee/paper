import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronRight, Circle, Grid2X2, Hand, Layers, MousePointer2, PanelLeftClose, Square, X } from 'lucide-react'
import { CanvasViewport, ViewportController, unionBounds } from './canvas'
import type { MinimapItem } from './canvas'
import './App.css'

const ARTBOARDS: readonly MinimapItem[] = [
  { id: '01 — A little space', x: 0, y: 0, width: 720, height: 480, color: '#f5f4ee' },
  { id: '02 — Make room', x: 840, y: 0, width: 360, height: 480, color: '#81adec' },
  { id: '03 — Material studies', x: 0, y: 600, width: 720, height: 240, color: '#222222' },
]
const CONTENT_BOUNDS = unionBounds(ARTBOARDS)

function PaperMark() {
  return <svg width="23" height="25" viewBox="0 0 23 25" fill="none" aria-hidden="true"><path d="M2 1h13l6 6v17H2V1Z" fill="currentColor" /><path d="M14 1v7h7" stroke="#edebe1" strokeWidth="1.5" /><path d="M6 13h11M6 17h8" stroke="#edebe1" strokeWidth="1.5" /></svg>
}

function OrbitStudy() {
  return (
    <svg className="orbit-study" viewBox="0 0 360 320" fill="none" aria-hidden="true">
      <circle cx="180" cy="160" r="116" stroke="#080808" strokeWidth="1" />
      <ellipse cx="180" cy="160" rx="116" ry="40" stroke="#080808" transform="rotate(-45 180 160)" />
      <ellipse cx="180" cy="160" rx="116" ry="40" stroke="#080808" transform="rotate(45 180 160)" />
      <ellipse cx="180" cy="160" rx="40" ry="116" stroke="#080808" />
      <path d="M40 160h280M180 20v280" stroke="#080808" strokeOpacity=".25" strokeDasharray="3 4" />
      <circle cx="263" cy="79" r="8" fill="#080808" />
      <circle cx="180" cy="160" r="6" fill="#edebe1" stroke="#080808" />
    </svg>
  )
}

export default function App() {
  const [controller] = useState(() => new ViewportController())
  const [tool, setTool] = useState<'select' | 'hand'>('select')
  const [grid, setGrid] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [layersVisible, setLayersVisible] = useState(true)
  const activeBoard = ARTBOARDS.find((board) => board.id === selected)

  function focusBoard(board: MinimapItem) {
    setSelected(board.id)
    controller.fit(board, 80)
  }

  return (
    <div className="paper-app">
      <header className="app-header">
        <div className="app-brand"><PaperMark /><span>paper</span><span className="app-alpha">alpha</span></div>
        <div className="document-name"><span className="document-divider" /><span>Space to think</span><ChevronDown size={12} /><span className="document-state">Local document</span></div>
        <div className="header-end"><span className="local-status"><i />All changes local</span><span className="project-avatar" title="Your self-hosted workspace">P</span></div>
      </header>

      <div className="editor-layout">
        {layersVisible && (
          <aside className="layers-panel" aria-label="Document layers">
            <div className="panel-heading"><span>Layers</span><button className="quiet-button" aria-label="Hide layers" onClick={() => setLayersVisible(false)}><PanelLeftClose size={14} /></button></div>
            <div className="page-row"><Layers size={13} /><span>Explorations</span><span className="page-count">01</span></div>
            <div className="layer-section-heading">ARTBOARDS <span>3</span></div>
            {ARTBOARDS.map((board, index) => (
              <button key={board.id} className={`layer-row ${selected === board.id ? 'selected' : ''}`} onClick={() => focusBoard(board)}>
                <Square size={13} /><span>{board.id.slice(5)}</span><span className="layer-index">0{index + 1}</span>
              </button>
            ))}
            <div className="layers-bottom"><span className="workspace-label">YOUR WORKSPACE</span><p>Room for your next idea.</p><span>Infinite by design.</span></div>
          </aside>
        )}

        <main className="canvas-stage">
          <div className="canvas-toolbar viewport-ui" role="toolbar" aria-label="Canvas tools">
            {!layersVisible && <button className="tool-button" title="Show layers" aria-label="Show layers" onClick={() => setLayersVisible(true)}><Layers size={17} /></button>}
            <button className={`tool-button ${tool === 'select' ? 'active' : ''}`} aria-label="Selection tool" aria-pressed={tool === 'select'} title="Selection tool" onClick={() => setTool('select')}><MousePointer2 size={17} /></button>
            <button className={`tool-button ${tool === 'hand' ? 'active' : ''}`} aria-label="Pan tool" aria-pressed={tool === 'hand'} title="Pan tool (or hold Space)" onClick={() => setTool('hand')}><Hand size={17} /></button>
            <span className="toolbar-divider" />
            <button className={`tool-button ${grid ? 'grid-active' : ''}`} aria-label="Toggle engineering grid" aria-pressed={grid} title="120px engineering grid" onClick={() => setGrid(!grid)}><Grid2X2 size={16} /></button>
          </div>
          <CanvasViewport controller={controller} contentBounds={CONTENT_BOUNDS} minimapItems={ARTBOARDS} gridVisible={grid} panMode={tool === 'hand'}>
            {ARTBOARDS.map((board, index) => (
              <div key={board.id} className={`artboard-wrap ${selected === board.id ? 'is-selected' : ''}`} style={{ left: board.x, top: board.y, width: board.width, height: board.height }}>
                <div className="artboard-label">{board.id}<span>{board.width} × {board.height}</span></div>
                <article className={`artboard artboard-${index}`} aria-label={board.id} onClick={() => { if (tool === 'select') setSelected(board.id) }}>
                  {index === 0 && <>
                    <div className="hero-card-top"><span>SPACE / STUDIO</span><span>Independent by nature <ArrowUpRight size={14} /></span></div>
                    <h1>A little space.<br />A lot of possibility<span>.</span></h1>
                    <p>A place for ideas to take shape.<br />Made for the way you think.</p>
                    <div className="hero-card-bottom"><span className="hero-card-cta">Make something your own <ArrowUpRight size={16} /></span><span>EST. 2026</span></div>
                    <span className="hero-corner" aria-hidden="true">+</span>
                  </>}
                  {index === 1 && <>
                    <div className="poster-top"><span>STUDY / 002</span><ArrowDownRight size={21} /></div>
                    <OrbitStudy />
                    <div className="poster-bottom"><h2>Make room.</h2><span>FOR SOMETHING NEW</span></div>
                  </>}
                  {index === 2 && <>
                    <div className="material-copy"><span>MATERIAL / 003</span><h2>Simple things.<br />Considered well.</h2><span>FORM, COLOUR & A LITTLE CURIOSITY.</span></div>
                    <div className="material-shapes" aria-hidden="true"><span /><span /><span /></div>
                  </>}
                </article>
              </div>
            ))}
          </CanvasViewport>
        </main>

        <aside className="inspector-panel" aria-label="Canvas properties">
          <div className="panel-heading"><span>{activeBoard ? 'Artboard' : 'Canvas'}</span>{activeBoard ? <button className="quiet-button" aria-label="Deselect artboard" onClick={() => setSelected(null)}><X size={14} /></button> : <Circle size={11} />}</div>
          {activeBoard ? <>
            <div className="inspector-section"><span className="section-caption">SELECTION</span><h3>{activeBoard.id.slice(5)}</h3><div className="dimension-row"><span>W <strong>{activeBoard.width}</strong></span><span>H <strong>{activeBoard.height}</strong></span></div><div className="dimension-row"><span>X <strong>{activeBoard.x}</strong></span><span>Y <strong>{activeBoard.y}</strong></span></div><button className="text-action" onClick={() => controller.fit(activeBoard)}>Focus artboard <ChevronRight size={12} /></button></div>
          </> : <div className="inspector-section"><span className="section-caption">WORKING SPACE</span><h3>Beyond the edges.</h3><p>Pan freely. Get closer.<br />There’s always more room.</p></div>}
          <div className="inspector-section"><span className="section-caption">ENGINEERING GRID</span><div className="setting-row"><span>Show grid</span><button className={`grid-switch ${grid ? 'on' : ''}`} role="switch" aria-checked={grid} aria-label="Show engineering grid" onClick={() => setGrid(!grid)}><span /></button></div><div className="setting-row"><span>Major interval</span><code>120 px</code></div><div className="setting-row"><span>Subdivisions</span><code>24 px</code></div></div>
          <div className="inspector-section"><span className="section-caption">CANVAS FILL</span><div className="fill-setting"><span /><code>EDEBE1</code><span>100%</span></div></div>
          <div className="inspector-section navigation-guide"><span className="section-caption">FIND YOUR WAY</span><div><span>Pan</span><kbd>Space + drag</kbd></div><div><span>Also pan</span><kbd>Middle drag</kbd></div><div><span>Zoom</span><kbd>Scroll / pinch</kbd></div><div><span>Actual size</span><kbd>0</kbd></div><div><span>Fit canvas</span><kbd>1</kbd></div></div>
          <div className="inspector-bottom"><PaperMark /><p>Your ideas.<br />Your tools. Your space.</p><span>OPEN SOURCE · SELF HOSTED</span></div>
        </aside>
      </div>
      <footer className="app-footer"><span><span className="footer-dot" />Paper / Infinite canvas</span><span>120 px grid<span className="footer-separator">/</span>Made to be yours.</span></footer>
    </div>
  )
}
