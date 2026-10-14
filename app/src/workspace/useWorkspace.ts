import { useCallback, useEffect, useRef, useState } from 'react'
import { ViewportController } from '../canvas/ViewportController'
import type { Camera } from '../canvas/types'
import { createProject, parseProject } from '../io/project'
import type { PaperProject } from '../io/project'
import { createWorkspace } from '../io/useProjectIO'
import { SceneStore } from '../scene/store'
import { activateProject, initializeProjects, localProject, projectSummary, readProject, updateLocalProject, writeProject } from './database'
import type { LocalProject, ProjectSummary } from './types'
import { canonical } from '../cloud/model'
import { roomFromHash } from '../collaboration/room'

interface EditorWorkspace {
  record: LocalProject
  project: PaperProject
  store: SceneStore
  controller: ViewportController
  initialCamera?: Camera
}

function editorWorkspace(record: LocalProject): EditorWorkspace {
  const project = parseProject(JSON.stringify(record.document))
  const store = new SceneStore()
  store.load(project.scene)
  store.clearHistory()
  return { record, project, store, controller: new ViewportController(project.viewport), initialCamera: project.viewport }
}

export function useWorkspace() {
  const [initial] = useState(createWorkspace)
  const [active, setActive] = useState<EditorWorkspace | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [error, setError] = useState('')
  const [persistent, setPersistent] = useState(true)
  const initialization = useRef<ReturnType<typeof initializeProjects> | null>(null)
  const records = useRef(new Map<string, LocalProject>())
  const updateSummary = useCallback((summary: ProjectSummary) => {
    setProjects(current => [...current.filter(project => project.id !== summary.id), summary].sort((a, b) => b.updatedAt - a.updatedAt))
  }, [])

  useEffect(() => {
    let cancelled = false
    const seed = initial.project ?? createProject(initial.store, 'Space to think', initial.controller.getSnapshot().camera, true)
    initialization.current ??= initializeProjects(seed)
    void initialization.current.then(async restored => {
      const room = roomFromHash(window.location.hash)
      if (room && room !== restored.active.id) {
        let shared: LocalProject
        try { shared = await readProject(room) }
        catch {
          const document = createProject(new SceneStore(), 'Shared canvas', { x: 0, y: 0, zoom: 1 }, true)
          shared = { ...localProject(document), id: room }
          await writeProject(shared)
        }
        if (cancelled) return
        await activateProject(room)
        restored = { ...restored, active: shared, created: false, projects: [...restored.projects.filter(project => project.id !== room), projectSummary(shared)] }
      }
      if (cancelled) return
      const workspace = restored.created && !initial.project
        ? { record: restored.active, project: seed, store: initial.store, controller: initial.controller, initialCamera: undefined }
        : editorWorkspace(restored.active)
      records.current.set(restored.active.id, restored.active)
      setProjects(restored.projects)
      setActive(workspace)
      setError(initial.restoreError)
    }).catch(reason => {
      if (cancelled) return
      setPersistent(false)
      const record = localProject(seed)
      // Keep the demo's initial fit when storage is unavailable.
      setActive({ record, ...initial, project: seed, initialCamera: initial.project?.viewport })
      setProjects([projectSummary(record)])
      setError(`${reason instanceof Error ? reason.message : 'IndexedDB is unavailable.'} Changes are in memory; save a JSON copy before closing Paper.`)
    })
    return () => { cancelled = true }
  }, [initial])

  const save = useCallback(async (id: string, document: PaperProject) => {
    if (!persistent) throw new Error('Local storage is unavailable. Save a JSON copy before closing Paper.')
    let changed = false
    const record = await updateLocalProject(id, previous => {
      if (!previous) throw new Error('The open project could not be found.')
      changed = canonical(previous.document) !== canonical(document)
      if (!changed) return previous
      return { ...previous, document, name: document.name, updatedAt: Date.now(), ...(previous.cloud ? { cloud: { ...previous.cloud, dirty: true } } : {}) }
    })
    if (!record) return
    records.current.set(id, record)
    if (changed) updateSummary(projectSummary(record))
  }, [persistent, updateSummary])

  const open = useCallback(async (id: string) => {
    const record = await readProject(id)
    const workspace = editorWorkspace(record)
    await activateProject(id)
    records.current.set(id, record)
    setActive(workspace)
  }, [])

  const create = useCallback(async (name: string, grid: boolean, cloudOwner?: string) => {
    const document = createProject(new SceneStore(), name, { x: 0, y: 0, zoom: 1 }, grid)
    const record = localProject(document)
    if (cloudOwner) record.cloud = { owner: cloudOwner, projectId: record.id, revision: null, syncedAt: 0, dirty: true }
    await writeProject(record, true)
    records.current.set(record.id, record)
    updateSummary(projectSummary(record))
    setActive(editorWorkspace(record))
  }, [updateSummary])

  const rename = useCallback(async (id: string, name: string) => {
    const record = await updateLocalProject(id, previous => {
      if (!previous) throw new Error('This project could not be found.')
      return { ...previous, name, updatedAt: Date.now(), document: { ...previous.document, name }, ...(previous.cloud ? { cloud: { ...previous.cloud, dirty: true } } : {}) }
    })
    if (!record) return
    records.current.set(id, record)
    updateSummary(projectSummary(record))
  }, [updateSummary])

  const acceptCloud = useCallback(async (record: LocalProject, expected?: PaperProject) => {
    const accepted = await updateLocalProject(record.id, previous => {
      if (expected && previous && canonical(previous.document) !== canonical(expected)) return undefined
      return record
    })
    if (!accepted) return false
    records.current.set(record.id, accepted)
    updateSummary(projectSummary(accepted))
    return true
  }, [updateSummary])

  return { active, projects, persistent, error, save, open, create, rename, acceptCloud }
}
