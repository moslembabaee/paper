import type { AppSceneReference, AppGenerateResult, AppPlan, AppProject, AppProjectSummary, AppProjectRollbackResult, ModelBudget } from './types.ts'
import { api, ApiError } from '../cloud/api.ts'
import { createAppProject, validateAppProject } from './manifest.ts'
import type { CompileDiagnostic, CompilePreviewAssets, CompileResult } from './compiler.ts'
import { fetchModelBudget, requestModelPlan, approveModelPlan, requestAppGeneration } from './model-gateway.ts'
import { approvePlan, isPlanStale, StalePlanApprovalError, validateAppPlan, PlanValidationError } from './plan.ts'
import { computeBoundedDiff, type BoundedDiff } from './diff.ts'

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
  budget: ModelBudget | null
  planMode: 'idle' | 'planning' | 'inspecting' | 'revising'
  currentPlan: AppPlan | null
  planPrompt: string
  designReference: AppSceneReference | null
  planError: string
  planStatus: 'idle' | 'generating' | 'approving' | 'approved' | 'generating_app' | 'stale'
  currentDiff: BoundedDiff | null
  rollbackPoint: {
    revision: number
    project: AppProject
    assets: CompilePreviewAssets | null
  } | null
}

export interface MakeRepository {
  list(signal?: AbortSignal): Promise<AppProjectSummary[]>
  read(id: string, signal?: AbortSignal): Promise<AppProject>
  create(project: AppProject, signal?: AbortSignal): Promise<AppProject>
  compile(project: AppProject, signal?: AbortSignal): Promise<CompileResult>
  rollback?(id: string, expectedRevision: number, targetRevision?: number, signal?: AbortSignal): Promise<AppProjectRollbackResult>
}

export function createMakeRepository(accountId?: string): MakeRepository {
  const headers = accountId ? { 'X-Paper-Account': accountId } : undefined
  return {
    list: async signal => (await api<{ apps: AppProjectSummary[] }>('/apps', { headers, signal })).apps,
    read: (id, signal) => api(`/apps/${encodeURIComponent(id)}`, { headers, signal }),
    create: (project, signal) => api('/apps', { method: 'POST', headers, signal, body: JSON.stringify({ project }) }),
    compile: (project, signal) => api('/apps/compile', { method: 'POST', headers, signal, body: JSON.stringify({ project }) }),
    rollback: (id, expectedRevision, targetRevision, signal) => api(`/apps/${encodeURIComponent(id)}/rollback`, { method: 'POST', headers, signal, body: JSON.stringify({ expectedRevision, targetRevision }) }),
  }
}

export interface MakeWorkspaceStoreOptions {
  initialProject?: AppProject
  projects?: AppProject[]
  accountId?: string
  repository?: MakeRepository
  compiler?: (project: AppProject) => Promise<CompileResult>
  planner?: (prompt: string, project: AppProject) => Promise<AppPlan>
  generator?: (plan: AppPlan, project: AppProject) => Promise<AppGenerateResult>
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
    budget: null,
    planMode: 'idle',
    currentPlan: null,
    planPrompt: '',
    designReference: null,
    planError: '',
    planStatus: 'idle',
    currentDiff: null,
    rollbackPoint: null,
  }
  const listeners = new Set<() => void>()
  let previewGeneration = 0, projectGeneration = 0, listGeneration = 0, planGeneration = 0
  let previewRequest: AbortController | undefined
  let projectRequest: AbortController | undefined
  let listRequest: AbortController | undefined
  let budgetRequest: AbortController | undefined
  let planRequest: AbortController | undefined
  let planSource: string | null = null
  const sourceKey = (project: AppProject) => JSON.stringify(project)
  function cancelPlan() {
    planGeneration++
    planRequest?.abort()
    if (state.planStatus === 'generating_app') setState({ previewStatus: state.assets ? 'ready' : 'idle' })
  }
  function invalidatePlan() {
    cancelPlan()
    setState({ planStatus: state.currentPlan ? 'stale' : 'idle', planError: state.currentPlan ? 'Stale plan approval: the app has changed. Generate a new plan.' : '' })
  }
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
    cancelPlan()
    const switched = project.id !== state.activeProject.id
    const stale = !switched && state.currentPlan && sourceKey(project) !== planSource
    setState({
      projects: [project, ...state.projects.filter(item => item.id !== project.id)],
      activeProject: project, activeFilePath: project.preview.entryPoint,
      projectStatus: 'idle', projectError: '',
      currentPlan: switched ? null : state.currentPlan,
      planStatus: stale ? 'stale' : state.currentPlan && !switched && state.currentPlan.status === 'approved' ? 'approved' : 'idle',
      planError: stale ? 'Stale plan approval: the app has changed. Generate a new plan.' : '',
      planMode: switched ? 'idle' : state.planMode,
      planPrompt: switched ? '' : state.planPrompt,
      currentDiff: switched ? null : state.currentDiff,
      rollbackPoint: switched ? null : state.rollbackPoint,
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
      invalidatePlan()
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
      invalidatePlan()
      stopPreview()
      const updated = { ...state.activeProject, name, updatedAt: new Date().toISOString() }
      setState({ projects: state.projects.map(project => project.id === updated.id ? updated : project), activeProject: updated })
    },
    updateActiveFile: (path: string, content: string) => {
      invalidatePlan()
      stopPreview()
      const updated = { ...state.activeProject, files: { ...state.activeProject.files, [path]: { path, content } }, updatedAt: new Date().toISOString() }
      setState({ projects: state.projects.map(project => project.id === updated.id ? updated : project), activeProject: updated, currentDiff: null })
    },
    setActiveFile: (activeFilePath: string) => setState({ activeFilePath }),
    setDeviceViewport: (deviceViewport: PreviewDeviceViewport) => setState({ deviceViewport }),
    setPreviewTheme: (previewTheme: PreviewTheme) => setState({ previewTheme }),
    setSelectedDiagnosticIndex: (selectedDiagnosticIndex: number | null) => setState({ selectedDiagnosticIndex }),
    async runPreview() {
      if (state.projectStatus !== 'idle' || state.planStatus === 'generating_app') return
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
    async loadBudget() {
      budgetRequest?.abort()
      const request = new AbortController()
      budgetRequest = request
      try {
        const budget = await fetchModelBudget(undefined, { signal: request.signal, accountId: options.accountId })
        if (!request.signal.aborted) setState({ budget })
      } catch {
        // Unauthenticated or offline; ignore gracefully
      }
    },
    setBudget: (budget: ModelBudget | null) => setState({ budget }),
    setDesignReference(reference: AppSceneReference | null) {
      if (JSON.stringify(state.designReference) === JSON.stringify(reference)) return
      cancelPlan()
      planSource = null
      setState({ designReference: reference ? structuredClone(reference) : null, currentPlan: null, planStatus: 'idle', planError: '' })
    },
    setPlanPrompt: (prompt: string) => setState({ planPrompt: prompt }),
    setPlanMode: (planMode: 'idle' | 'planning' | 'inspecting' | 'revising') => setState({ planMode }),
    async generatePlan(promptText?: string) {
      const prompt = (promptText ?? state.planPrompt).trim()
      if (!prompt || state.projectStatus !== 'idle') return null
      cancelPlan()
      const generation = planGeneration
      planRequest = new AbortController()
      const project = state.activeProject
      const source = sourceKey(project)
      const saved = state.savedProjects.some(item => item.id === project.id)
      setState({
        currentPlan: null,
        planPrompt: prompt,
        planMode: 'inspecting',
        planStatus: 'generating',
        planError: '',
      })
      try {
        let plan: AppPlan
        if (options.planner) {
          plan = await options.planner(prompt, structuredClone(project))
        } else {
          const res = await requestModelPlan(
            {
              prompt,
              sceneReference: state.designReference,
              ...(saved ? { appId: project.id, expectedRevision: project.revision } : { project }),
            },
            {
              signal: planRequest.signal,
              accountId: options.accountId,
            }
          )
          plan = res.plan
          if (!saved) plan = { ...plan, appId: project.id, baseRevision: project.revision }
          if (generation === planGeneration && res.budget) setState({ budget: res.budget })
        }
        if (generation === planGeneration) {
          plan = validateAppPlan(plan)
          if (plan.appId !== project.id || plan.baseRevision !== project.revision || plan.prompt !== prompt || plan.status !== 'draft') {
            throw new PlanValidationError('Plan does not match the requested app, prompt or revision')
          }
          planSource = source
          setState({
            currentPlan: plan,
            planStatus: 'idle',
            planError: '',
          })
          return plan
        }
        return null
      } catch (error) {
        if (generation === planGeneration) {
          setState({
            planStatus: 'idle',
            planError: message(error),
          })
        }
        return null
      }
    },
    async approveCurrentPlan() {
      const plan = state.currentPlan
      if (!plan) return null
      if (state.planStatus === 'generating' || state.planStatus === 'approving' || state.projectStatus !== 'idle') return null
      if (isPlanStale(plan, state.activeProject.revision) || plan.appId !== state.activeProject.id || planSource !== sourceKey(state.activeProject)) {
        setState({
          planStatus: 'stale',
          planError: 'Stale plan approval: the app has changed. Generate a new plan.',
        })
        throw new StalePlanApprovalError(
          'Stale plan approval: the app no longer matches the source used for this plan.'
        )
      }
      const generation = planGeneration
      try {
        let approved = approvePlan(plan, state.activeProject.revision)
        if (state.savedProjects.some(p => p.id === state.activeProject.id)) {
          planRequest = new AbortController()
          setState({ planStatus: 'approving', planError: '' })
          const result = await approveModelPlan(state.activeProject.id, plan, { accountId: options.accountId, signal: planRequest.signal })
          if (!result.ok || result.plan.status !== 'approved' || result.plan.planId !== plan.planId) throw new PlanValidationError('Server did not approve this plan')
          approved = result.plan
        }
        if (generation !== planGeneration) return null
        setState({ currentPlan: approved, planStatus: 'approved', planError: '' })
        return approved
      } catch (error) {
        if (generation === planGeneration) setState({ planStatus: error instanceof ApiError && error.status === 409 ? 'stale' : 'idle', planError: message(error) })
        throw error
      }
    },
    async generateFromApprovedPlan() {
      const plan = state.currentPlan
      if (!plan || plan.status !== 'approved') {
        throw new Error('An approved plan is required to generate the app')
      }
      if (isPlanStale(plan, state.activeProject.revision) || planSource !== sourceKey(state.activeProject)) {
        setState({
          planStatus: 'stale',
          planError: 'Stale plan approval: the app has changed. Generate a new plan.',
        })
        throw new StalePlanApprovalError(
          'Stale plan approval: the app no longer matches the source used for this plan.'
        )
      }
      if (state.planStatus === 'generating_app' || state.projectStatus !== 'idle') return null

      previewGeneration++
      previewRequest?.abort()
      const previousAssets = state.assets
      cancelPlan()
      const generation = ++planGeneration
      planRequest = new AbortController()
      const project = state.activeProject
      const saved = state.savedProjects.some(item => item.id === project.id)

      setState({
        planStatus: 'generating_app',
        planError: '',
        previewStatus: previousAssets ? 'ready' : 'loading',
        errorMessage: '',
      })

      try {
        let result: AppGenerateResult
        if (options.generator) {
          result = await options.generator(plan, structuredClone(project))
        } else {
          result = await requestAppGeneration(
            {
              plan,
              ...(saved ? { appId: project.id, expectedRevision: project.revision } : { project }),
            },
            {
              signal: planRequest.signal,
              accountId: options.accountId,
            }
          )
        }

        if (generation !== planGeneration) return null

        if (result.budget) {
          setState({ budget: result.budget })
        }

        if (!result.success || !result.assets) {
          setState({
            planStatus: 'approved',
            previewStatus: previousAssets ? 'ready' : 'error',
            assets: previousAssets,
            diagnostics: [...result.diagnostics],
            errorMessage: result.error || 'The generated code could not compile. Review the diagnostics below.',
            selectedDiagnosticIndex: result.diagnostics.length ? 0 : null,
          })
          return { success: false, diagnostics: result.diagnostics }
        }

        const updatedProject: AppProject = result.project ?? {
          ...project,
          revision: project.revision + 1,
          files: result.files ?? { ...project.files, ...(result.generatedFiles ?? {}) },
          updatedAt: new Date().toISOString(),
        }

        if (updatedProject.id !== project.id || updatedProject.revision !== project.revision + 1) {
          throw new PlanValidationError('Generated app does not match the expected project revision')
        }
        planSource = sourceKey(updatedProject)

        const boundedDiff = computeBoundedDiff(project.files, updatedProject.files, {
          baseRevision: project.revision,
          targetRevision: updatedProject.revision,
        })

        const rollbackPoint = {
          revision: project.revision,
          project: structuredClone(project),
          assets: previousAssets,
        }

        setState({
          projects: [updatedProject, ...state.projects.filter(p => p.id !== updatedProject.id)],
          activeProject: updatedProject,
          activeFilePath: updatedProject.preview.entryPoint,
          previewStatus: 'ready',
          assets: result.assets,
          diagnostics: [...result.diagnostics],
          errorMessage: '',
          planStatus: 'approved',
          planError: '',
          currentDiff: boundedDiff,
          rollbackPoint,
          savedProjects: saved && result.project
            ? [result.project, ...state.savedProjects.filter(p => p.id !== result.project!.id)]
            : state.savedProjects,
        })

        return { success: true, project: updatedProject, assets: result.assets, diff: boundedDiff, rollbackRevision: rollbackPoint.revision }
      } catch (error) {
        if (generation === planGeneration) {
          setState({
            planStatus: error instanceof ApiError && error.status === 409 ? 'stale' : 'approved',
            planError: message(error),
            previewStatus: previousAssets ? 'ready' : 'idle',
          })
        }
        throw error
      }
    },
    async rollback() {
      const point = state.rollbackPoint
      if (!point || state.projectStatus !== 'idle' || state.planStatus === 'generating_app') return null
      const current = state.activeProject
      const saved = state.savedProjects.some(p => p.id === current.id)
      previewGeneration++
      previewRequest?.abort()
      cancelPlan()
      cancelProject()
      const generation = projectGeneration
      const source = sourceKey(current)
      projectRequest = new AbortController()
      setState({ projectStatus: 'saving', projectError: '' })
      try {
        let restored: AppProject
        let compiled: Pick<CompileResult, 'success' | 'assets' | 'diagnostics'>
        if (saved) {
          if (!repository.rollback) throw new Error('Rollback is unavailable for this repository')
          const result = await repository.rollback(current.id, current.revision, point.revision, projectRequest.signal)
          if (!result.ok) throw new Error('Rollback validation failed')
          restored = result.project
          compiled = { success: true, assets: result.assets, diagnostics: result.diagnostics }
        } else {
          restored = validateAppProject({ ...point.project, revision: current.revision + 1, updatedAt: new Date().toISOString() })
          compiled = await (options.compiler ? options.compiler(restored) : repository.compile(restored, projectRequest.signal))
        }
        if (generation !== projectGeneration) return null
        if (sourceKey(state.activeProject) !== source) {
          setState({ projectStatus: 'idle', projectError: 'Rollback conflict: the app has changed.' })
          return null
        }
        if (!compiled.success || !compiled.assets) throw new Error('Rollback build validation failed. Current revision is unchanged.')
        planSource = null
        setState({
          projects: [restored, ...state.projects.filter(p => p.id !== restored.id)],
          activeProject: restored, activeFilePath: restored.preview.entryPoint,
          projectStatus: 'idle', previewStatus: 'ready', assets: compiled.assets,
          diagnostics: [...compiled.diagnostics], errorMessage: '',
          rollbackPoint: null, currentDiff: null, planStatus: 'idle', currentPlan: null,
          savedProjects: saved ? [restored, ...state.savedProjects.filter(p => p.id !== restored.id)] : state.savedProjects,
        })
        return restored
      } catch (error) {
        if (generation === projectGeneration) setState({ projectStatus: 'idle', projectError: message(error) })
        throw error
      }
    },
    canRollback: () => state.rollbackPoint !== null,
    cancelAppGeneration() {
      if (state.planStatus !== 'generating_app') return
      cancelPlan()
      setState({ planStatus: 'approved', planError: 'Generation cancelled. Your previous revision is unchanged.' })
    },
    async reviseCurrentPlan(newPrompt: string) {
      setState({
        planPrompt: newPrompt,
        planMode: 'revising',
      })
      return store.generatePlan(newPrompt)
    },
    cancelPlanning() {
      cancelPlan()
      setState({ currentPlan: null, planMode: 'idle', planStatus: 'idle', planError: '' })
    },
    clearPlan() {
      cancelPlan()
      planSource = null
      setState({
        currentPlan: null,
        planMode: 'idle',
        planStatus: 'idle',
        planError: '',
        planPrompt: '',
      })
    },
    stopPreview,
    retryPreview: () => store.runPreview(),
    suspend() {
      cancelPlan()
      budgetRequest?.abort()
      cancelProject()
      listGeneration++
      listRequest?.abort()
      stopPreview()
      setState({ projectStatus: 'idle', listStatus: 'idle', planStatus: state.planStatus === 'generating' || state.planStatus === 'approving' || state.planStatus === 'generating_app' ? 'idle' : state.planStatus })
    },
  }
  return store
}

export type MakeWorkspaceStore = ReturnType<typeof createMakeWorkspaceStore>
