import { useCallback, useEffect, useRef, useState } from 'react'
import { Circle, Code2, Frame, GitBranch, Grid2X2, Hand, Image, Layers, ListChecks, MessageSquare, MousePointer2, PenTool, Play, Sparkles, Square, Type, X } from 'lucide-react'
import type { ElementType } from './scene/types'
import { componentRoot } from './scene/components'
import { SceneCanvas } from './scene/SceneCanvas'
import { DocumentSidebar } from './tokens/DocumentSidebar'
import { ElementInspector } from './scene/ElementInspector'
import { DevModeInspector } from './scene/DevModeInspector'
import { ShaderBrowser } from './shaders/ShaderBrowser'
import { togglePixelSnap } from './scene/pixelSnap'
import { HistoryControls } from './scene/HistoryControls'
import { useProjectIO } from './io/useProjectIO'
import { DocumentActions } from './io/DocumentActions'
import { ThemeSwitcher } from './design-system/ThemeSwitcher'
import { ProfileMenu } from './workspace/ProfileMenu'
import { ProjectSwitcher } from './workspace/ProjectSwitcher'
import { readProfile } from './workspace/profile'
import type { UserProfile } from './workspace/types'
import { useCloudSync } from './cloud/useCloudSync'
import { SyncStatus } from './cloud/SyncStatus'
import type { CloudAccountState } from './cloud/CloudAccount'
import { useWorkspace } from './workspace/useWorkspace'
import { RoadmapDialog } from './roadmap/RoadmapDialog'
import { useLiveBridge } from './mcp/useLiveBridge'
import { ConnectionWires } from './prototype/ConnectionWires'
import { PrototypeInspector } from './prototype/PrototypeInspector'
import { PresentationPlayer } from './prototype/PresentationPlayer'
import { useCollaboration } from './collaboration/useCollaboration'
import { PresenceBar } from './collaboration/PresenceBar'
import { roomFromHash } from './collaboration/room'
import { useComments } from './comments/useComments'
import { CommentOverlay } from './comments/CommentOverlay'
import { CommentsSidebar } from './comments/CommentsSidebar'
import './comments/comments.css'
import './prototype/prototype.css'
import './mcp/bridge.css'
import './App.css'
import './workspace/workspace.css'

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

export default function Studio({ account }: { account: CloudAccountState }) {
  const manager = useWorkspace(account.user?.id)
  const [profile, setProfile] = useState(readProfile)
  if (!manager.active) return <div className="workspace-loading" role="status"><PaperMark /><span>Opening your workspace…</span></div>
  return <Editor key={manager.active.record.id} workspace={manager.active} manager={manager} account={account} profile={profile} onProfileSave={setProfile} />
}

function Editor({ workspace, manager, profile, onProfileSave, account }: {
  workspace: NonNullable<ReturnType<typeof useWorkspace>['active']>
  manager: ReturnType<typeof useWorkspace>
  account: CloudAccountState
  profile: UserProfile
  onProfileSave: (profile: UserProfile) => void
}) {
  const { controller, store } = workspace
  const [name, setName] = useState(workspace.project?.name ?? 'Space to think')
  const [tool, setTool] = useState<'select' | 'hand' | 'pen' | 'comment'>('select')
  const [shadersOpen, setShadersOpen] = useState(false)
  const [grid, setGrid] = useState(workspace.project?.grid ?? true)
  const [layersVisible, setLayersVisible] = useState(true)
  const [devMode, setDevMode] = useState(false)
  const [prototypeMode, setPrototypeMode] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [interactionId, setInteractionId] = useState<string | null>(null)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [roadmapOpen, setRoadmapOpen] = useState(false)
  const [changing, setChanging] = useState(false)
  const transition = useRef(false)
  const saveLocalProject = manager.save
  const onPersist = useCallback((project: Parameters<typeof saveLocalProject>[1]) => saveLocalProject(workspace.record.id, project), [saveLocalProject, workspace.record.id])
  const io = useProjectIO({ store, controller, name, grid, onPersist, initialMessage: manager.error, onOpen: project => { setName(project.name); setGrid(project.grid) }, onImport: () => setTool('select') })

  const cloud = useCloudSync(manager, io, account.user, remote => { setName(remote.document.name); setGrid(remote.document.grid) })
  const bridge = useLiveBridge({ projectId: workspace.record.id, store, documentSync: false, getProject: io.getProject, onSettings: project => { setName(project.name); setGrid(project.grid) } })
  const projectRoom = workspace.record.cloud?.projectId ?? workspace.record.id
  const [activeRoom, setActiveRoom] = useState(() => roomFromHash(window.location.hash))
  const roomId = activeRoom ?? projectRoom

  useEffect(() => {
    const onHashChange = () => setActiveRoom(roomFromHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const activateCollaboration = useCallback(() => {
    setActiveRoom(roomId)
  }, [roomId])

  const collaboration = useCollaboration(roomId, store, controller, profile.name, activeRoom !== null)
  const comments = useComments(workspace.record.id, store, controller, profile.name)
  const { setOpen: setCommentsOpen, setDraft: setCommentDraft, setActiveId: setCommentActiveId } = comments
  const startComment = useCallback(() => { setTool('comment'); setCommentsOpen(true); setCommentDraft(null); setCommentActiveId(null); setPrototypeMode(false) }, [setCommentsOpen, setCommentDraft, setCommentActiveId])
  const cancelComment = () => { if (tool === 'comment') setTool('select') }
  const closeComments = () => { comments.setOpen(false); comments.setDraft(null); cancelComment() }

  async function changeProject(action: () => Promise<void>) {
    if (transition.current || io.importing) return
    transition.current = true
    setChanging(true)
    controller.stop()
    try {
      await io.persistProject()
      // Clear the invitation before mounting the next editor, so it opens solo.
      if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search)
      await action()
    }
    finally { transition.current = false; setChanging(false) }
  }

  async function renameProject(id: string, next: string) {
    if (id === workspace.record.id) {
      await io.persistProject({ ...io.getProject(), name: next })
      setName(next)
    } else await manager.rename(id, next)
  }

  const addElement = useCallback((type: ElementType) => {
    const { elements, selection } = store.getSnapshot()
    const selected = selection.length === 1 ? elements[selection[0]] : undefined
    let parentId = type === 'frame' ? null : selected?.type === 'frame' ? selected.id : selected?.parentId ?? null
    const component = parentId ? componentRoot(elements, parentId) : undefined
    if (component?.component?.kind === 'instance') parentId = component.parentId
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
  }, [store, controller])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (presenting) return
      if (event.defaultPrevented || event.repeat || (event.target as Element).closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [data-token-ui]')) return
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === "'" || event.key === '"' || event.code === 'Quote')) {
        event.preventDefault()
        togglePixelSnap()
        return
      }
      if (event.key === 'Escape' && tool === 'comment') { event.preventDefault(); setTool('select'); return }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'c') { event.preventDefault(); startComment(); return }
      if (prototypeMode) {
        if (key === 'v' || key === 'm') { event.preventDefault(); setTool('select') }
        if (key === 'h') { event.preventDefault(); setTool('hand') }
        return
      }
      if (key === 'p') { event.preventDefault(); setTool('pen') }
      if (key === 'm' || key === 'v') { event.preventDefault(); setTool('select') }
      if (key === 'h') { event.preventDefault(); setTool('hand') }
      if (key === 's') { event.preventDefault(); setTool('select'); setShadersOpen(true) }
      if (key === 'f') { event.preventDefault(); addElement('frame') }
      if (key === 'r') { event.preventDefault(); addElement('rectangle') }
      if (key === 'o') { event.preventDefault(); addElement('ellipse') }
      if (key === 't') { event.preventDefault(); addElement('text') }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [prototypeMode, presenting, addElement, tool, startComment])

  return <div className="paper-app">
    <header className="app-header">
      <div className="app-brand"><PaperMark /><span>paper</span><span className="app-alpha">alpha</span></div>
      <ProjectSwitcher name={name} activeId={workspace.record.id} projects={manager.projects.map(project => project.id === workspace.record.id ? { ...project, name: name.trim() || 'Untitled' } : project)} workspaceName={profile.workspaceName} persistent={manager.persistent} disabled={changing || io.importing} open={projectsOpen} onToggle={setProjectsOpen} onNameChange={setName} onSwitch={id => changeProject(() => manager.open(id))} onCreate={next => changeProject(() => manager.create(next, profile.defaultGrid, account.user?.id))} onRename={renameProject} sync={<SyncStatus state={cloud.state} status={cloud.status} localStatus={io.status} persistent={manager.persistent} error={cloud.error} onRetry={cloud.retry} />} />
      <div className="header-end"><PresenceBar session={collaboration} onActivate={activateCollaboration} room={roomId} /><span className="bridge-status" role="status" data-testid="bridge-status" data-connected={bridge.connected} data-active={!!(bridge.activity || cloud.activity)} title={bridge.connected ? 'MCP connected · agents edit the focused canvas' : 'Start the local Paper bridge to connect an agent'}><i />{bridge.activity || cloud.activity ? 'Agent editing' : bridge.connected ? 'MCP live' : account.user?.hasMcpToken && cloud.state === 'synced' ? 'MCP ready' : 'MCP offline'}</span><ThemeSwitcher /><DocumentActions store={store} name={name.trim() || 'Untitled'} importing={io.importing || changing} onSave={io.saveProject} onImport={io.importFile} onMessage={io.setMessage} /><button className={`dev-mode-toggle ${devMode ? 'active' : ''}`} data-testid="dev-mode-toggle" aria-label="Toggle dev mode" aria-pressed={devMode} title="Dev mode — inspect CSS and generate React + Tailwind code" onClick={() => { setDevMode(!devMode); setPrototypeMode(false); setTool('select') }}><Code2 size={14} /><span>Dev</span></button><button className={`prototype-mode-toggle ${prototypeMode ? 'active' : ''}`} data-testid="prototype-mode-toggle" aria-label="Toggle prototype mode" aria-pressed={prototypeMode} onClick={() => { setPrototypeMode(!prototypeMode); comments.setOpen(false); setTool('select'); setDevMode(false); setInteractionId(null) }}><GitBranch size={14} /><span>Prototype</span></button><button className="prototype-present-button" aria-label="Present prototype" title="Present prototype" onClick={() => setPresenting(true)}><Play size={14} fill="currentColor" /></button><ProfileMenu account={{ ...account, logout: async () => { await io.persistProject(); await account.logout() } }} profile={profile} onSave={onProfileSave} onOpenProjects={() => setProjectsOpen(true)} /></div>
    </header>
    <div className="editor-layout" inert={changing}>
      {layersVisible && <DocumentSidebar store={store} controller={controller} onHide={() => setLayersVisible(false)} />}
      <main className="canvas-stage">
        <div className="canvas-toolbar viewport-ui" role="toolbar" aria-label="Canvas tools">
          {!layersVisible && <button className="tool-button" title="Show layers" aria-label="Show layers" onClick={() => setLayersVisible(true)}><Layers size={17} /></button>}
          <button className={`tool-button ${tool === 'select' ? 'active' : ''}`} data-testid="tool-select" aria-label="Selection tool" aria-pressed={tool === 'select'} title="Selection tool" onClick={() => setTool('select')}><MousePointer2 size={17} /></button>
          <button className={`tool-button ${tool === 'hand' ? 'active' : ''}`} data-testid="tool-hand" aria-label="Pan tool" aria-pressed={tool === 'hand'} title="Pan tool (or hold Space)" onClick={() => setTool('hand')}><Hand size={17} /></button>
          <span className="toolbar-divider" />
          {!prototypeMode && creationTools.map(({ type, label, Icon }) => <button key={type} className={`tool-button ${type === 'path' && tool === 'pen' ? 'active' : ''}`} data-testid={`tool-${type}`} aria-label={label} aria-pressed={type === 'path' ? tool === 'pen' : undefined} title={type === 'path' ? 'Pen tool (P) · Click to draw, drag for curves' : label} onClick={() => type === 'path' ? setTool('pen') : addElement(type)}><Icon size={16} /></button>)}
          <span className="toolbar-divider" />
          <button className={`tool-button ${grid ? 'grid-active' : ''}`} data-testid="tool-grid" aria-label="Toggle engineering grid" aria-pressed={grid} title="120px engineering grid" onClick={() => setGrid(!grid)}><Grid2X2 size={16} /></button>
          <span className="toolbar-divider" />
          {!prototypeMode && <button className="tool-button" data-testid="tool-shaders" aria-label="Browse shaders" title="Shaders (S)" onClick={() => { setTool('select'); setShadersOpen(true) }}><Sparkles size={16} /></button>}
          <button className={`tool-button comment-tool ${comments.open ? 'active' : ''}`} data-testid="tool-comments" aria-label="Toggle comments" aria-pressed={comments.open} aria-expanded={comments.open} aria-controls={comments.open ? "paper-comments" : undefined} title="Comments · Place a pin with C" onClick={() => comments.open ? closeComments() : comments.setOpen(true)}><MessageSquare size={16} />{!!comments.unread.size && <span className="comment-tool-unread">{comments.unread.size}</span>}</button>
          <HistoryControls store={store} />
        </div>
        <SceneCanvas commentMode={tool === 'comment'} annotationOverlay={comments.open ? <CommentOverlay store={store} controller={controller} threads={comments.threads} unread={comments.unread} activeId={comments.activeId} draft={comments.draft} placing={tool === 'comment'} onSelect={thread => { setTool('select'); comments.select(thread) }} onPlace={anchor => { comments.setDraft(anchor); comments.setActiveId(null); setTool('select') }} /> : undefined} collaboration={collaboration} prototypeOverlay={prototypeMode ? <ConnectionWires store={store} controller={controller} panMode={tool === 'hand'} selectedId={interactionId} onSelect={setInteractionId} /> : undefined} agentActivity={cloud.activity || bridge.activity} store={store} controller={controller} initialCamera={workspace.initialCamera} grid={grid} panMode={tool === 'hand'} penMode={tool === 'pen'} onExitPen={() => setTool('select')} />
        {comments.open && <CommentsSidebar comments={comments} store={store} session={collaboration} placing={tool === 'comment'} onNew={startComment} onCancel={cancelComment} onClose={closeComments} />}
        {prototypeMode && <div className="prototype-canvas-status"><GitBranch size={12} /><span>PROTOTYPE</span><span>Select a layer · Drag a connection</span></div>}
      </main>
      {prototypeMode ? <PrototypeInspector store={store} selectedId={interactionId} onSelect={setInteractionId} onPresent={() => setPresenting(true)} /> : devMode ? <DevModeInspector store={store} name={name.trim() || 'Untitled'} onSave={io.saveProject} onMessage={io.setMessage} onExit={() => setDevMode(false)} /> : <ElementInspector store={store} controller={controller} grid={grid} onGridChange={() => setGrid(!grid)} onOpenShaders={() => { setTool('select'); setShadersOpen(true) }} />}
    </div>
    <footer className="app-footer"><span><span className="footer-dot" />Paper / Infinite canvas<button className="roadmap-trigger" aria-label="Open development roadmap" aria-haspopup="dialog" onClick={() => setRoadmapOpen(true)}><ListChecks size={11} />Roadmap</button></span><span>120 px grid<span className="footer-separator">/</span>Made to be yours.</span></footer>
    {presenting && <PresentationPlayer store={store} onClose={() => setPresenting(false)} />}
    {roadmapOpen && <RoadmapDialog onClose={() => setRoadmapOpen(false)} />}
    {shadersOpen && <ShaderBrowser store={store} onClose={() => setShadersOpen(false)} />}
    {io.message && <div className="io-notice" role="status"><span>{io.message}</span><button className="quiet-button" aria-label="Dismiss notification" onClick={() => io.setMessage('')}><X size={14} /></button></div>}
  </div>
}
