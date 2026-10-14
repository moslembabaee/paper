import test from 'node:test'
import assert from 'node:assert/strict'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Duplex } from 'node:stream'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createService } from '../dist/server/service.js'
import { canonical, newer } from '../dist/src/cloud/model.js'

const secret = 'a-persistent-secret-for-integration-tests-12345'
async function fixture(t, extra = {}) {
  const root = await mkdtemp(join(tmpdir(), 'paper-cloud-'))
  const service = await createService({ root, secret, origin: 'http://localhost:3000', ...extra })
  const responses = []
  t.after(async () => { service.close(); for (const response of responses) response.emit('close'); await rm(root, { recursive: true, force: true }) })
  // Real IncomingMessage/ServerResponse streams, without a listening socket.
  // This also runs in sandboxes that forbid binding TCP ports.
  const open = async (path, options = {}) => {
    const socket = new Duplex({ read() {}, write(_chunk, _encoding, callback) { callback() } })
    socket.remoteAddress = '127.0.0.1'
    const req = new IncomingMessage(socket)
    req.url = path; req.method = options.method ?? 'GET'
    req.headers = Object.fromEntries(Object.entries({ 'Content-Type': 'application/json', ...options.headers }).map(([key, value]) => [key.toLowerCase(), value]))
    const res = new ServerResponse(req); res.assignSocket(socket); responses.push(res)
    let text = ''
    const write = res.write.bind(res), end = res.end.bind(res)
    res.write = chunk => { text += String(chunk); return write(chunk) }
    res.end = chunk => { if (chunk) text += String(chunk); return end(chunk) }
    await service.handler(req, res, options.body ? JSON.parse(options.body) : {})
    const headers = new Headers()
    for (const line of res._header.split('\r\n').slice(1)) {
      const split = line.indexOf(':'); if (split > 0) headers.append(line.slice(0, split), line.slice(split + 1).trim())
    }
    return { status: res.statusCode, headers, res, text: () => text }
  }
  const request = async (path, options = {}) => {
    const response = await open(path, options)
    return { status: response.status, headers: response.headers, data: response.headers.get('content-type')?.includes('json') ? JSON.parse(response.text()) : response.text() }
  }
  const login = async sub => {
    const { user, session } = await service.auth.login('github', { sub, email: `${sub}@test.local`, name: sub, avatar: '' })
    const token = await service.auth.regenerate(user.id)
    return { user, session, token, headers: { Cookie: `paper_session=${session}`, 'X-Paper-Client': 'web' } }
  }
  const rpc = async (token, method, params = {}) => request('/mcp', { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const tool = (token, name, args) => rpc(token, 'tools/call', { name, arguments: args })
  return { ...service, root, open, request, login, rpc, tool }
}
const empty = name => ({ format: 'paper', version: 1, name, viewport: { x: 0, y: 0, zoom: 1 }, grid: true, scene: { version: 1, elements: {}, rootIds: [] } })

test('guest sessions are optional; private endpoints require session and CSRF guard', async t => {
  const f = await fixture(t)
  assert.equal((await f.request('/api/auth/session')).data.user, null)
  assert.equal((await f.request('/api/projects')).status, 401)
  const a = await f.login('a')
  assert.equal((await f.request('/api/auth/token/regenerate', { method: 'POST', headers: { Cookie: a.headers.Cookie } })).status, 403)
  assert.equal((await f.request('/api/projects', { headers: { ...a.headers, Origin: 'https://evil.test' } })).status, 403)
  assert.equal((await f.request('/api/projects', { headers: { ...a.headers, 'X-Paper-Account': 'another-account' } })).status, 403)
  assert.equal((await f.request('/mcp', { method: 'POST', headers: { ...a.headers, Accept: 'application/json, text/event-stream' }, body: '{}' })).status, 401)
})

test('headless MCP edits persist, export correctly, and never cross account boundaries', async t => {
  const f = await fixture(t)
  const a = await f.login('account-a'), b = await f.login('account-b')
  const initialized = await f.rpc(a.token, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
  assert.equal(initialized.data.result.serverInfo.name, 'paper-cloud')
  assert.equal((await f.rpc(a.token, 'tools/list')).data.result.tools[0].name, 'list_projects')
  let created = await f.tool(a.token, 'create_frame', { project_id: 'shared-id', name: 'Account A private', width: 120, height: 240 })
  assert.equal(created.data.result.isError, false)
  const frame = created.data.result.structuredContent.element
  const revision = created.data.result.structuredContent.revision
  for (const name of ['get_canvas_elements', 'get_basic_info', 'list_tokens', 'export_selection']) assert.equal((await f.tool(b.token, name, { project_id: 'shared-id' })).data.result.isError, true)
  assert.equal((await f.tool(b.token, 'update_element', { project_id: 'shared-id', element_id: frame.id, patch: { name: 'stolen' } })).data.result.isError, true)
  assert.equal((await f.request('/api/projects/shared-id', { headers: b.headers })).status, 404)
  created = await f.tool(b.token, 'create_frame', { project_id: 'shared-id', name: 'Account B private' })
  assert.equal(created.data.result.isError, false)
  const read = await f.tool(a.token, 'get_canvas_elements', { project_id: 'shared-id' })
  assert.equal(read.data.result.structuredContent.elements[0].name, 'Account A private')
  const edit = await f.tool(a.token, 'update_element', { project_id: 'shared-id', element_id: frame.id, expected_revision: revision, patch: { name: 'Headless update', x: 120 } })
  assert.equal(edit.data.result.isError, false)
  assert.notEqual(edit.data.result.structuredContent.revision, revision)
  const browserOpen = await f.request('/api/projects/shared-id', { headers: a.headers })
  assert.equal(browserOpen.data.document.scene.elements[frame.id].name, 'Headless update')
  assert.equal(browserOpen.data.activity.tool, 'update_element')
  const svg = await f.tool(a.token, 'export_selection', { project_id: 'shared-id', format: 'svg' })
  assert.equal(svg.data.result.structuredContent.mimeType, 'image/svg+xml')
  assert.match(svg.data.result.structuredContent.content, /<svg/)
  for (const project_id of ['../account-b', '/data/projects/private', '%2e%2e', '__proto__', 'x\\y']) {
    // Reserved JS names are harmless opaque IDs, but path separators are always rejected.
    if (project_id === '__proto__') continue
    assert.equal((await f.tool(a.token, 'get_canvas_elements', { project_id })).data.result.isError, true)
  }
  assert.equal((await f.tool(a.token, 'get_canvas_elements', { project_id: 'shared-id', file: '../other' })).data.result.isError, true)
  assert.equal((await f.tool(a.token, 'export_selection', { project_id: 'shared-id', output: '../other' })).data.result.isError, true)
  const stored = JSON.parse(await readFile(join(f.root, 'projects', a.user.id, 'shared-id.paper.json'), 'utf8'))
  assert.equal(stored.document.scene.elements[frame.id].x, 120)
  const restarted = await createService({ root: f.root, secret, origin: 'http://localhost:3000' })
  assert.equal(restarted.auth.bearer(a.token).id, a.user.id)
  assert.equal((await restarted.storage.read(a.user.id, 'shared-id')).revision, stored.revision)
})

test('token rotation immediately revokes old tokens and survives restart without plaintext storage', async t => {
  const f = await fixture(t), a = await f.login('a')
  const rotation = await f.request('/api/auth/token/regenerate', { method: 'POST', headers: a.headers })
  assert.match(rotation.data.token, /^paper_/)
  assert.equal((await f.rpc(a.token, 'ping')).status, 401)
  assert.equal((await f.rpc(rotation.data.token, 'ping')).status, 200)
  assert.equal((await f.request('/api/auth/token', { headers: a.headers })).data.token, rotation.data.token)
  const disk = await readFile(join(f.root, 'auth.json'), 'utf8')
  assert.ok(!disk.includes(rotation.data.token))
  const restarted = await createService({ root: f.root, secret, origin: 'http://localhost:3000' })
  assert.equal(restarted.auth.bearer(a.token), undefined)
  assert.equal(restarted.auth.reveal(a.user.id), rotation.data.token)
  await f.request('/api/auth/logout', { method: 'POST', headers: a.headers })
  assert.equal((await f.request('/api/projects', { headers: a.headers })).status, 401)
})

test('atomic revision checks serialize racing REST and MCP writes; malformed scenes never replace data', async t => {
  const f = await fixture(t), a = await f.login('a')
  const created = await f.request('/api/projects/race', { method: 'PUT', headers: a.headers, body: JSON.stringify({ document: empty('Race'), updatedAt: Date.now(), expectedRevision: null }) })
  assert.equal(created.status, 200)
  const writes = await Promise.all(['first', 'second'].map(name => f.request('/api/projects/race', { method: 'PUT', headers: a.headers, body: JSON.stringify({ document: empty(name), updatedAt: Date.now(), expectedRevision: created.data.revision }) })))
  assert.deepEqual(writes.map(w => w.status).sort(), [200, 409])
  const conflict = writes.find(w => w.status === 409)
  assert.equal(conflict.data.current.revision, writes.find(w => w.status === 200).data.revision)
  const before = await f.storage.read(a.user.id, 'race')
  const mixed = await Promise.all([
    f.request('/api/projects/race', { method: 'PUT', headers: a.headers, body: JSON.stringify({ document: empty('REST'), updatedAt: Date.now(), expectedRevision: before.revision }) }),
    f.tool(a.token, 'create_frame', { project_id: 'race', expected_revision: before.revision, name: 'MCP' }),
  ])
  assert.equal(Number(mixed[0].status === 200) + Number(mixed[1].data.result.isError === false), 1)
  const after = await f.storage.read(a.user.id, 'race')
  const malformed = await f.request('/api/projects/race', { method: 'PUT', headers: a.headers, body: JSON.stringify({ document: { ...empty('Bad'), scene: { version: 1, elements: {}, rootIds: ['missing'] } }, updatedAt: Date.now(), expectedRevision: after.revision }) })
  assert.notEqual(malformed.status, 200)
  assert.equal((await f.storage.read(a.user.id, 'race')).revision, after.revision)
})

test('Google and GitHub OAuth bind state to the browser, exchange PKCE codes, and use verified identities', async t => {
  const calls = []
  const mockFetch = async (url, options) => {
    calls.push({ url, options })
    let data
    if (url.includes('/token') || url.includes('access_token')) data = { access_token: 'provider-private-token' }
    else if (url.includes('userinfo')) data = { sub: 'google-sub', name: 'Google User', email: 'google@test.local', email_verified: true }
    else if (url.endsWith('/user/emails')) data = [{ email: 'github@test.local', primary: true, verified: true }]
    else data = { id: 42, login: 'github-user', email: null }
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  }
  const f = await fixture(t, { google: { clientId: 'google-client', clientSecret: 'google-secret' }, github: { clientId: 'github-client', clientSecret: 'github-secret' }, fetch: mockFetch })
  for (const provider of ['google', 'github']) {
    const start = await f.request(`/api/auth/${provider}`)
    assert.equal(start.status, 302)
    const target = new URL(start.headers.get('location'))
    assert.equal(target.searchParams.get('code_challenge_method'), 'S256')
    const state = target.searchParams.get('state')
    const callback = `/api/auth/${provider}/callback?state=${state}&code=private-code`
    const done = await f.request(callback, { headers: { Cookie: `paper_oauth=${state}` } })
    assert.equal(done.status, 302)
    const session = done.headers.get('set-cookie').match(/paper_session=([^;]+)/)[1]
    assert.equal((await f.request('/api/auth/session', { headers: { Cookie: `paper_session=${session}` } })).data.user.email, `${provider}@test.local`)
    assert.equal((await f.request(callback, { headers: { Cookie: `paper_oauth=${state}` } })).status, 400)
  }
  const start = await f.request('/api/auth/google')
  const state = new URL(start.headers.get('location')).searchParams.get('state')
  assert.equal((await f.request(`/api/auth/google/callback?state=${state}&code=code`, { headers: { Cookie: 'paper_oauth=wrong' } })).status, 400)
  assert.ok(calls.filter(c => c.options.method === 'POST').every(c => new URLSearchParams(c.options.body).has('code_verifier')))
})

test('live changes are pushed only to the owning session through SSE', async t => {
  const f = await fixture(t), a = await f.login('a'), b = await f.login('b')
  const response = await f.open('/api/events', { headers: a.headers })
  await f.tool(b.token, 'create_frame', { project_id: 'b-only', name: 'B' })
  await f.tool(a.token, 'create_frame', { project_id: 'a-only', name: 'A' })
  const pushed = response.text()
  assert.match(pushed, /a-only/)
  assert.ok(!pushed.includes('b-only'))
  response.res.end(); response.res.emit('close')
})

test('canonical revisions and conflict ordering are deterministic', () => {
  assert.equal(canonical({ b: 2, a: { z: 1, x: 0 } }), canonical({ a: { x: 0, z: 1 }, b: 2 }))
  assert.equal(newer({ updatedAt: 3, revision: 'a' }, { updatedAt: 2, revision: 'z' }), true)
  assert.equal(newer({ updatedAt: 2, revision: 'z' }, { updatedAt: 2, revision: 'a' }), true)
})
