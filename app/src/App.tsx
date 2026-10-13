import { useState } from 'react'
import { ChevronDown, Circle, Code2, Frame, Grid2X2, Hand, Image, Layers, MousePointer2, PenTool, Square, Type, X } from 'lucide-react'
import type { ElementType } from './scene/types'
import { SceneCanvas } from './scene/SceneCanvas'
import { LayerTree } from './scene/LayerTree'
import { ElementInspector } from './scene/ElementInspector'
import { DevModeInspector } from './scene/DevModeInspector'
import { HistoryControls } from './scene/HistoryControls'
import { createWorkspace, useProjectIO } from './io/useProjectIO'
import { DocumentActions } from './io/DocumentActions'
import { ThemeSwitcher } from './design-system/ThemeSwitcher'
import './App.css'

const creationTools = [
  { type: 'frame', label: 'Add frame', Icon: Frame },
  { type: 'rectangle', label: 'Add rectangle', Icon: Square },
  { type: 'ellipse', label: 'Add ellipse', Icon: Circle },
  { type: 'text', label: 'Add text', Icon: Type },
  { type: 'path', label: 'Add vector path', Icon: PenTool },
  { type: 'image', label: 'Add image', Icon: Image },
] as const

function PaperMark() {
  return <svg width="23" height="25" viewBox="0 0 23 25" fill="none" aria-hidden="true"><path d="M2 1h13l6 6v17H2V1Z" fill="currentColor" /><path d="M14 1v7h7" stroke="var(--paper-surface)" strokeWidth="1.5" /><path d="M6 13h11M6 17h8" stroke="var(--paper-surface)" strokeWidth="1.5" /></svg>
}

export default function App() {
  const [workspace] = useState(createWorkspace)
  const { controller, store } = workspace
  const [name, setName] = useState(workspace.project?.name ?? 'Space to think')
  const [tool, setTool] = useState<'select' | 'hand'>('select')
  const [grid, setGrid] = useState(workspace.project?.grid ?? true)
  const [layersVisible, setLayersVisible] = useState(true)
  const [devMode, setDevMode] = useState(false)
  const io = useProjectIO({ store, controller, name, grid, initialMessage: workspace.restoreError, onOpen: project => { setName(project.name); setGrid(project.grid) }, onImport: () => setTool('select') })

  function addElement(type: ElementType) {
    const { elements, selection } = store.getSnapshot()
    const selected = selection.length === 1 ? elements[selection[0]] : undefined
    const parentId = type === 'frame' ? null : selected?.type === 'frame' ? selected.id : selected?.parentId ?? null
    const parent = parentId ? elements[parentId] : undefined
    const snapshot = controller.getSnapshot()
    const center = controller.screenToWorld({ x: snapshot.size.width / 2, y: snapshot.size.height / 2 })
    const width = type === 'frame' ? 720 : type === 'text' ? 240 : 120
    const height = type === 'frame' ? 480 : type === 'text' ? 48 : 120
    store.batch(() => {
      const node = store.add(type, {
        parentId, width, height,
        x: Math.round((parent ? Math.max(0, (parent.width - width) / 2) : center.x - width / 2) / 24) * 24,
        y: Math.round((parent ? Math.max(0, (parent.height - height) / 2) : center.y - height / 2) / 24) * 24,
      })
      store.select([node.id])
    }, `Add ${type === 'path' ? 'vector path' : type}`)
    setTool('select')
  }

  return <div className="paper-app">
    <header className="app-header">
      <div className="app-brand"><PaperMark /><span>paper</span><span className="app-alpha">alpha</span></div>
      <div className="document-name"><span className="document-divider" /><input className="document-title" aria-label="Project name" value={name} maxLength={200} onChange={event => setName(event.target.value)} onBlur={() => { if (!name.trim()) setName('Untitled') }} /><ChevronDown size={12} /><span className="document-state">Local document</span></div>
      <div className="header-end"><ThemeSwitcher /><span className="local-status" role="status"><i />{io.status}</span><DocumentActions store={store} name={name.trim() || 'Untitled'} importing={io.importing} onSave={io.saveProject} onImport={io.importFile} onMessage={io.setMessage} /><button className={`dev-mode-toggle ${devMode ? 'active' : ''}`} data-testid="dev-mode-toggle" aria-label="Toggle dev mode" aria-pressed={devMode} title="Dev mode — inspect CSS and generate React + Tailwind code" onClick={() => setDevMode(!devMode)}><Code2 size={14} /><span>Dev</span></button><span className="project-avatar" title="Your self-hosted workspace">P</span></div>
    </header>
    <div className="editor-layout">
      {layersVisible && <LayerTree store={store} onHide={() => setLayersVisible(false)} />}
      <main className="canvas-stage">
        <div className="canvas-toolbar viewport-ui" role="toolbar" aria-label="Canvas tools">
          {!layersVisible && <button className="tool-button" title="Show layers" aria-label="Show layers" onClick={() => setLayersVisible(true)}><Layers size={17} /></button>}
          <button className={`tool-button ${tool === 'select' ? 'active' : ''}`} data-testid="tool-select" aria-label="Selection tool" aria-pressed={tool === 'select'} title="Selection tool" onClick={() => setTool('select')}><MousePointer2 size={17} /></button>
          <button className={`tool-button ${tool === 'hand' ? 'active' : ''}`} data-testid="tool-hand" aria-label="Pan tool" aria-pressed={tool === 'hand'} title="Pan tool (or hold Space)" onClick={() => setTool('hand')}><Hand size={17} /></button>
          <span className="toolbar-divider" />
          {creationTools.map(({ type, label, Icon }) => <button key={type} className="tool-button" data-testid={`tool-${type}`} aria-label={label} title={label} onClick={() => addElement(type)}><Icon size={16} /></button>)}
          <span className="toolbar-divider" />
          <button className={`tool-button ${grid ? 'grid-active' : ''}`} data-testid="tool-grid" aria-label="Toggle engineering grid" aria-pressed={grid} title="120px engineering grid" onClick={() => setGrid(!grid)}><Grid2X2 size={16} /></button>
          <span className="toolbar-divider" />
          <HistoryControls store={store} />
        </div>
        <SceneCanvas store={store} controller={controller} initialCamera={workspace.project?.viewport} grid={grid} panMode={tool === 'hand'} />
      </main>
      <ElementInspector store={store} controller={controller} grid={grid} onGridChange={() => setGrid(!grid)} />
      {devMode && <DevModeInspector store={store} onExit={() => setDevMode(false)} />}
    </div>
    <footer className="app-footer"><span><span className="footer-dot" />Paper / Infinite canvas</span><span>120 px grid<span className="footer-separator">/</span>Made to be yours.</span></footer>
    {io.message && <div className="io-notice" role="status"><span>{io.message}</span><button className="quiet-button" aria-label="Dismiss notification" onClick={() => io.setMessage('')}><X size={14} /></button></div>}
  </div>
}
