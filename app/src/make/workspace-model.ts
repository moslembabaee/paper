import type { AppProject, AppProjectSummary } from './types.ts'
import { api } from '../cloud/api.ts'
import { createAppProject } from './manifest.ts'
import type { CompileDiagnostic, CompilePreviewAssets, CompileResult } from './compiler.ts'

export interface ActionableDiagnostic {
  readonly title: string
  readonly location: string
  readonly message: string
  readonly actionableHint: string
  readonly code: string
  readonly severity: 'error' | 'warning'
  readonly file: string
  readonly line: number
  readonly column: number
}

export function formatDiagnostic(diag: CompileDiagnostic): ActionableDiagnostic {
  let title = 'Compiler Error'
  let actionableHint = 'Check the source file and ensure syntax and imports are valid.'

  switch (diag.code) {
    case 'SYNTAX_ERROR':
      title = 'Syntax Error'
      actionableHint = 'Check for unmatched tags, brackets, missing parentheses, or invalid TSX syntax.'
      break
    case 'DENIED_IMPORT':
      title = 'Denied Import'
      actionableHint = 'Only pre-approved allowlisted packages (react, react-dom, lucide-react, @paper-design/shaders-react) can be imported.'
      break
    case 'DYNAMIC_IMPORT_FORBIDDEN':
      title = 'Dynamic Import Forbidden'
      actionableHint = 'Dynamic import() is disabled for preview security. Use static top-level ES module imports instead.'
      break
    case 'FORBIDDEN_CALL':
      title = 'Forbidden Execution Call'
      actionableHint = 'Calls to eval() or the Function constructor are blocked in Paper Make sandbox.'
      break
    case 'FORBIDDEN_CSS_IMPORT':
      title = 'Forbidden CSS Import'
      actionableHint = 'External CSS @import rules are forbidden. Place all styles in project CSS files.'
      break
    case 'MISSING_ENTRY_POINT':
      title = 'Missing Entry Point'
      actionableHint = 'A valid TSX or JSX entry point file (such as src/App.tsx) must be present in the project.'
      break
    case 'MODULE_NOT_FOUND':
      title = 'Module Not Found'
      actionableHint = 'The imported local module could not be found. Check the relative file path.'
      break
    case 'OVERSIZED_SOURCE':
      title = 'Oversized Source'
      actionableHint = 'Source files must not exceed 512 KiB per file and 2 MiB in total.'
      break
    default:
      title = diag.code || 'Diagnostic'
      actionableHint = 'Resolve the issue shown in the diagnostic message.'
  }

  const location = `${diag.file}:${diag.line}:${diag.column}`
  return {
    title,
    location,
    message: diag.message,
    actionableHint,
    code: diag.code,
    severity: diag.severity,
    file: diag.file,
    line: diag.line,
    column: diag.column,
  }
}

export function createStarterMakeProject(name = 'Untitled App'): AppProject {
  return createAppProject({
    name,
    files: {
      'src/App.tsx': `import React, { useState } from 'react'
import { Sparkles } from 'lucide-react'
import './styles.css'

export default function App() {
  const [active, setActive] = useState(false)
  return (
    <main className="make-app-shell">
      <div className="card">
        <header className="card-header">
          <Sparkles size={20} className="icon" />
          <h1>{${JSON.stringify(name)}}</h1>
        </header>
        <p className="description">
          Welcome to your Paper Make functional prototype.
        </p>
        <button
          className={"toggle-btn " + (active ? 'active' : '')}
          onClick={() => setActive(!active)}
        >
          {active ? '✨ Active State' : 'Click to activate'}
        </button>
      </div>
    </main>
  )
}
`,
      'src/styles.css': `.make-app-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background-color: #080808;
  color: #edebe1;
  background-image: linear-gradient(#222222 1px, transparent 1px), linear-gradient(90deg, #222222 1px, transparent 1px);
  background-size: 120px 120px;
}
.card {
  max-width: 440px;
  width: 100%;
  background: #111111;
  border: 1px solid #222222;
  border-radius: 8px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.card-header h1 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: #edebe1;
}
.icon {
  color: #81adec;
}
.description {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: #888888;
}
.toggle-btn {
  background: #222222;
  color: #edebe1;
  border: 1px solid #333333;
  padding: 10px 18px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}
.toggle-btn:hover {
  border-color: #81adec;
}
.toggle-btn.active {
  background: #81adec;
  color: #080808;
  border-color: #81adec;
}
`,
    },
  })
}

export const MAKE_FIXTURES: Record<string, AppProject> = Object.freeze({
  counter: createAppProject({
    id: 'fixture-counter',
    name: 'Counter Demo',
    description: 'Interactive counter prototype demonstrating React state, lucide-react icons, and CSS variables.',
    files: {
      'src/App.tsx': `import React, { useState } from 'react'
import { Plus, Minus, RotateCcw } from 'lucide-react'
import './styles.css'

export default function App() {
  const [count, setCount] = useState(0)
  const [note, setNote] = useState('Interactive preview ready')

  return (
    <main className="counter-container">
      <div className="counter-card">
        <span className="badge">Paper Make Fixture</span>
        <h1 className="title">Counter Prototype</h1>
        <div className="display">
          <span className="value">{count}</span>
        </div>
        <div className="button-group">
          <button className="btn btn-secondary" aria-label="Decrement" onClick={() => setCount(c => c - 1)}>
            <Minus size={16} />
          </button>
          <button className="btn btn-primary" aria-label="Increment" onClick={() => setCount(c => c + 1)}>
            <Plus size={16} />
          </button>
          <button className="btn btn-secondary" aria-label="Reset" onClick={() => setCount(0)}>
            <RotateCcw size={16} />
          </button>
        </div>
        <label className="note-field">
          <span>Note</span>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Type note…"
          />
        </label>
        <p className="note-preview">{note}</p>
      </div>
    </main>
  )
}
`,
      'src/styles.css': `.counter-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background-color: #080808;
  color: #edebe1;
  background-image: linear-gradient(#222222 1px, transparent 1px), linear-gradient(90deg, #222222 1px, transparent 1px);
  background-size: 120px 120px;
}
.counter-card {
  width: 100%;
  max-width: 400px;
  background: #111111;
  border: 1px solid #222222;
  border-radius: 8px;
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: center;
}
.badge {
  align-self: center;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #81adec;
  background: rgba(129, 173, 236, 0.1);
  padding: 4px 10px;
  border-radius: 9999px;
  font-weight: 600;
}
.title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}
.display {
  padding: 20px 0;
}
.value {
  font-size: 56px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #edebe1;
}
.button-group {
  display: flex;
  justify-content: center;
  gap: 12px;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}
.btn-primary {
  background: #81adec;
  color: #080808;
  border-color: #81adec;
}
.btn-primary:hover {
  filter: brightness(1.1);
}
.btn-secondary {
  background: #1e1e1e;
  color: #edebe1;
  border-color: #2a2a2a;
}
.btn-secondary:hover {
  border-color: #81adec;
}
.note-field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  text-align: left;
}
.note-field span {
  font-size: 12px;
  color: #888888;
}
.note-field input {
  width: 100%;
  background: #080808;
  border: 1px solid #222222;
  border-radius: 6px;
  padding: 8px 12px;
  color: #edebe1;
  font-size: 13px;
  outline: none;
}
.note-field input:focus {
  border-color: #81adec;
}
.note-preview {
  margin: 0;
  font-size: 13px;
  color: #888888;
}
`,
    },
  }),

  malformed: createAppProject({
    id: 'fixture-malformed',
    name: 'Malformed App (Syntax Error)',
    description: 'Fixture containing unclosed TSX tags to verify actionable compiler diagnostics and error recovery.',
    files: {
      'src/App.tsx': `export default function App() {
  return (
    <div className="broken-app">
      <h1>Malformed TSX Demo</h1>
      <p>This component has an unclosed tag that should produce a syntax error.
      <div>
    </div>
  )
}
`,
    },
  }),

  deniedImport: createAppProject({
    id: 'fixture-denied-import',
    name: 'Denied Import App',
    description: 'Fixture importing unauthorized modules to test compiler allowlist enforcement.',
    files: {
      'src/App.tsx': `import fs from 'node:fs'
export default function App() {
  return <div>Testing denied import</div>
}
`,
    },
  }),

  empty: createAppProject({
    id: 'fixture-empty',
    name: 'Empty Starter',
    description: 'Clean blank canvas starter for custom prototyping.',
    files: {
      'src/App.tsx': `export default function App() {
  return (
    <div style={{ display: 'grid', placeContent: 'center', minHeight: '100vh', color: '#edebe1', background: '#080808' }}>
      <h2>Clean Slate</h2>
      <p style={{ opacity: 0.6 }}>Edit src/App.tsx to build your prototype.</p>
    </div>
  )
}
`,
    },
  }),
})

export type PreviewDeviceViewport = 'responsive' | 'desktop' | 'tablet' | 'mobile'

export interface PreviewTheme {
  mode: 'dark' | 'light'
  background: string
  foreground: string
  accent?: string
  grid?: string
}

export interface MakeWorkspaceState {
  projects: AppProject[]
  savedProjects: AppProjectSummary[]
  projectStatus: 'idle' | 'loading' | 'saving'
  listStatus: 'idle' | 'loading' | 'error'
  listError: string
  projectError: string
  activeProject: AppProject
  activeFilePath: string
  previewStatus: 'idle' | 'loading' | 'ready' | 'error'
  assets: CompilePreviewAssets | null
  diagnostics: CompileDiagnostic[]
  errorMessage: string
  deviceViewport: PreviewDeviceViewport
  previewTheme: PreviewTheme
  selectedDiagnosticIndex: number | null
}

export interface MakeRepository {
  list(signal?: AbortSignal): Promise<AppProjectSummary[]>
  read(id: string, signal?: AbortSignal): Promise<AppProject>
  create(project: AppProject, signal?: AbortSignal): Promise<AppProject>
  compile(project: AppProject, signal?: AbortSignal): Promise<CompileResult>
}

export function createMakeRepository(accountId?: string): MakeRepository {
  const headers = accountId ? { 'X-Paper-Account': accountId } : undefined
  return {
    list: async signal => (await api<{ apps: AppProjectSummary[] }>('/apps', { headers, signal })).apps,
    read: (id, signal) => api(`/apps/${encodeURIComponent(id)}`, { headers, signal }),
    create: (project, signal) => api('/apps', { method: 'POST', headers, signal, body: JSON.stringify({ project }) }),
    compile: (project, signal) => api('/apps/compile', { method: 'POST', headers, signal, body: JSON.stringify({ project }) }),
  }
}

export interface MakeWorkspaceStoreOptions {
  initialProject?: AppProject
  projects?: AppProject[]
  accountId?: string
  repository?: MakeRepository
  compiler?: (project: AppProject) => Promise<CompileResult>
}

export function createMakeWorkspaceStore(options: MakeWorkspaceStoreOptions = {}) {
  const initialProjects = options.projects?.length ? [...options.projects] : Object.values(MAKE_FIXTURES)
  const activeProject = options.initialProject ?? initialProjects[0]
  if (!initialProjects.some(project => project.id === activeProject.id)) initialProjects.unshift(activeProject)
  const repository = options.repository ?? createMakeRepository(options.accountId)
  let state: MakeWorkspaceState = {
    projects: initialProjects,
    savedProjects: [],
    projectStatus: 'idle', listStatus: 'idle', listError: '', projectError: '',
    activeProject,
    activeFilePath: activeProject.preview.entryPoint,
    previewStatus: 'idle', assets: null, diagnostics: [], errorMessage: '',
    deviceViewport: 'responsive',
    previewTheme: { mode: 'dark', background: '#080808', foreground: '#edebe1', accent: '#81adec', grid: '#222222' },
    selectedDiagnosticIndex: null,
  }
  const listeners = new Set<() => void>()
  let previewGeneration = 0, projectGeneration = 0, listGeneration = 0
  let previewRequest: AbortController | undefined
  let projectRequest: AbortController | undefined
  let listRequest: AbortController | undefined
  const message = (error: unknown) => error instanceof Error ? error.message : 'Request failed. Please try again.'
  function setState(patch: Partial<MakeWorkspaceState>) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }
  function stopPreview() {
    previewGeneration++
    previewRequest?.abort()
    setState({ previewStatus: 'idle', assets: null, diagnostics: [], errorMessage: '', selectedDiagnosticIndex: null })
  }
  function cancelProject() {
    projectGeneration++
    projectRequest?.abort()
  }
  function selectProject(project: AppProject) {
    cancelProject()
    stopPreview()
    setState({
      projects: [project, ...state.projects.filter(item => item.id !== project.id)],
      activeProject: project, activeFilePath: project.preview.entryPoint,
      projectStatus: 'idle', projectError: '',
    })
  }
  const store = {
    getState: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    selectProject,
    selectProjectById: (id: string) => {
      const project = state.projects.find(item => item.id === id)
      if (project) selectProject(project)
    },
    async loadProjects() {
      const generation = ++listGeneration
      listRequest?.abort()
      listRequest = new AbortController()
      setState({ listStatus: 'loading', listError: '' })
      try {
        const savedProjects = await repository.list(listRequest.signal)
        if (generation === listGeneration) setState({ savedProjects, listStatus: 'idle' })
      } catch (error) {
        if (generation === listGeneration) setState({ listStatus: 'error', listError: message(error) })
      }
    },
    async openSavedProject(id: string) {
      cancelProject()
      stopPreview()
      const generation = projectGeneration
      projectRequest = new AbortController()
      setState({ projectStatus: 'loading', projectError: '' })
      try {
        const project = await repository.read(id, projectRequest.signal)
        if (generation === projectGeneration) selectProject(project)
      } catch (error) {
        if (generation === projectGeneration) setState({ projectStatus: 'idle', projectError: message(error) })
      }
    },
    async saveCopy() {
      cancelProject()
      const generation = projectGeneration
      const draft = state.activeProject
      projectRequest = new AbortController()
      setState({ projectStatus: 'saving', projectError: '' })
      try {
        const copy = createAppProject({ name: draft.name, description: draft.description, files: draft.files, assetIds: draft.assetIds, sceneReference: draft.sceneReference, preview: { entryPoint: draft.preview.entryPoint } })
        const saved = await repository.create(copy, projectRequest.signal)
        if (generation !== projectGeneration) return
        selectProject(saved)
        setState({ savedProjects: [saved, ...state.savedProjects.filter(item => item.id !== saved.id)] })
      } catch (error) {
        if (generation === projectGeneration) setState({ projectStatus: 'idle', projectError: message(error) })
      }
    },
    createNewProject: (name = 'New Make App') => {
      const project = createStarterMakeProject(name)
      selectProject(project)
      return project
    },
    renameActiveProject: (name: string) => {
      stopPreview()
      const updated = { ...state.activeProject, name, updatedAt: new Date().toISOString() }
      setState({ projects: state.projects.map(project => project.id === updated.id ? updated : project), activeProject: updated })
    },
    updateActiveFile: (path: string, content: string) => {
      stopPreview()
      const updated = { ...state.activeProject, files: { ...state.activeProject.files, [path]: { path, content } }, updatedAt: new Date().toISOString() }
      setState({ projects: state.projects.map(project => project.id === updated.id ? updated : project), activeProject: updated })
    },
    setActiveFile: (activeFilePath: string) => setState({ activeFilePath }),
    setDeviceViewport: (deviceViewport: PreviewDeviceViewport) => setState({ deviceViewport }),
    setPreviewTheme: (previewTheme: PreviewTheme) => setState({ previewTheme }),
    setSelectedDiagnosticIndex: (selectedDiagnosticIndex: number | null) => setState({ selectedDiagnosticIndex }),
    async runPreview() {
      if (state.projectStatus !== 'idle') return
      stopPreview()
      const generation = previewGeneration
      previewRequest = new AbortController()
      const project = state.activeProject
      setState({ previewStatus: 'loading' })
      try {
        const result = await (options.compiler ? options.compiler(project) : repository.compile(project, previewRequest.signal))
        if (generation !== previewGeneration) return
        if (result.success && result.assets) {
          setState({ previewStatus: 'ready', assets: result.assets, diagnostics: [...result.diagnostics] })
        } else {
          setState({ previewStatus: 'error', assets: null, diagnostics: [...result.diagnostics], errorMessage: 'This app could not compile. Resolve the diagnostics below and retry.', selectedDiagnosticIndex: result.diagnostics.length ? 0 : null })
        }
      } catch (error) {
        if (generation === previewGeneration) setState({ previewStatus: 'error', assets: null, diagnostics: [], errorMessage: message(error) })
      }
    },
    reportRuntimeError(error: { message: string }) {
      previewGeneration++
      previewRequest?.abort()
      setState({ previewStatus: 'error', assets: null, errorMessage: `Runtime error: ${error.message}`, diagnostics: [] })
    },
    stopPreview,
    retryPreview: () => store.runPreview(),
    suspend() {
      cancelProject()
      listGeneration++
      listRequest?.abort()
      stopPreview()
      setState({ projectStatus: 'idle', listStatus: 'idle' })
    },
  }
  return store
}

export type MakeWorkspaceStore = ReturnType<typeof createMakeWorkspaceStore>
