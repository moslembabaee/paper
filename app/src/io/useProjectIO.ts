import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ViewportController } from '../canvas/ViewportController'
import { createDemoScene } from '../scene/seed'
import { SceneStore } from '../scene/store'
import { exportBounds } from './svg'
import { importClipboard, importHTML, importSVG, insertImportedScene } from './import'
import { createProject, downloadFile, fileName, MAX_IMPORT_BYTES, parseProject, PROJECT_STORAGE_KEY, serializeProject } from './project'
import type { PaperProject } from './project'

export function createWorkspace() {
  let project: PaperProject | null = null
  let restoreError = ''
  try {
    const saved = localStorage.getItem(PROJECT_STORAGE_KEY)
    if (saved) project = parseProject(saved)
  } catch { restoreError = 'The local project could not be restored. Open a saved JSON file to recover it.' }
  const store = project ? new SceneStore() : createDemoScene()
  if (project) store.load(project.scene)
  store.clearHistory()
  return { store, controller: new ViewportController(project?.viewport), project, restoreError }
}

export interface ProjectIOProps {
  store: SceneStore
  controller: ViewportController
  name: string
  grid: boolean
  onOpen: (project: PaperProject) => void
  onImport: () => void
  initialMessage?: string
  onPersist: (project: PaperProject) => Promise<void>
}

export function useProjectIO({ store, controller, name, grid, onOpen, onImport, onPersist, initialMessage = '' }: ProjectIOProps) {
  const [message, setMessage] = useState(initialMessage)
  const [status, setStatus] = useState('All changes local')
  const [importing, setImporting] = useState(false)
  const values = useRef({ name, grid, onOpen, onImport })
  const busy = useRef(false)
  const revision = useRef(0)
  const autosaveTimer = useRef(0)
  const dirty = useRef(false)
  useLayoutEffect(() => { values.current = { name, grid, onOpen, onImport } })

  const getProject = useCallback(() => createProject(store, values.current.name, controller.getSnapshot().camera, values.current.grid), [store, controller])

  const persistProject = useCallback(async (project = getProject()) => {
    window.clearTimeout(autosaveTimer.current)
    dirty.current = false
    try {
      await onPersist(project)
      if (!dirty.current) setStatus('Saved locally')
    } catch (error) {
      dirty.current = true
      setStatus('Save unavailable · save JSON')
      throw error
    }
  }, [getProject, onPersist])

  useEffect(() => {
    const persist = () => {
      if (!dirty.current) return
      void persistProject().catch(() => { dirty.current = true })
    }
    const schedule = () => {
      dirty.current = true
      setStatus('Saving locally…')
      window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = window.setTimeout(persist, 650)
    }
    const unsubscribeScene = store.subscribe(() => { revision.current++; schedule() })
    const unsubscribeCamera = controller.subscribe(schedule)
    const hide = () => { if (document.hidden) persist() }
    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', hide)
    schedule()
    return () => {
      window.clearTimeout(autosaveTimer.current)
      unsubscribeScene()
      unsubscribeCamera()
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', hide)
      persist()
    }
  }, [store, controller, persistProject, name, grid])

  const saveProject = useCallback(() => {
    downloadFile(new Blob([serializeProject(getProject())], { type: 'application/json' }), fileName(values.current.name, 'paper.json'))
    setMessage('Project saved. Open the JSON file in Paper to continue editing.')
  }, [getProject])

  const center = useCallback(() => {
    const { size } = controller.getSnapshot()
    return controller.screenToWorld({ x: size.width / 2, y: size.height / 2 })
  }, [controller])

  const importFile = useCallback(async (file: File) => {
    if (busy.current) return
    busy.current = true
    setImporting(true)
    const before = revision.current
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('Import files must be smaller than 16 MB.')
      const source = await file.text()
      if (/\.json$/i.test(file.name)) {
        const project = parseProject(source)
        if (before !== revision.current) throw new Error('The document changed while opening the file. Please open it again.')
        store.load(project.scene)
        store.clearHistory()
        controller.setCamera(project.viewport, false)
        values.current.onOpen(project)
        setMessage(`Opened “${project.name}”.`)
      } else {
        const document = /\.svg$/i.test(file.name) ? importSVG(source, file.name.replace(/\.svg$/i, '')) : /\.html?$/i.test(file.name) ? await importHTML(source) : null
        if (!document) throw new Error('Choose a Paper JSON, SVG, or HTML file. From Figma, use “Copy as SVG”.')
        insertImportedScene(store, document, center())
        values.current.onImport()
        const bounds = exportBounds(store.getSnapshot(), 'selection')
        if (bounds) controller.fit(bounds, 80)
        setMessage(`Imported “${file.name}”.`)
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not import this file.') }
    finally { busy.current = false; setImporting(false) }
  }, [store, controller, center])

  useEffect(() => {
    const editing = (target: EventTarget | null) => target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"]')
    const paste = async (event: ClipboardEvent) => {
      if (editing(event.target) || !event.clipboardData || busy.current) return
      const data = event.clipboardData
      const svg = data.getData('image/svg+xml')
      const html = data.getData('text/html')
      const text = data.getData('text/plain')
      const file = [...data.files].find(file => file.type === 'image/svg+xml')
      if (file) { event.preventDefault(); void importFile(file); return }
      if (!svg && !html && !/^\s*(?:<\?xml|<!--|<[a-z])/i.test(text)) return
      event.preventDefault()
      busy.current = true
      setImporting(true)
      try {
        const document = await importClipboard({ svg, html, text })
        if (!document) throw new Error('Paste SVG or HTML markup. In Figma, use “Copy as SVG”.')
        insertImportedScene(store, document, center())
        values.current.onImport()
        setMessage(document.rootIds.length === 1 && document.elements[document.rootIds[0]].type === 'image' ? 'SVG pasted as a scalable vector image.' : 'HTML pasted as editable layers.')
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not paste this artwork.') }
      finally { busy.current = false; setImporting(false) }
    }
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && !event.altKey) { event.preventDefault(); saveProject() }
    }
    document.addEventListener('paste', paste)
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('paste', paste); document.removeEventListener('keydown', keydown) }
  }, [store, center, importFile, saveProject])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 8000)
    return () => window.clearTimeout(timer)
  }, [message])

  return { status, message, setMessage, saveProject, importFile, importing, getProject, persistProject }
}

