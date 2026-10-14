import { expect, test, type Page } from '@playwright/test'
import type { CloudProject } from '../src/cloud/model'
import type { LocalProject } from '../src/workspace/types'

const user = { id: 'sync-account', email: 'sync@paper.test', name: 'Sync Designer', avatar: '', createdAt: 1, hasMcpToken: false }

async function records(page: Page): Promise<LocalProject[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('paper.workspaces', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<LocalProject[]>((resolve, reject) => {
        const request = db.transaction('projects').objectStore('projects').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally { db.close() }
  })
}

async function setup(page: Page) {
  const server = {
    remote: undefined as CloudProject | undefined,
    puts: 0, lists: 0, unauthorized: false,
    hold: undefined as Promise<void> | undefined,
    conflict: undefined as CloudProject | undefined,
  }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    localStorage.setItem('paper.project.v1', JSON.stringify({ format: 'paper', version: 1, name: 'Sync study', scene: { version: 1, elements: {}, rootIds: [] }, viewport: { x: 0, y: 0, zoom: 1 }, grid: true }))
    // Polling and explicit reconnects are exercised independently of SSE reconnection timing.
    class Events extends EventTarget { close() {} }
    Object.defineProperty(window, 'EventSource', { value: Events })
  })
  await page.route('**/cloud.json', route => route.fulfill({ json: { cloud: true } }))
  await page.route('**/api/auth/session', route => route.fulfill({ json: { user, providers: { google: false, github: true } } }))
  await page.route('**/api/projects', route => {
    server.lists++
    return route.fulfill(server.unauthorized ? { status: 401, json: { error: 'Expired' } } : { json: { projects: server.remote ? [{ id: server.remote.id, revision: server.remote.revision }] : [] } })
  })
  await page.route('**/api/projects/*', async route => {
    if (route.request().method() !== 'PUT') { await route.fulfill({ json: server.remote }); return }
    server.puts++
    const input = route.request().postDataJSON()
    const hold = server.hold
    server.hold = undefined
    if (hold) await hold
    if (server.conflict) { server.remote = server.conflict; server.conflict = undefined }
    if (input.expectedRevision !== (server.remote?.revision ?? null)) {
      await route.fulfill({ status: 409, json: { error: 'Conflict', current: server.remote } }); return
    }
    server.remote = { id: new URL(route.request().url()).pathname.split('/').pop()!, document: input.document, revision: `revision-${server.puts}`, updatedAt: input.updatedAt, createdAt: 1 }
    await route.fulfill({ json: server.remote })
  })
  await page.goto('/')
  const migration = page.getByRole('dialog', { name: 'Bring your projects along.' })
  await expect(migration).toBeVisible()
  await migration.getByRole('button', { name: 'Sync my projects' }).click()
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud')
  return { server, errors }
}

test('offline edits survive reload and reconnect without a cloud write loop', async ({ page, context }) => {
  const { server, errors } = await setup(page)
  const uploaded = server.puts
  await context.setOffline(true)
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Offline exploration')
  await page.getByRole('button', { name: 'Add rectangle', exact: true }).click()
  await expect.poll(async () => (await records(page))[0]?.document.scene.rootIds.length).toBe(1)
  expect((await records(page))[0].document.name).toBe('Offline exploration')
  expect((await records(page))[0].cloud?.dirty).toBe(true)
  expect(server.puts).toBe(uploaded)
  await expect(page.getByTestId('sync-status')).toHaveText('Offline · saved locally')
  await page.screenshot({ path: '/tmp/paper-sync-offline.png' })
  // Dev-server reload needs the network; keep cloud unavailable until the draft is restored.
  await context.setOffline(false)
  server.unauthorized = true
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue('Offline exploration')
  await expect(page.getByTestId('sync-status')).toHaveText('Sign in to sync')
  server.unauthorized = false
  await page.getByRole('button', { name: 'Retry cloud sync' }).click()
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud')
  expect(server.remote?.document.name).toBe('Offline exploration')
  expect(server.remote?.document.scene.rootIds).toHaveLength(1)
  expect((await records(page))[0].cloud?.dirty).toBe(false)
  // After the one follow-up pass, acknowledgements must not perpetually schedule work.
  await page.waitForTimeout(600)
  const lists = server.lists, puts = server.puts
  await page.waitForTimeout(1400)
  expect(server.lists).toBe(lists)
  expect(server.puts).toBe(puts)
  await page.screenshot({ path: '/tmp/paper-sync-saved.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('sync-status')).toBeVisible()
  await page.screenshot({ path: '/tmp/paper-sync-mobile.png' })
  expect(errors).toEqual([])
})

test('edits made during an upload remain queued and selection does not resave', async ({ page }) => {
  const { server, errors } = await setup(page)
  let release!: () => void
  server.hold = new Promise<void>(resolve => { release = resolve })
  const before = server.puts
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('First upload')
  await expect.poll(() => server.puts).toBe(before + 1)
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Newer live edit')
  await expect.poll(async () => (await records(page))[0].document.name).toBe('Newer live edit')
  release()
  await expect.poll(() => server.remote?.document.name).toBe('Newer live edit')
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud')
  await page.getByRole('button', { name: 'Add rectangle', exact: true }).click()
  await expect.poll(() => server.remote?.document.scene.rootIds.length).toBe(1)
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud')
  await page.waitForTimeout(600)
  const puts = server.puts, updatedAt = (await records(page))[0].updatedAt
  await page.getByRole('button', { name: 'Deselect elements', exact: true }).click()
  await page.locator('.scene-node[data-element-id]').click()
  await page.waitForTimeout(1400)
  expect(server.puts).toBe(puts)
  expect((await records(page))[0].updatedAt).toBe(updatedAt)
  expect(errors).toEqual([])
})

test('409 resolution keeps the remote winner and an IndexedDB recovery copy', async ({ page }) => {
  const { server, errors } = await setup(page)
  server.conflict = { ...server.remote!, document: { ...server.remote!.document, name: 'Remote winner' }, revision: 'remote-winner', updatedAt: Date.now() + 10_000 }
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Losing local edit')
  await expect(page.getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue('Remote winner')
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud')
  const saved = await records(page)
  expect(saved).toHaveLength(2)
  expect(saved.find(record => !record.cloud)?.document.name).toBe('Losing local edit (conflict copy)')
  expect(saved.find(record => record.cloud)?.cloud?.dirty).toBe(false)
  expect(errors).toEqual([])
})

test('409 resolution retries the newer local document using the server revision', async ({ page }) => {
  const { server, errors } = await setup(page)
  server.conflict = { ...server.remote!, document: { ...server.remote!.document, name: 'Older remote' }, revision: 'older-remote', updatedAt: 1 }
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Local winner')
  await expect.poll(() => server.remote?.document.name).toBe('Local winner')
  await expect(page.getByTestId('sync-status')).toHaveText('Saved to cloud')
  expect((await records(page))[0].cloud?.dirty).toBe(false)
  expect(errors).toEqual([])
})
