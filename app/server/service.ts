import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { Auth } from './auth.ts'
import { Storage, httpError, safeId } from './storage.ts'
import { RemoteMcpGateway } from './mcp.ts'
import { CollaborationServer } from '../collaboration/server.ts'
import type { CloudProject } from '../src/cloud/model.ts'
import { APP_PROJECT_LIMITS, AppProjectValidationError, generateAppProjectId, parseJsonStrict, validateAppProject } from '../src/make/manifest.ts'
import { compileAppProject, compileSourceFiles } from '../src/make/compiler.ts'
import { ServerModelGateway, type ModelGatewayConfig } from './model-gateway.ts'
import { MODEL_GATEWAY_LIMITS } from '../src/make/model-protocol.ts'
import type { ModelRequest } from '../src/make/types.ts'

export interface ServiceConfig {
  root: string
  secret: string
  origin: string
  google?: { clientId: string; clientSecret: string }
  github?: { clientId: string; clientSecret: string }
  fetch?: typeof fetch
  modelGateway?: ModelGatewayConfig | ServerModelGateway
}
function cookies(req: IncomingMessage) {
  return Object.fromEntries((req.headers.cookie ?? '').split(';').map(v => v.trim().split('=')))
}
async function body(req: IncomingMessage, parsed?: unknown, maxBytes = 17 * 1024 * 1024): Promise<Record<string, unknown>> {
  let value = parsed
  const appBody = maxBytes === APP_PROJECT_LIMITS.MAX_MANIFEST_BYTES
  const parse = (text: string) => {
    try { return appBody ? parseJsonStrict(text) : JSON.parse(text || '{}') }
    catch (error) {
      if (error instanceof AppProjectValidationError) throw error
      throw httpError(400, 'Invalid JSON')
    }
  }
  const payloadError = () => {
    if (maxBytes <= MODEL_GATEWAY_LIMITS.MAX_REQUEST_BYTES) return 'Model request payload too large'
    if (maxBytes <= APP_PROJECT_LIMITS.MAX_MANIFEST_BYTES) return 'App project payload too large'
    return 'Project too large'
  }
  if (value === undefined) {
    const chunks: Buffer[] = []; let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > maxBytes) throw httpError(413, payloadError())
      chunks.push(chunk)
    }
    value = parse(Buffer.concat(chunks).toString())
  } else if (typeof value === 'string') {
    // Production passes unparsed app JSON so duplicate keys remain observable.
    if (Buffer.byteLength(value) > maxBytes) throw httpError(413, payloadError())
    value = parse(value)
  } else {
    const raw = JSON.stringify(value)
    if (Buffer.byteLength(raw) > maxBytes) {
      throw httpError(413, payloadError())
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'Expected an object')
  return value as Record<string, unknown>
}
function appInput(input: Record<string, unknown>): { project: Record<string, unknown>; expectedRevision: unknown } {
  const { expectedRevision, ...rest } = input
  if (!Object.hasOwn(rest, 'project')) return { project: rest, expectedRevision }
  if (Object.keys(rest).length !== 1 || !rest.project || typeof rest.project !== 'object' || Array.isArray(rest.project)) {
    throw httpError(400, 'Expected a project object and expectedRevision')
  }
  return { project: rest.project as Record<string, unknown>, expectedRevision }
}
function decodeAppPath(value: string): string {
  try { return decodeURIComponent(value) }
  catch { throw httpError(400, 'Invalid app path encoding') }
}
function json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)) }
export async function createService(config: ServiceConfig) {
  const origin = new URL(config.origin).origin
  const auth = new Auth(config.root, config.secret)
  await auth.initialize(config.root)
  const storage = new Storage(config.root)
  const collaboration = new CollaborationServer(origin)
  const requestFetch = config.fetch ?? fetch
  const streams = new Map<string, Set<ServerResponse>>()
  const attempts = new Map<string, { provider: string; verifier: string; expires: number }>()
  const rates = new Map<string, { count: number; until: number }>()
  const emit = (user: string, record: CloudProject) => {
    mcp.notify(user, record)
    for (const stream of streams.get(user) ?? []) stream.write(`event: project\ndata: ${JSON.stringify({ id: record.id, revision: record.revision })}\n\n`)
  }
  const emitApp = (user: string, record: { id: string; revision: number }, action: 'update' | 'delete' = 'update') => {
    for (const stream of streams.get(user) ?? []) stream.write(`event: app\ndata: ${JSON.stringify({ id: record.id, revision: record.revision, action })}\n\n`)
  }
  const mcp = new RemoteMcpGateway(auth, storage, emit)
  const modelGateway = config.modelGateway instanceof ServerModelGateway
    ? config.modelGateway
    : new ServerModelGateway({ fetch: requestFetch, ...config.modelGateway })
  await modelGateway.initialize(config.root)
  async function generate(req: IncomingMessage, res: ServerResponse, userId: string, request: ModelRequest) {
    const controller = new AbortController()
    const onDisconnect = () => { if (!res.writableEnded) controller.abort() }
    // IncomingMessage 'close' also fires after a normally consumed body. The
    // response socket closing early is the cancellation signal for slow turns.
    req.once('aborted', onDisconnect)
    res.once('close', onDisconnect)
    if (req.aborted || res.destroyed) controller.abort()
    try {
      return await modelGateway.executeTurn({ userId, request, signal: controller.signal, appStorage: storage.apps })
    } finally {
      req.removeListener('aborted', onDisconnect)
      res.removeListener('close', onDisconnect)
    }
  }
  function cookie(name: string, value: string, maxAge: number) { return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith('https:') ? '; Secure' : ''}` }
  async function providerJSON(url: string, init?: RequestInit) {
    const response = await requestFetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw httpError(502, 'Identity provider unavailable')
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(502, 'Invalid identity provider response')
    return value as Record<string, unknown>
  }
  const handler = async (req: IncomingMessage, res: ServerResponse, parsed?: unknown) => {
    try {
      const url = new URL(req.url ?? '/', origin)
      const path = url.pathname
      // Origins are checked before all routing, including remote MCP, to prevent DNS rebinding/CSRF.
      if (req.headers.origin && req.headers.origin !== origin) throw httpError(403, 'Origin rejected')
      if (path === '/healthz') { json(res, 200, { ok: true }); return }
      // Fastify has already consumed JSON bodies. Pass its parsed value to the relay.
      if (await collaboration.handle(req, res, parsed)) return
      const rateKey = req.socket.remoteAddress ?? 'unknown'
      const now = Date.now()
      if (rates.size > 10000) for (const [key, rate] of rates) if (rate.until < now) rates.delete(key)
      const rate = rates.get(rateKey)
      if (!rate || rate.until < now) rates.set(rateKey, { count: 1, until: now + 60_000 })
      else if (++rate.count > 600) throw httpError(429, 'Too many requests')
      const sessionCookie = cookies(req).paper_session
      const user = auth.session(sessionCookie)
      if (path === '/api/auth/session' && req.method === 'GET') {
        json(res, 200, { user: user ? auth.profile(user) : null, providers: { google: !!config.google, github: !!config.github } }); return
      }
      const login = path.match(/^\/api\/auth\/(google|github)$/)
      if (login && req.method === 'GET') {
        const provider = login[1] as 'google' | 'github'
        const settings = config[provider]
        if (!settings) throw httpError(503, 'This sign-in provider is not configured')
        for (const [state, attempt] of attempts) if (attempt.expires < now) attempts.delete(state)
        if (attempts.size >= 1000) throw httpError(429, 'Please try signing in later')
        const state = randomBytes(32).toString('base64url')
        const verifier = randomBytes(32).toString('base64url')
        attempts.set(state, { provider, verifier, expires: now + 600_000 })
        const target = new URL(provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://github.com/login/oauth/authorize')
        target.search = new URLSearchParams({ client_id: settings.clientId, redirect_uri: `${origin}/api/auth/${provider}/callback`, state, response_type: 'code', scope: provider === 'google' ? 'openid email profile' : 'read:user user:email', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString()
        res.writeHead(302, { Location: target.toString(), 'Set-Cookie': cookie('paper_oauth', state, 600), 'Cache-Control': 'no-store' }); res.end(); return
      }
      const callback = path.match(/^\/api\/auth\/(google|github)\/callback$/)
      if (callback && req.method === 'GET') {
        const provider = callback[1] as 'google' | 'github'
        const isHtml = req.headers.accept?.includes('text/html')
        const fail = (status: number, message: string) => {
          res.setHeader('Set-Cookie', cookie('paper_oauth', '', 0))
          if (isHtml) {
            res.writeHead(302, { Location: `/?auth_error=${encodeURIComponent(message)}`, 'Set-Cookie': cookie('paper_oauth', '', 0), 'Cache-Control': 'no-store' })
            res.end()
            return
          }
          throw httpError(status, message)
        }
        const state = url.searchParams.get('state') ?? ''
        const attempt = attempts.get(state)
        if (!attempt || attempt.expires < now || attempt.provider !== provider || cookies(req).paper_oauth !== state) {
          fail(400, 'Sign-in expired or invalid. Please try again.')
          return
        }
        attempts.delete(state)
        const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error')
        if (oauthError) { fail(400, `Sign-in was cancelled or rejected by ${provider === 'google' ? 'Google' : 'GitHub'}`); return }
        const code = url.searchParams.get('code')
        if (!code || !config[provider]) { fail(400, 'Sign-in cancelled'); return }
        try {
          const settings = config[provider]!
          const token = await providerJSON(provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: settings.clientId, client_secret: settings.clientSecret, redirect_uri: `${origin}/api/auth/${provider}/callback`, grant_type: 'authorization_code', code_verifier: attempt.verifier }).toString() })
          if (typeof token.access_token !== 'string') { fail(400, 'Sign-in was rejected'); return }
          const headers = { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json', 'User-Agent': 'Paper' }
          const identity = await providerJSON(provider === 'google' ? 'https://openidconnect.googleapis.com/v1/userinfo' : 'https://api.github.com/user', { headers })
          let email = typeof identity.email === 'string' ? identity.email : ''
          if (provider === 'github') {
            const response = await requestFetch('https://api.github.com/user/emails', { headers, signal: AbortSignal.timeout(10000) })
            if (!response.ok) { fail(502, 'Could not verify account email'); return }
            const value: unknown = await response.json()
            if (!Array.isArray(value)) throw httpError(502, 'Could not verify account email')
            const emails = value.filter((e): e is { email: string; primary: boolean; verified: boolean } => !!e && typeof e === 'object' && typeof e.email === 'string' && e.verified === true)
            email = (emails.find(e => e.primary === true) ?? emails[0])?.email ?? ''
          } else if (identity.email_verified !== true) { fail(403, 'Verify your Google email before signing in'); return }
          const sub = provider === 'google' ? identity.sub : identity.id
          if ((provider === 'google' ? typeof sub !== 'string' || !sub : typeof sub !== 'number' || !Number.isSafeInteger(sub) || sub <= 0) || !email) { fail(403, 'A verified account email is required'); return }
          const name = identity.name ?? identity.login
          const avatar = identity.picture ?? identity.avatar_url
          const loggedIn = await auth.login(provider, { sub: String(sub), email, name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : email, avatar: typeof avatar === 'string' && avatar.startsWith('https://') ? avatar : '' })
          res.writeHead(302, { Location: '/?auth=success', 'Set-Cookie': [cookie('paper_session', loggedIn.session, 30 * 86400), cookie('paper_oauth', '', 0)], 'Cache-Control': 'no-store' }); res.end(); return
        } catch (error) {
          const failure = error as Error & { status?: number }
          fail(failure.status ?? 502, failure.status ? failure.message : 'Sign-in could not complete. Please try again.')
          return
        }
      }
      if (path === '/mcp') { await mcp.handle(req, res, () => body(req, parsed)); return }
      if (!user) throw httpError(401, 'Sign in to access cloud projects')
      const account = req.headers['x-paper-account'] ?? (path === '/api/events' ? url.searchParams.get('account') : undefined)
      if (account && account !== user.id) throw httpError(403, 'Account changed. Reload Paper before syncing.')
      if (!['GET', 'HEAD'].includes(req.method ?? '') && req.headers['x-paper-client'] !== 'web') throw httpError(403, 'Missing request guard')
      if (path === '/api/auth/logout' && req.method === 'POST') { await auth.logout(sessionCookie); res.setHeader('Set-Cookie', cookie('paper_session', '', 0)); json(res, 200, { ok: true }); return }
      if (path === '/api/auth/token/regenerate' && req.method === 'POST') {
        const token = await auth.regenerate(user.id)
        mcp.revokeUser(user.id)
        json(res, 200, { token, user: auth.profile(auth.session(sessionCookie) || user) }); return
      }
      if (path === '/api/auth/token' && req.method === 'GET') { json(res, 200, { token: auth.reveal(user.id) }); return }
      if ((path === '/api/auth/token' && req.method === 'DELETE') || (path === '/api/auth/token/revoke' && req.method === 'POST')) {
        const profile = await auth.revoke(user.id)
        mcp.revokeUser(user.id)
        json(res, 200, { ok: true, user: profile })
        return
      }
      if (path === '/api/auth/profile' && req.method === 'GET') { json(res, 200, { user: auth.profile(user) }); return }
      if (path === '/api/auth/profile' && (req.method === 'PATCH' || req.method === 'PUT')) {
        const input = await body(req, parsed)
        const updated = await auth.updateProfile(user.id, {
          name: input.name,
          avatar: input.avatar,
        })
        json(res, 200, { user: updated })
        return
      }
      if (path === '/api/projects' && req.method === 'GET') { json(res, 200, { projects: await storage.list(user.id) }); return }
      if (path === '/api/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.write(': connected\n\n')
        const set = streams.get(user.id) ?? new Set(); streams.set(user.id, set)
        if (set.size >= 20) { res.end(); return }; set.add(res)
        const heartbeat = setInterval(() => { if (!auth.session(sessionCookie)) res.end(); else res.write(': heartbeat\n\n') }, 20_000)
        res.on('close', () => { clearInterval(heartbeat); set.delete(res); if (!set.size) streams.delete(user.id) }); return
      }
      const projectRoute = path.match(/^\/api\/projects\/([^/]+)$/)
      if (projectRoute) {
        const id = safeId(decodeURIComponent(projectRoute[1]))
        if (req.method === 'GET') { const record = await storage.read(user.id, id); if (!record) throw httpError(404, 'Project not found'); json(res, 200, record); return }
        if (req.method === 'PUT') { const input = await body(req, parsed); const record = await storage.put(user.id, id, input.document, input.expectedRevision, input.updatedAt); emit(user.id, record); json(res, 200, record); return }
      }
      // App Projects CRUD collection
      const appsCollection = path.match(/^\/api\/(apps|app-projects)$/)
      if (appsCollection) {
        if (req.method === 'GET') {
          const list = await storage.apps.list(user.id)
          json(res, 200, { apps: list, projects: list })
          return
        }
        if (req.method === 'POST') {
          const { project, expectedRevision } = appInput(await body(req, parsed, APP_PROJECT_LIMITS.MAX_MANIFEST_BYTES))
          if (expectedRevision !== undefined && expectedRevision !== null) throw httpError(400, 'Create requires a null expected revision')
          const id = safeId(project.id === undefined ? generateAppProjectId() : project.id, 'app ID')
          const record = await storage.apps.put(user.id, id, project, null)
          emitApp(user.id, record, 'update')
          res.setHeader('Location', `/api/apps/${id}`)
          json(res, 201, record)
          return
        }
        throw httpError(405, 'Method not allowed')
      }

      // App Project sub-resources: revisions
      const appRevisionsRoute = path.match(/^\/api\/(apps|app-projects)\/([^/]+)\/revisions$/)
      if (appRevisionsRoute) {
        const id = safeId(decodeAppPath(appRevisionsRoute[2]), 'app ID')
        if (req.method === 'GET') {
          const head = await storage.apps.read(user.id, id)
          if (!head) throw httpError(404, 'App project not found')
          const revisions = await storage.apps.listRevisions(user.id, id)
          json(res, 200, { revisions })
          return
        }
        throw httpError(405, 'Method not allowed')
      }

      const appRevisionRoute = path.match(/^\/api\/(apps|app-projects)\/([^/]+)\/revisions\/([^/]+)$/)
      if (appRevisionRoute) {
        const id = safeId(decodeAppPath(appRevisionRoute[2]), 'app ID')
        const revNum = Number(appRevisionRoute[3])
        if (!Number.isSafeInteger(revNum) || revNum < 1) throw httpError(400, 'Invalid revision number')
        if (req.method === 'GET') {
          const record = await storage.apps.readRevision(user.id, id, revNum)
          if (!record) throw httpError(404, 'Revision not found')
          json(res, 200, record)
          return
        }
        throw httpError(405, 'Method not allowed')
      }

      // App Project sub-resources: files
      const appFilesRoute = path.match(/^\/api\/(apps|app-projects)\/([^/]+)\/files(\/.*)?$/)
      if (appFilesRoute) {
        const id = safeId(decodeAppPath(appFilesRoute[2]), 'app ID')
        if (req.method === 'GET') {
          let filePath = url.searchParams.get('path')
          if (!filePath && appFilesRoute[3]) {
            filePath = decodeAppPath(appFilesRoute[3].slice(1))
          }
          if (!filePath) throw httpError(400, 'File path is required')
          const file = await storage.apps.readFile(user.id, id, filePath)
          if (!file) throw httpError(404, 'File not found')
          json(res, 200, file)
          return
        }
        throw httpError(405, 'Method not allowed')
      }

      // Transform bounded sources without executing generated code on the server.
      const appCompileRoute = path.match(/^\/api\/(apps|app-projects)\/compile$/)
      if (appCompileRoute && req.method === 'POST') {
        const input = await body(req, parsed, APP_PROJECT_LIMITS.MAX_MANIFEST_BYTES)
        if (input.entryPoint !== undefined && typeof input.entryPoint !== 'string') throw httpError(400, 'Expected a string entryPoint')
        const options = { entryPoint: typeof input.entryPoint === 'string' ? input.entryPoint : undefined }
        const result = Object.hasOwn(input, 'files') && !Object.hasOwn(input, 'format')
          ? await compileSourceFiles(input.files, options)
          : await compileAppProject(validateAppProject(input.project ?? input), options)
        json(res, 200, result)
        return
      }

      const appItemCompileRoute = path.match(/^\/api\/(apps|app-projects)\/([^/]+)\/compile$/)
      if (appItemCompileRoute) {
        const id = safeId(decodeAppPath(appItemCompileRoute[2]), 'app ID')
        if (req.method === 'POST') {
          const record = await storage.apps.read(user.id, id)
          if (!record) throw httpError(404, 'App project not found')
          const result = await compileAppProject(record)
          json(res, 200, result)
          return
        }
        throw httpError(405, 'Method not allowed')
      }

      // Model Gateway endpoints: general
      if (path === '/api/model/generate' && req.method === 'POST') {
        const input = (await body(req, parsed, MODEL_GATEWAY_LIMITS.MAX_REQUEST_BYTES)) as unknown as ModelRequest
        const result = await generate(req, res, user.id, input)
        json(res, 200, result)
        return
      }

      if (path === '/api/model/budget' && req.method === 'GET') {
        json(res, 200, { budget: modelGateway.getBudget(user.id) })
        return
      }

      if (path === '/api/model/turns' && req.method === 'GET') {
        json(res, 200, { turns: modelGateway.listTurns(user.id) })
        return
      }

      if (path === '/api/model/cancel' && req.method === 'POST') {
        const input = await body(req, parsed, 4096)
        const turnId = typeof input.turnId === 'string' ? input.turnId : ''
        const cancelled = modelGateway.cancelTurn(user.id, turnId)
        json(res, 200, { ok: true, cancelled })
        return
      }

      // App Project sub-resources: model generation and turns
      const appGenerateRoute = path.match(/^\/api\/(apps|app-projects)\/([^/]+)\/generate$/)
      if (appGenerateRoute) {
        if (req.method === 'POST') {
          const id = safeId(decodeAppPath(appGenerateRoute[2]), 'app ID')
          const record = await storage.apps.read(user.id, id)
          if (!record) throw httpError(404, 'App project not found')
          const input = (await body(req, parsed, MODEL_GATEWAY_LIMITS.MAX_REQUEST_BYTES)) as unknown as ModelRequest
          const result = await generate(req, res, user.id, { ...input, appId: id })
          json(res, 200, result)
          return
        }
        throw httpError(405, 'Method not allowed')
      }

      const appBudgetRoute = path.match(/^\/api\/(apps|app-projects)\/([^/]+)\/budget$/)
      if (appBudgetRoute) {
        if (req.method === 'GET') {
          const id = safeId(decodeAppPath(appBudgetRoute[2]), 'app ID')
          const record = await storage.apps.read(user.id, id)
          if (!record) throw httpError(404, 'App project not found')
          json(res, 200, { budget: modelGateway.getBudget(user.id) })
          return
        }
        throw httpError(405, 'Method not allowed')
      }

      const appTurnsRoute = path.match(/^\/api\/(apps|app-projects)\/([^/]+)\/turns$/)
      if (appTurnsRoute) {
        if (req.method === 'GET') {
          const id = safeId(decodeAppPath(appTurnsRoute[2]), 'app ID')
          const record = await storage.apps.read(user.id, id)
          if (!record) throw httpError(404, 'App project not found')
          json(res, 200, { turns: modelGateway.listTurns(user.id, id) })
          return
        }
        throw httpError(405, 'Method not allowed')
      }

      // PUT replaces the supplied manifest; POST is collection-only.
      const appItemRoute = path.match(/^\/api\/(apps|app-projects)\/([^/]+)$/)
      if (appItemRoute) {
        const id = safeId(decodeAppPath(appItemRoute[2]), 'app ID')
        if (req.method === 'GET') {
          const record = await storage.apps.read(user.id, id)
          if (!record) throw httpError(404, 'App project not found')
          json(res, 200, record)
          return
        }
        if (req.method === 'PUT') {
          const { project, expectedRevision } = appInput(await body(req, parsed, APP_PROJECT_LIMITS.MAX_MANIFEST_BYTES))
          if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
            throw httpError(400, 'Update requires a positive expected revision')
          }
          if (project.id !== undefined && project.id !== id) throw httpError(400, 'App ID does not match URL')
          const record = await storage.apps.put(user.id, id, project, expectedRevision)
          emitApp(user.id, record, 'update')
          json(res, 200, record)
          return
        }
        if (req.method === 'DELETE') {
          const deleted = await storage.apps.delete(user.id, id)
          if (!deleted) throw httpError(404, 'App project not found')
          emitApp(user.id, { id, revision: 0 }, 'delete')
          json(res, 200, { ok: true })
          return
        }
        throw httpError(405, 'Method not allowed')
      }

      throw httpError(404, 'Not found')
    } catch (error) {
      if (res.headersSent) { res.end(); return }
      const failure = error as Error & { status?: number; current?: unknown }
      if (failure instanceof AppProjectValidationError && !failure.status) {
        failure.status = 400
      }
      json(res, failure.status ?? 500, { error: failure.status ? failure.message : 'Server could not complete the request', ...(failure.status === 409 ? { current: failure.current ?? null } : {}) })
    }
  }
  return { handler, auth, storage, collaboration, modelGateway, close: () => { modelGateway.close(); collaboration.close(); mcp.close(); for (const set of streams.values()) for (const res of set) res.end() } }
}
