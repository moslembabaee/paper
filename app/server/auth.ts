import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CloudUser } from '../src/cloud/model.ts'
import { atomicFile, hash, httpError, Storage } from './storage.ts'

interface User extends CloudUser { tokenHash?: string; tokenEncrypted?: string }
interface AuthData { users: User[]; sessions: Record<string, { userId: string; expiresAt: number }> }
export class Auth {
  private data: AuthData = { users: [], sessions: {} }
  private lock = new Storage('')
  private key: Buffer
  private path: string
  constructor(root: string, secret: string) {
    if (secret.length < 32) throw new Error('PAPER_SESSION_SECRET must have at least 32 characters')
    this.key = Buffer.from(hash(secret), 'hex')
    this.path = join(root, 'auth.json')
  }
  async initialize(root: string) {
    await mkdir(root, { recursive: true, mode: 0o700 })
    try { this.data = JSON.parse(await readFile(this.path, 'utf8')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  private async save() { await atomicFile(this.path, this.data) }
  async login(provider: string, identity: { sub: string; email: string; name: string; avatar: string }) {
    return this.lock.locked('auth', async () => {
      const id = hash(`${provider}:${identity.sub}`)
      let user = this.data.users.find(user => user.id === id)
      if (!user) { user = { id, email: identity.email, name: identity.name, avatar: identity.avatar, createdAt: Date.now(), hasMcpToken: false }; this.data.users.push(user) }
      else Object.assign(user, { email: identity.email, name: identity.name, avatar: identity.avatar })
      const session = randomBytes(32).toString('base64url')
      const now = Date.now()
      for (const [key, entry] of Object.entries(this.data.sessions)) if (entry.expiresAt < now) delete this.data.sessions[key]
      this.data.sessions[hash(session)] = { userId: id, expiresAt: now + 30 * 86400_000 }
      await this.save()
      return { session, user: this.profile(user) }
    })
  }
  profile(user: User): CloudUser { const { id, email, name, avatar, createdAt, hasMcpToken } = user; return { id, email, name, avatar, createdAt, hasMcpToken } }
  session(raw: string | undefined) {
    const session = raw && this.data.sessions[hash(raw)]
    return session && session.expiresAt > Date.now() ? this.data.users.find(user => user.id === session.userId) : undefined
  }
  bearer(raw: string | undefined) { return raw && /^paper_[A-Za-z0-9_-]{43}$/.test(raw) ? this.data.users.find(user => user.tokenHash === hash(raw)) : undefined }
  async logout(raw: string) { return this.lock.locked('auth', async () => { delete this.data.sessions[hash(raw)]; await this.save() }) }
  async regenerate(id: string) {
    return this.lock.locked('auth', async () => {
      const user = this.data.users.find(user => user.id === id)!
      const token = `paper_${randomBytes(32).toString('base64url')}`
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', this.key, iv)
      const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
      Object.assign(user, { tokenHash: hash(token), tokenEncrypted: [iv, cipher.getAuthTag(), encrypted].map(b => b.toString('base64url')).join('.'), hasMcpToken: true })
      await this.save()
      return token
    })
  }
  reveal(id: string) {
    const user = this.data.users.find(user => user.id === id)!
    if (!user.tokenEncrypted) throw httpError(404, 'Generate a token first')
    const [iv, tag, value] = user.tokenEncrypted.split('.').map(v => Buffer.from(v, 'base64url'))
    const cipher = createDecipheriv('aes-256-gcm', this.key, iv)
    cipher.setAuthTag(tag)
    return Buffer.concat([cipher.update(value), cipher.final()]).toString('utf8')
  }
}
