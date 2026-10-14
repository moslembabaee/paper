import type { PaperProject } from '../io/project'
import type { LocalProject, ProjectSummary } from './types'

export const WORKSPACE_DATABASE = 'paper.workspaces'
let connection: Promise<IDBDatabase> | undefined

function database(): Promise<IDBDatabase> {
  if (connection) return connection
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false
    const request = indexedDB.open(WORKSPACE_DATABASE, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('projects', { keyPath: 'id' })
      request.result.createObjectStore('settings')
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => { blocked = true; reject(new Error('Close other Paper tabs to open the local workspace.')) }
    request.onsuccess = () => {
      const db = request.result
      if (blocked) { db.close(); return }
      db.onversionchange = () => { db.close(); connection = undefined }
      resolve(db)
    }
  }).catch(error => { connection = undefined; throw error })
  return connection
}

function completed(transaction: IDBTransaction): Promise<void> {
  const promise = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('Local project storage was interrupted.'))
    transaction.onerror = () => reject(transaction.error)
  })
  // Read requests can fail before the caller reaches its await of the commit.
  // Keep that rejection handled; awaiting this promise still reports the failure.
  void promise.catch(() => {})
  return promise
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function projectSummary({ id, name, createdAt, updatedAt }: LocalProject): ProjectSummary {
  return { id, name, createdAt, updatedAt }
}

export function localProject(document: PaperProject): LocalProject {
  const now = Date.now()
  return { id: crypto.randomUUID(), name: document.name, createdAt: now, updatedAt: now, document }
}

/** Migration and initial creation share one transaction, including in Strict Mode. */
export async function initializeProjects(seed: PaperProject): Promise<{ projects: ProjectSummary[]; active: LocalProject; created: boolean }> {
  const db = await database()
  const transaction = db.transaction(['projects', 'settings'], 'readwrite')
  const done = completed(transaction)
  const projects = transaction.objectStore('projects')
  const settings = transaction.objectStore('settings')
  const [records, activeId] = await Promise.all([
    result(projects.getAll() as IDBRequest<LocalProject[]>),
    result(settings.get('activeProject') as IDBRequest<string | undefined>),
  ])
  const created = !records.length
  if (created) {
    const first = localProject(seed)
    projects.put(first)
    records.push(first)
  }
  records.sort((a, b) => b.updatedAt - a.updatedAt)
  const active = records.find(record => record.id === activeId) ?? records[0]
  settings.put(active.id, 'activeProject')
  await done
  return { projects: records.map(projectSummary), active, created }
}

export async function readProject(id: string): Promise<LocalProject> {
  const db = await database()
  const record = await result(db.transaction('projects').objectStore('projects').get(id) as IDBRequest<LocalProject | undefined>)
  if (!record) throw new Error('This project could not be found. Reload Paper to refresh the project list.')
  return record
}

export async function writeProject(record: LocalProject, activate = false): Promise<void> {
  const db = await database()
  const transaction = db.transaction(activate ? ['projects', 'settings'] : ['projects'], 'readwrite')
  const done = completed(transaction)
  transaction.objectStore('projects').put(record)
  if (activate) transaction.objectStore('settings').put(record.id, 'activeProject')
  await done
}

export async function activateProject(id: string): Promise<void> {
  const db = await database()
  const transaction = db.transaction('settings', 'readwrite')
  const done = completed(transaction)
  transaction.objectStore('settings').put(id, 'activeProject')
  await done
}

export async function renameProject(id: string, name: string): Promise<ProjectSummary> {
  const db = await database()
  const transaction = db.transaction('projects', 'readwrite')
  const done = completed(transaction)
  const projects = transaction.objectStore('projects')
  const record = await result(projects.get(id) as IDBRequest<LocalProject | undefined>)
  if (!record) { await done; throw new Error('This project could not be found.') }
  const renamed = { ...record, name, updatedAt: Date.now(), document: { ...record.document, name } }
  projects.put(renamed)
  await done
  return projectSummary(renamed)
}

export async function listLocalProjects(): Promise<LocalProject[]> {
  const db = await database()
  return result(db.transaction('projects').objectStore('projects').getAll() as IDBRequest<LocalProject[]>)
}

/** Read/modify/write in one IndexedDB transaction, shared with other open tabs. */
export async function updateLocalProject(id: string, update: (current: LocalProject | undefined) => LocalProject | undefined): Promise<LocalProject | undefined> {
  const db = await database()
  const transaction = db.transaction('projects', 'readwrite')
  const done = completed(transaction)
  const store = transaction.objectStore('projects')
  const record = await new Promise<LocalProject | undefined>((resolve, reject) => {
    const request = store.get(id) as IDBRequest<LocalProject | undefined>
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      try {
        const next = update(request.result)
        if (next) store.put(next)
        resolve(next)
      } catch (error) { transaction.abort(); reject(error) }
    }
  })
  await done
  return record
}
