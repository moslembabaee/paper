import { useCallback, useEffect, useRef, useState } from 'react'
import type { useWorkspace } from '../workspace/useWorkspace'
import { listLocalProjects, readProject } from '../workspace/database'
import type { LocalProject } from '../workspace/types'
import type { useProjectIO } from '../io/useProjectIO'
import type { CloudProject, CloudUser } from './model'
import { canonical, newer } from './model'
import { api, ApiError } from './api'
import type { AgentActivity } from '../mcp/protocol'

export function useCloudSync(manager: ReturnType<typeof useWorkspace>, io: ReturnType<typeof useProjectIO>, user: CloudUser | null, onSettings: (record: CloudProject) => void) {
  const [status, setStatus] = useState('Offline')
  const [offered, setOffered] = useState<LocalProject[]>([])
  const [activity, setActivity] = useState<AgentActivity | null>(null)
  const [migrationOpen, setMigrationOpen] = useState(false)
  const [error, setError] = useState('')
  const current = useRef({ manager, io, user, onSettings })
  current.current = { manager, io, user, onSettings }
  const kick = useRef<() => void>(() => {})
  const generation = useRef(0)
  const activeId = manager.active?.record.id
  const store = manager.active?.store
  useEffect(() => {
    if (!store) return
    return store.subscribe(() => { generation.current++; kick.current() })
  }, [store])
  useEffect(() => { kick.current() }, [manager.projects])

  useEffect(() => {
    if (!user) { setOffered([]); setMigrationOpen(false); setStatus('Offline'); return }
    let stopped = false, running = false, again = false
    let debounce: ReturnType<typeof setTimeout> | undefined
    let offeredOnce = false
    try { offeredOnce = sessionStorage.getItem(`paper.cloud.offered.${user.id}`) === 'yes' } catch { /* Optional preference */ }
    const owner = user.id
    const valid = () => !stopped && current.current.user?.id === owner
    const revision = async (record: LocalProject) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(record.document))))).map(v => v.toString(16).padStart(2, '0')).join('')
    const apply = async (local: LocalProject | undefined, remote: CloudProject, version: number) => {
      if (!valid()) return
      // Defer pulls if the open canvas changed during the network request.
      if (local && local.id === current.current.manager.active?.record.id && (generation.current !== version || canonical(current.current.io.getProject()) !== canonical(local.document))) { again = true; return }
      const record: LocalProject = {
        id: local?.id ?? `${owner}_${remote.id}`, name: remote.document.name, document: remote.document,
        createdAt: remote.createdAt, updatedAt: remote.updatedAt,
        cloud: { owner, projectId: remote.id, revision: remote.revision, syncedAt: remote.updatedAt, dirty: false },
      }
      if (!await current.current.manager.acceptCloud(record, local?.document)) { again = true; return }
      if (!valid()) return
      if (local?.id === current.current.manager.active?.record.id && generation.current !== version) { again = true; return }
      if (record.id === current.current.manager.active?.record.id && canonical(current.current.io.getProject()) !== canonical(remote.document)) {
        current.current.manager.active.store.applyRemote(remote.document.scene)
        current.current.manager.active.controller.setCamera(remote.document.viewport, false)
        current.current.onSettings(remote)
        if (remote.activity && remote.activity.until > Date.now()) setActivity(remote.activity)
      }
    }
    const run = async () => {
      if (!valid()) return
      if (running) { again = true; return }
      running = true; again = false
      setStatus('Syncing…')
      try {
        await current.current.io.persistProject()
        const version = generation.current
        const locals = await listLocalProjects()
        const guests = locals.filter(record => !record.cloud)
        setOffered(guests)
        if (!offeredOnce && guests.length) { setMigrationOpen(true); offeredOnce = true; try { sessionStorage.setItem(`paper.cloud.offered.${owner}`, 'yes') } catch { /* Optional preference */ } }
        const { projects: remoteList } = await api<{ projects: Pick<CloudProject, 'id' | 'revision'>[] }>('/projects', { headers: { 'X-Paper-Account': owner } })
        if (!valid()) return
        const known = locals.filter(record => record.cloud?.owner === owner)
        for (const entry of remoteList) {
          if (!valid()) return
          const local = known.find(record => record.cloud?.projectId === entry.id)
          if (local?.cloud?.revision === entry.revision) continue
          const remote = await api<CloudProject>(`/projects/${encodeURIComponent(entry.id)}`, { headers: { 'X-Paper-Account': owner } })
          // Reload persisted metadata so an in-flight local autosave is never overwritten.
          const fresh = local ? await readProject(local.id) : undefined
          if (!fresh?.cloud?.dirty || !newer({ updatedAt: fresh.updatedAt, revision: await revision(fresh) }, remote)) await apply(fresh, remote, version)
          else { fresh.cloud.revision = remote.revision; await current.current.manager.acceptCloud(fresh, fresh.document) }
        }
        for (const snapshot of await listLocalProjects()) {
          if (!valid()) return
          if (snapshot.cloud?.owner !== owner || !snapshot.cloud.dirty) continue
          const id = snapshot.cloud.projectId
          try {
            const remote = await api<CloudProject>(`/projects/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'X-Paper-Account': owner }, body: JSON.stringify({ document: snapshot.document, updatedAt: snapshot.updatedAt, expectedRevision: snapshot.cloud.revision }) })
            if (!valid()) return
            const latest = await readProject(snapshot.id)
            if (canonical(latest.document) === canonical(snapshot.document)) await apply(latest, remote, version)
            else { latest.cloud = { ...snapshot.cloud, revision: remote.revision, syncedAt: remote.updatedAt, dirty: true }; await current.current.manager.acceptCloud(latest, latest.document); again = true }
          } catch (failure) {
            if (!(failure instanceof ApiError) || failure.status !== 409) throw failure
            if (failure.current) {
              const fresh = await readProject(snapshot.id)
              if (newer({ updatedAt: fresh.updatedAt, revision: await revision(fresh) }, failure.current)) { fresh.cloud = { ...snapshot.cloud, revision: failure.current.revision, dirty: true }; await current.current.manager.acceptCloud(fresh, fresh.document); again = true }
              else await apply(fresh, failure.current, version)
            }
          }
        }
        if (valid()) { setStatus('Saved to cloud'); setError('') }
      } catch (failure) {
        if (valid()) { setStatus('Offline'); if (failure instanceof ApiError && [401, 403].includes(failure.status)) setError('Your account session changed. Reload Paper to resume cloud sync.') }
      } finally { running = false; if (again && valid()) schedule() }
    }
    const schedule = () => { if (!valid()) return; clearTimeout(debounce); debounce = setTimeout(() => void run(), 1000) }
    kick.current = schedule
    const events = new EventSource(`/api/events?account=${encodeURIComponent(owner)}`)
    events.addEventListener('project', schedule)
    events.onopen = schedule
    const online = () => { void run() }
    window.addEventListener('online', online)
    window.addEventListener('focus', online)
    const poll = setInterval(() => { if (!document.hidden) void run() }, 15_000)
    void run()
    return () => { stopped = true; events.close(); clearTimeout(debounce); clearInterval(poll); kick.current = () => {}; window.removeEventListener('online', online); window.removeEventListener('focus', online) }
  }, [user?.id, activeId])

  useEffect(() => { if (!activity) return; const timeout = setTimeout(() => setActivity(null), Math.max(0, activity.until - Date.now())); return () => clearTimeout(timeout) }, [activity])
  const uploadLocal = useCallback(async () => {
    const { user, manager, io } = current.current
    if (!user) return
    try {
      await io.persistProject()
      for (const record of await listLocalProjects()) {
        if (current.current.user?.id !== user.id) return
        if (record.cloud) continue
        record.cloud = { owner: user.id, projectId: record.id, revision: null, syncedAt: 0, dirty: true }
        await manager.acceptCloud(record, record.document)
      }
      setMigrationOpen(false); setOffered([]); kick.current()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not prepare projects for upload') }
  }, [])
  return { status, offered, migrationOpen, setMigrationOpen, uploadLocal, activity, error }
}
