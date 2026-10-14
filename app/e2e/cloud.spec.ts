import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const user = { id: 'test-account', name: 'Cloud Designer', email: 'designer@paper.test', avatar: '', createdAt: 1, hasMcpToken: false }
async function openProfile(page: Page) {
  await page.getByRole('button', { name: 'User profile menu' }).click()
  await page.getByRole('menuitem', { name: 'Profile & account' }).click()
  return page.getByRole('dialog', { name: 'Profile & account', exact: true })
}
async function localRecords(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('paper.workspaces', 1); request.onsuccess = () => resolve(request.result) })
    const projects = await new Promise<{ id: string; document: unknown; cloud?: { owner: string; projectId: string; revision: string; dirty: boolean } }[]>(resolve => { const request = db.transaction('projects').objectStore('projects').getAll(); request.onsuccess = () => resolve(request.result) })
    db.close(); return projects
  })
}

test('static hosting keeps guest projects local and never probes cloud APIs', async ({ page }) => {
  const cloudRequests: string[] = []
  page.on('request', request => { if (/\/api\/(auth|projects|events)/.test(request.url())) cloudRequests.push(request.url()) })
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: 'Project name', exact: true })).toBeVisible()
  const settings = await openProfile(page)
  await expect(settings.getByText('This host supports local workspaces. Your projects stay on this device.')).toBeVisible()
  await expect(settings.getByRole('link', { name: 'Sign in with Google' })).toHaveCount(0)
  expect(cloudRequests).toEqual([])
})

test('migration, edits, headless pulls and remote token rotation work in the browser', async ({ page }) => {
  test.setTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let remote: { id: string; document: unknown; revision: string; updatedAt: number; createdAt: number; activity?: { ids: string[]; tool: string; until: number } } | undefined
  let generated = false
  let tokenNumber = 0
  await page.route('**/cloud.json', route => route.fulfill({ json: { cloud: true } }))
  await page.route('**/api/auth/session', route => route.fulfill({ json: { user: { ...user, hasMcpToken: generated }, providers: { google: true, github: true } } }))
  await page.route('**/api/events?*', route => route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': connected\n\n' }))
  await page.route('**/api/projects', route => route.fulfill({ json: { projects: remote ? [{ id: remote.id, revision: remote.revision }] : [] } }))
  await page.route('**/api/projects/*', async route => {
    const id = new URL(route.request().url()).pathname.split('/').pop()!
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON()
      if (input.expectedRevision !== (remote?.revision ?? null)) { await route.fulfill({ status: 409, json: { current: remote } }); return }
      remote = { id, document: input.document, revision: `browser-${++tokenNumber}`, updatedAt: input.updatedAt, createdAt: remote?.createdAt ?? Date.now() }
      await route.fulfill({ json: remote }); return
    }
    await route.fulfill({ status: remote ? 200 : 404, json: remote ?? { error: 'Not found' } })
  })
  await page.route('**/api/auth/token/regenerate', async route => { generated = true; await route.fulfill({ json: { token: `paper_remote-token-${++tokenNumber}` } }) })
  await page.route('**/api/auth/token', route => route.fulfill({ json: { token: `paper_remote-token-${tokenNumber}` } }))
  await page.goto('/')
  const migration = page.getByRole('dialog', { name: 'Bring your projects along.' })
  await expect(migration).toBeVisible()
  await migration.getByRole('button', { name: 'Sync my projects' }).click()
  await expect.poll(() => !!remote).toBe(true)
  await expect(page.locator('.cloud-status')).toHaveText('Saved to cloud')
  const local = await localRecords(page)
  expect(local[0].cloud?.owner).toBe(user.id)
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Synced study')
  await expect.poll(() => (remote?.document as { name: string })?.name).toBe('Synced study')
  // Change the server copy without a browser edit, then reload as a returning user.
  remote = { ...remote!, document: { ...(remote!.document as object), name: 'Edited while closed' }, revision: 'headless-revision', updatedAt: Date.now() + 1000 }
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue('Edited while closed')
  const settings = await openProfile(page)
  await expect(settings.getByText(user.email)).toBeVisible()
  await settings.getByRole('button', { name: 'Generate remote token' }).click()
  const field = settings.getByRole('textbox', { name: 'Remote MCP auth token' })
  await expect(field).toHaveValue(/paper_remote-token-/)
  const first = await field.inputValue()
  await settings.getByRole('button', { name: 'Regenerate remote token' }).click()
  await expect(field).not.toHaveValue(first)
  expect(errors).toEqual([])
})

test('cloud login offers configured providers without changing guest rendering', async ({ page }) => {
  await page.route('**/cloud.json', route => route.fulfill({ json: { cloud: true } }))
  await page.route('**/api/auth/session', route => route.fulfill({ json: { user: null, providers: { google: true, github: true } } }))
  await page.goto('/')
  await expect(page.locator('[data-element-id="space"]')).toBeVisible()
  const settings = await openProfile(page)
  await expect(settings.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute('href', '/api/auth/google')
  await expect(settings.getByRole('link', { name: 'Sign in with GitHub' })).toHaveAttribute('href', '/api/auth/github')
})
