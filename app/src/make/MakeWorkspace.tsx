import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, Code2, FileCode2, Play, Plus, RotateCcw, Save, Square, Sparkles } from 'lucide-react'
import { PreviewFrame, type PreviewFrameStatus } from './PreviewFrame'
import { createMakeWorkspaceStore, formatDiagnostic } from './workspace-model'
import { PlanInspection } from './PlanInspection'
import { DiffInspection } from './DiffInspection'
import './make.css'

export default function MakeWorkspace({ accountId, onDesign }: { accountId?: string; onDesign: () => void }) {
  const [store] = useState(() => createMakeWorkspaceStore({ accountId }))
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const [frameStatus, setFrameStatus] = useState<PreviewFrameStatus>('idle')
  const [openingId, setOpeningId] = useState<string | null>(null)
  const promptInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    void store.loadProjects()
    void store.loadBudget()
    return () => store.suspend()
  }, [store])
  const busy = state.projectStatus !== 'idle'
  const planBusy = state.planStatus === 'generating' || state.planStatus === 'approving' || state.planStatus === 'generating_app'
  const running = state.previewStatus === 'ready' && frameStatus === 'ready'
  const loading = state.previewStatus === 'loading' || (state.assets !== null && !running)
  const status = state.previewStatus === 'error' ? 'Error' : running ? 'Running' : loading ? 'Loading' : 'Stopped'
  const active = state.activeProject
  const savedIds = new Set(state.savedProjects.map(project => project.id))

  function choose(id: string) {
    setOpeningId(id)
    if (savedIds.has(id)) void store.openSavedProject(id)
    else store.selectProjectById(id)
  }

  return <div className="make-workspace" data-testid="make-workspace">
    <header className="make-header">
      <button className="make-button make-back" aria-label="Design workspace" onClick={onDesign}><ArrowLeft size={14} /><span>Design</span></button>
      <div className="make-brand"><Sparkles size={17} /><span>paper <strong>make</strong></span><span className="make-alpha">alpha</span></div>
      <label className="make-chooser"><span className="make-sr-only">Make project</span>
        <select value={active.id} onChange={event => choose(event.target.value)} disabled={state.projectStatus === 'saving'}>
          <optgroup label="Saved apps">{state.savedProjects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</optgroup>
          <optgroup label="Examples & drafts">{state.projects.filter(project => !savedIds.has(project.id)).map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</optgroup>
        </select>
      </label>
      <div className="make-header-actions">
        {state.budget ? (
          <div
            className="make-budget-badge"
            data-testid="make-budget-badge"
            title={`Turns: ${state.budget.remainingTurns}/${state.budget.limitTurns} remaining`}
          >
            <Sparkles size={11} className="make-budget-icon" />
            <span>{state.budget.remainingTurns} turns</span>
          </div>
        ) : null}
        <button className="make-button" disabled={busy} onClick={() => store.createNewProject()}><Plus size={14} /><span>New app</span></button>
        <button className="make-button" disabled={busy} onClick={() => { setOpeningId(null); void store.saveCopy() }}><Save size={14} /><span>{state.projectStatus === 'saving' ? 'Saving…' : 'Save a copy'}</span></button>
      </div>
    </header>
    <div className="make-layout">
      <aside className="make-sidebar" aria-label="App project details">
        <div className="make-project-meta"><span className="make-eyebrow">APP PROJECT / REV {active.revision}</span><h1>{active.name}</h1><p>{active.description ?? 'An interactive React app. Run the preview to bring it to life.'}</p>
          <span className="make-storage-note">{savedIds.has(active.id) ? 'Saved to your account' : 'Example or unsaved draft'}</span>
        </div>
        {state.listStatus === 'loading' ? <p className="make-notice" role="status">Loading saved apps…</p> : null}
        {state.listError ? <div className="make-notice" role="alert"><p>Could not load saved apps: {state.listError}</p><button className="make-button" onClick={() => { void store.loadProjects() }}>Retry project list</button></div> : null}
        {state.projectError ? <div className="make-notice" role="alert"><p>{state.projectError}</p><button className="make-button" onClick={() => state.projectError && openingId ? choose(openingId) : void store.saveCopy()}>Retry project request</button></div> : null}
        {state.currentDiff ? <DiffInspection diff={state.currentDiff} rollbackRevision={state.rollbackPoint?.revision} busy={busy || planBusy} onRollback={() => { void store.rollback().catch(() => {}) }} /> : null}
        <section className="make-files" aria-label="Source files"><h2><FileCode2 size={14} />Source files<span>{Object.keys(active.files).length}</span></h2>
          {Object.values(active.files).map(file => <details key={`${active.id}:${file.path}`}>
            <summary><Code2 size={13} /><span>{file.path}</span></summary><pre>{file.content}</pre>
          </details>)}
        </section>
        <section className="make-diagnostics" data-testid="make-diagnostics" aria-label="Compiler diagnostics">
          <h2>Diagnostics<span>{state.diagnostics.length.toString().padStart(2, '0')}</span></h2>
          {state.diagnostics.length ? state.diagnostics.map((diagnostic, index) => {
            const item = formatDiagnostic(diagnostic)
            const source = active.files[item.file]?.content.split('\n')
            return <article className="make-diagnostic" key={index}><strong>{item.title}</strong><code>{item.location}</code><p>{item.message}</p><p className="make-diagnostic-hint">{item.actionableHint}</p>
              {source ? <pre aria-label={`Source near line ${item.line}`}>{source.slice(Math.max(0, item.line - 2), item.line + 1).map((line, offset) => `${Math.max(1, item.line - 1) + offset}  ${line}`).join('\n')}</pre> : null}
            </article>
          }) : <p className="make-diagnostics-empty">{running ? 'Compiled successfully. No issues found.' : 'Compiler details appear here after a run.'}</p>}
        </section>
      </aside>
      <main className="make-stage" aria-label="Make preview">
        <div className="make-preview-toolbar"><div className="make-preview-label"><span className="make-status-dot" data-status={status} /><span>Preview</span><span className="make-preview-status" data-testid="make-preview-status" role="status">{status}</span></div>
          {state.assets || state.previewStatus === 'loading' ? <button className="make-button" onClick={store.stopPreview}><Square size={12} fill="currentColor" />Stop preview</button> : state.previewStatus !== 'error' ? <button className="make-button make-primary" disabled={busy} onClick={() => { void store.runPreview() }}><Play size={13} fill="currentColor" />Run preview</button> : null}
        </div>
        <div className="make-prompt-bar" role="region" aria-label="Prompt planner">
          <form
            className="make-prompt-form"
            onSubmit={e => {
              e.preventDefault()
              void store.generatePlan()
            }}
            aria-label="App plan prompt"
            aria-busy={planBusy}
          >
            <Sparkles size={14} className="make-prompt-icon" />
            <input
              type="text"
              ref={promptInput}
              className="make-prompt-input"
              data-testid="make-prompt-input"
              placeholder="Prompt an app or feature to inspect the plan (files, interactions, risks)…"
              value={state.planPrompt}
              onChange={e => store.setPlanPrompt(e.target.value)}
              aria-label="Prompt for app planning"
              aria-describedby="make-planning-status"
              maxLength={64 * 1024}
              disabled={planBusy || busy}
            />
            <button
              type="submit"
              className="make-button make-primary make-plan-submit"
              data-testid="make-plan-submit"
              disabled={!state.planPrompt.trim() || planBusy || busy}
              aria-label={state.planStatus === 'generating' ? 'Planning in progress' : 'Generate plan'}
            >
              {state.planStatus === 'generating' ? <span className="make-loader-inline" /> : <Sparkles size={13} />}
              <span>{state.planStatus === 'generating' ? 'Planning…' : 'Plan'}</span>
            </button>
            {state.planStatus === 'generating_app' ? <button type="button" className="make-button" onClick={store.cancelAppGeneration}>Cancel generation</button> : null}
            {state.planStatus === 'generating' ? <button type="button" className="make-button" onClick={() => { store.cancelPlanning(); requestAnimationFrame(() => promptInput.current?.focus()) }}>Cancel planning</button> : null}
          </form>
          <p id="make-planning-status" className="make-planning-status" role="status">{state.planStatus === 'generating' ? 'Planning your app…' : state.planStatus === 'approving' ? 'Approving plan…' : state.planStatus === 'generating_app' ? 'Generating your app…' : 'Plan only · Review before making changes.'}</p>
          {state.planError && !state.currentPlan ? <p className="make-plan-alert" role="alert">{state.planError}</p> : null}
        </div>
        {state.errorMessage && state.assets ? <p className="make-generation-error" role="alert">{state.errorMessage} Showing your last usable preview.</p> : null}
        <div className="make-preview-canvas" aria-busy={loading || state.projectStatus === 'loading'}>
          {state.currentPlan ? (
            <PlanInspection
              key={state.currentPlan.planId}
              plan={state.currentPlan}
              currentRevision={active.revision}
              planStatus={state.planStatus}
              applied={state.planStatus === 'approved' && state.currentPlan.baseRevision + 1 === active.revision}
              planError={state.planError}
              onApprove={() => { void store.approveCurrentPlan().catch(() => {}) }}
              onGenerate={() => { void store.generateFromApprovedPlan().catch(() => {}) }}
              onRevise={newPrompt => {
                void store.reviseCurrentPlan(newPrompt)
              }}
              onDismiss={() => { store.clearPlan(); promptInput.current?.focus() }}
              busy={planBusy || busy}
            />
          ) : null}
          {state.assets ? <PreviewFrame assets={state.assets} onStatusChange={setFrameStatus} onError={store.reportRuntimeError} /> : null}
          {state.projectStatus === 'loading' || loading ? <div className="make-empty make-loading" role="status"><span className="make-loader" /><h2>{state.projectStatus === 'loading' ? 'Opening app…' : state.assets ? 'Starting preview…' : 'Compiling your app…'}</h2><p>{state.projectStatus === 'loading' ? 'Reading the saved revision.' : 'Preparing an interactive preview.'}</p></div> : null}
          {!state.assets && !loading && state.projectStatus !== 'loading' ? <div className="make-empty">
            {state.previewStatus === 'error' ? <><span className="make-empty-icon"><Code2 size={24} /></span><h2>Let’s get this running.</h2><p role="alert">{state.errorMessage}</p>{state.diagnostics.length ? <p>Check the file locations and fix guidance in Diagnostics.</p> : <p>Check your app source or connection, then try again.</p>}<button className="make-button make-primary" disabled={busy} onClick={() => { void store.retryPreview() }}><RotateCcw size={14} />Retry preview</button></> : <><span className="make-empty-icon"><Sparkles size={24} /></span><span className="make-eyebrow">FROM SOURCE TO SOMETHING REAL</span><h2>A space to make it work.</h2><p>Choose a saved app or try an example.<br />Your interactive preview starts here.</p><button className="make-button make-primary" disabled={busy} onClick={() => { void store.runPreview() }}><Play size={13} fill="currentColor" />Start preview</button></>}
          </div> : null}
        </div>
        <footer className="make-footer"><span>React / {active.preview.entryPoint}</span><span>120 px grid · Paper Make</span></footer>
      </main>
    </div>
  </div>
}
