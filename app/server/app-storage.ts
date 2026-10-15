import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import {
  migrateAppProject, parseAppProject, parseJsonStrict, serializeAppProject,
  validateAppProject, normalizeAndValidatePath, APP_PROJECT_LIMITS,
} from '../src/make/manifest.ts'
import type { AppProject, AppProjectSummary, AppRevisionRecord, AppSourceFile } from '../src/make/types.ts'
import { httpError, safeId, hash } from './storage.ts'

// Like scene storage, one service process owns the volume. Share locks across
// store instances in that process; reads use immutable snapshots without locks.
const pending = new Map<string, Promise<unknown>>()
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'

export class AppStorage {
  readonly root: string

  constructor(root: string) { this.root = resolve(root) }

  private async locked<T>(user: string, id: string, fn: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([this.root, user, id])
    const previous = pending.get(key) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(fn)
    pending.set(key, next)
    try { return await next }
    finally { if (pending.get(key) === next) pending.delete(key) }
  }

  private async directory(path: string, create = false): Promise<string> {
    let created = false
    if (create) {
      try { await fs.mkdir(path, { mode: 0o700 }); created = true }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    }
    const info = await fs.lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw httpError(403, 'Artifact directory must not be a symlink')
    if (created) await this.syncDirectory(dirname(path))
    return path
  }

  private async userDirectory(user: string): Promise<string> {
    safeId(user, 'user ID')
    // Only the configured volume's ancestors are trusted. Check every managed
    // directory before creating or reading any descendant.
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 })
    await this.directory(this.root)
    const apps = await this.directory(join(this.root, 'apps'), true)
    return this.directory(join(apps, user), true)
  }

  private async appDirectory(user: string, id: string, create = false): Promise<string> {
    safeId(id, 'app ID')
    return this.directory(join(await this.userDirectory(user), id), create)
  }

  private async readText(path: string, maxBytes: number): Promise<string> {
    try {
      const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const info = await handle.stat()
        if (!info.isFile()) throw httpError(403, 'Artifact must be a regular file')
        if (info.size > maxBytes) throw httpError(413, 'Artifact too large')
        // Bound the read itself too, even if a local writer changes file size.
        const buffer = Buffer.alloc(Math.min(info.size + 1, maxBytes + 1))
        let offset = 0
        while (offset < buffer.length) {
          const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null)
          if (!bytesRead) break
          offset += bytesRead
        }
        if (offset > maxBytes || offset > info.size) throw httpError(413, 'Artifact changed size during read')
        return buffer.subarray(0, offset).toString('utf8')
      } finally { await handle.close() }
    } catch (error) {
      if (['ELOOP', 'EMLINK'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        throw httpError(403, 'Artifact must not be a symlink')
      }
      throw error
    }
  }

  private async head(appDir: string, id: string): Promise<AppProject | null> {
    let text: string
    try { text = await this.readText(join(appDir, 'manifest.json'), APP_PROJECT_LIMITS.MAX_MANIFEST_BYTES) }
    catch (error) { if (missing(error)) return null; throw error }
    const project = parseAppProject(text)
    if (project.id !== id) throw httpError(500, 'Stored app ID mismatch')
    return project
  }

  async read(user: string, id: string): Promise<AppProject | null> {
    let appDir: string
    try { appDir = await this.appDirectory(user, id) }
    catch (error) { if (missing(error)) return null; throw error }
    return this.head(appDir, id)
  }

  private async revisionDirectory(appDir: string, revision: number): Promise<string> {
    const revisions = await this.directory(join(appDir, 'revisions'))
    return this.directory(join(revisions, String(revision)))
  }

  async readFile(user: string, id: string, filePath: string): Promise<AppSourceFile | null> {
    const path = normalizeAndValidatePath(filePath)
    let appDir: string
    try { appDir = await this.appDirectory(user, id) }
    catch (error) { if (missing(error)) return null; throw error }
    const head = await this.head(appDir, id)
    if (!head || !Object.hasOwn(head.files, path)) return null
    const snapshot = await this.revisionDirectory(appDir, head.revision)
    let directory = await this.directory(join(snapshot, 'files'))
    const segments = path.split('/')
    for (const segment of segments.slice(0, -1)) directory = await this.directory(join(directory, segment))
    const content = await this.readText(join(directory, segments.at(-1)!), APP_PROJECT_LIMITS.MAX_FILE_BYTES)
    if (content !== head.files[path].content) throw httpError(500, 'Stored source does not match manifest')
    return { path, content }
  }

  private async revision(appDir: string, id: string, revision: number): Promise<AppRevisionRecord> {
    const snapshot = await this.revisionDirectory(appDir, revision)
    // The envelope adds only bounded metadata to an already bounded manifest.
    const raw = parseJsonStrict(await this.readText(join(snapshot, 'record.json'), APP_PROJECT_LIMITS.MAX_MANIFEST_BYTES))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw httpError(500, 'Invalid stored revision')
    const record = raw as Record<string, unknown>
    const project = validateAppProject(record.project)
    if (Object.keys(record).sort().join(',') !== 'hash,project,revision,timestamp' ||
        record.revision !== revision || project.revision !== revision || project.id !== id ||
        record.timestamp !== project.updatedAt || record.hash !== hash(serializeAppProject(project))) {
      throw httpError(500, 'Stored revision integrity check failed')
    }
    return { revision, hash: record.hash as string, timestamp: project.updatedAt, project }
  }

  async readRevision(user: string, id: string, revision: number): Promise<AppRevisionRecord | null> {
    if (!Number.isSafeInteger(revision) || revision < 1) throw httpError(400, 'Invalid revision number')
    let appDir: string
    try { appDir = await this.appDirectory(user, id) }
    catch (error) { if (missing(error)) return null; throw error }
    const head = await this.head(appDir, id)
    if (!head || revision > head.revision) return null
    return this.revision(appDir, id, revision)
  }

  async listRevisions(user: string, id: string): Promise<Array<Omit<AppRevisionRecord, 'project'>>> {
    let appDir: string
    try { appDir = await this.appDirectory(user, id) }
    catch (error) { if (missing(error)) return []; throw error }
    const head = await this.head(appDir, id)
    if (!head) return []
    const directory = await this.directory(join(appDir, 'revisions'))
    const entries = await fs.readdir(directory)
    const revisions = entries.filter(name => /^[1-9]\d*$/.test(name))
      .map(Number).filter(revision => Number.isSafeInteger(revision) && revision <= head.revision)
      .sort((a, b) => a - b)
    const records: Array<Omit<AppRevisionRecord, 'project'>> = []
    for (const revision of revisions) {
      const { project: _project, ...record } = await this.revision(appDir, id, revision)
      records.push(record)
    }
    return records
  }

  async list(user: string): Promise<AppProjectSummary[]> {
    const userDir = await this.userDirectory(user)
    const entries = await fs.readdir(userDir, { withFileTypes: true })
    const summaries: AppProjectSummary[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const project = await this.read(user, entry.name)
      if (project) {
        const { id, name, description, revision, release, preview, createdAt, updatedAt } = project
        summaries.push({ id, name, ...(description !== undefined ? { description } : {}), revision, release, preview, createdAt, updatedAt })
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
  }

  private async writeText(path: string, text: string): Promise<void> {
    const handle = await fs.open(path, 'wx', 0o600)
    try { await handle.writeFile(text, 'utf8'); await handle.sync() }
    finally { await handle.close() }
  }

  private async syncDirectory(path: string): Promise<void> {
    const handle = await fs.open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try { await handle.sync() } finally { await handle.close() }
  }

  // Only a writer holding this app's lock may reclaim an interrupted write.
  // Readers never delete staging, snapshots, or a previous committed revision.
  private async cleanUncommitted(appDir: string, revision: number): Promise<void> {
    for (const entry of await fs.readdir(appDir)) {
      if (/^\.(staging|rollback)_[a-f0-9-]+$/.test(entry)) {
        await fs.rm(join(appDir, entry), { recursive: true, force: true })
      }
    }
    const revisions = await this.directory(join(appDir, 'revisions'), true)
    for (const name of await fs.readdir(revisions)) {
      if (/^[1-9]\d*$/.test(name) && Number(name) > revision) {
        await fs.rm(join(revisions, name), { recursive: true, force: true })
      }
    }
  }

  async put(user: string, id: string, input: unknown, expectedRevision: number | null): Promise<AppProject> {
    safeId(user, 'user ID'); safeId(id, 'app ID')
    if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
      throw httpError(400, 'Invalid expected revision')
    }
    // Validation must see the original descriptors/fields before any spread or
    // normalization. A malformed v1 manifest never falls back to a legacy draft.
    const inputProject = migrateAppProject(input)
    return this.locked(user, id, async () => {
      const current = await this.read(user, id)
      if (expectedRevision !== (current?.revision ?? null)) {
        throw Object.assign(httpError(409, 'Revision conflict'), { current })
      }
      const now = new Date().toISOString()
      const candidate = validateAppProject({ ...inputProject, id, revision: (current?.revision ?? 0) + 1,
        createdAt: current?.createdAt ?? now, updatedAt: now })
      const manifest = serializeAppProject(candidate)
      const record: AppRevisionRecord = { revision: candidate.revision, hash: hash(manifest), timestamp: now, project: candidate }
      // Keep the revision envelope under the same strict JSON parser's cap.
      const recordText = JSON.stringify(record)
      if (Buffer.byteLength(recordText) > APP_PROJECT_LIMITS.MAX_MANIFEST_BYTES) throw httpError(413, 'Revision too large')
      const appDir = await this.appDirectory(user, id, true)
      await this.cleanUncommitted(appDir, current?.revision ?? 0)
      const revisions = await this.directory(join(appDir, 'revisions'))
      const snapshot = join(revisions, String(candidate.revision))
      const staging = join(appDir, `.staging_${randomUUID()}`)
      const rollback = join(appDir, `.rollback_${randomUUID()}`)
      let installed = false
      let published = false
      try {
        await this.directory(staging, true)
        const files = await this.directory(join(staging, 'files'), true)
        const directories = new Set([files])
        for (const file of Object.values(candidate.files)) {
          const path = join(files, file.path)
          let directory = files
          for (const segment of file.path.split('/').slice(0, -1)) {
            directory = join(directory, segment)
            await this.directory(directory, true)
            directories.add(directory)
          }
          await this.writeText(path, file.content)
        }
        await this.writeText(join(staging, 'record.json'), recordText)
        await this.writeText(join(staging, 'manifest.json'), manifest)
        for (const directory of [...directories].sort((a, b) => b.length - a.length)) await this.syncDirectory(directory)
        await this.syncDirectory(staging)
        if (current) await this.writeText(rollback, serializeAppProject(current))
        await fs.rename(staging, snapshot)
        installed = true
        await this.syncDirectory(revisions)
        await this.syncDirectory(appDir)
        // The only publication point. Files and history are already durable;
        // replacing a regular manifest never removes the live app directory.
        await fs.rename(join(snapshot, 'manifest.json'), join(appDir, 'manifest.json'))
        published = true
        await this.syncDirectory(snapshot)
        await this.syncDirectory(appDir)
      } catch (error) {
        if (published) {
          // A post-rename directory-sync error is still a failed write. Restore
          // the prior head before reclaiming the unpublished candidate.
          try {
            if (current) await fs.rename(rollback, join(appDir, 'manifest.json'))
            else await fs.unlink(join(appDir, 'manifest.json'))
            published = false
            await this.syncDirectory(appDir)
          } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], 'Artifact publication and rollback failed')
          }
        }
        throw error
      } finally {
        // Cleanup failure cannot turn a committed write into a false failure.
        // Abandoned paths are invisible and retried by the next locked writer.
        await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
        await fs.rm(rollback, { force: true }).catch(() => {})
        if (installed && !published) await fs.rm(snapshot, { recursive: true, force: true }).catch(() => {})
      }
      return candidate
    })
  }

  async delete(user: string, id: string): Promise<boolean> {
    safeId(user, 'user ID'); safeId(id, 'app ID')
    return this.locked(user, id, async () => {
      let appDir: string
      try { appDir = await this.appDirectory(user, id) }
      catch (error) { if (missing(error)) return false; throw error }
      const head = await this.head(appDir, id)
      if (!head) return false
      await fs.unlink(join(appDir, 'manifest.json'))
      await fs.rm(appDir, { recursive: true, force: true })
      await this.syncDirectory(dirname(appDir))
      return true
    })
  }
}
