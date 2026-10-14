import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { canonical } from '../src/cloud/model.ts'
import type { CloudProject } from '../src/cloud/model.ts'
import { parseProject } from '../src/io/project.ts'

export function httpError(status: number, message: string) { return Object.assign(new Error(message), { status }) }
export function safeId(id: unknown): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(id)) throw httpError(400, 'Invalid project ID')
  return id
}
export function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }
export async function atomicFile(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`
  await writeFile(temp, JSON.stringify(value), { mode: 0o600 })
  await rename(temp, path)
}
/** A single service owns the volume. Serialize read/compare/write, including MCP edits. */
export class Storage {
  private pending = new Map<string, Promise<unknown>>()
  constructor(readonly root: string) {}
  async locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(key) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(fn)
    this.pending.set(key, next)
    try { return await next } finally { if (this.pending.get(key) === next) this.pending.delete(key) }
  }
  private async directory(user: string) {
    const path = join(this.root, 'projects', safeId(user))
    await mkdir(path, { recursive: true, mode: 0o700 })
    return path
  }
  async read(user: string, id: string): Promise<CloudProject | null> {
    const path = join(await this.directory(user), `${safeId(id)}.paper.json`)
    try { return JSON.parse(await readFile(path, 'utf8')) as CloudProject }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  }
  async list(user: string) {
    const directory = await this.directory(user)
    const ids = (await readdir(directory)).filter(name => name.endsWith('.paper.json')).map(name => name.slice(0, -11))
    return Promise.all(ids.map(async id => {
      const record = (await this.read(user, id))!
      return { id, name: record.document.name, revision: record.revision, updatedAt: record.updatedAt, createdAt: record.createdAt }
    }))
  }
  async put(user: string, id: string, document: unknown, expected: unknown, updatedAt: unknown, activity?: CloudProject['activity']): Promise<CloudProject> {
    return this.locked(`${user}/${id}`, async () => {
      const current = await this.read(user, id)
      if (expected !== (current?.revision ?? null)) throw Object.assign(httpError(409, 'Revision conflict'), { current })
      return this.write(user, id, document, updatedAt, current, activity)
    })
  }
  async write(user: string, id: string, value: unknown, updatedAt: unknown, current: CloudProject | null, activity?: CloudProject['activity']) {
    if (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt) || updatedAt < 0 || updatedAt > Date.now() + 60_000) throw httpError(400, 'Invalid update timestamp')
    let document
    try { document = parseProject(JSON.stringify(value)) } catch (error) { throw httpError(400, error instanceof Error ? error.message : 'Invalid project') }
    const record: CloudProject = { id: safeId(id), document, revision: hash(canonical(document)), updatedAt, createdAt: current?.createdAt ?? Date.now(), ...(activity ? { activity } : {}) }
    await atomicFile(join(await this.directory(user), `${id}.paper.json`), record)
    return record
  }
}
