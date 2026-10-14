import { mockStudioSession } from './studio-session'
import { expect, test } from '@playwright/test'

const fixture = {
  project: 'Paper', mode: 'live', updated_at: '2026-10-13T05:15:57Z',
  tasks: [
    { id: 'T-ACTIVE', title: 'Vector editing', phase: 'Vectors', assigned_agent: 'codex', status: 'in_progress' },
    { id: 'T-NEXT', title: 'Community feedback', phase: 'Community', assigned_agent: 'claude', status: 'pending' },
    { id: 'T-DONE', title: 'Engineering grid', phase: 'Canvas', assigned_agent: 'antigravity', status: 'completed', completed_at: '2026-10-12T20:45:14' },
  ],
}

test('roadmap searches, filters, refreshes and returns keyboard focus without editing the canvas', async ({ page }) => {
  let feed = fixture
  await page.route('**/roadmap.json', route => route.fulfill({ json: feed }))
  await mockStudioSession(page)
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Open development roadmap' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'The work, in the open.' })
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
  await expect(dialog.getByText('Live · checks every 30 seconds')).toBeVisible()
  const canvasNodes = await page.locator('.scene-node').count()
  await dialog.getByRole('button', { name: 'Completed', exact: false }).click()
  await expect(dialog.locator('.roadmap-task')).toHaveCount(1)
  await expect(dialog.getByText('Engineering grid', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'All tasks', exact: false }).click()
  await dialog.getByRole('searchbox').fill('claude')
  await expect(dialog.locator('.roadmap-task')).toHaveCount(1)
  await expect(dialog.getByText('Community feedback', { exact: true })).toBeVisible()
  await dialog.getByRole('searchbox').fill('no such feature')
  await expect(dialog.getByText('No matching tasks', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Clear search', exact: true }).click()
  feed = { ...fixture, tasks: fixture.tasks.map(task => ({ ...task, status: 'completed' })) }
  await dialog.getByRole('button', { name: 'Refresh roadmap' }).click()
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  await dialog.getByRole('button', { name: 'Upcoming', exact: false }).click()
  await expect(dialog.getByText('This queue is complete.', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close roadmap' }).focus()
  await page.keyboard.press('r')
  await expect(page.locator('.scene-node')).toHaveCount(canvasNodes)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('failed refresh retains data, recovers on retry and fits a narrow light-mode viewport', async ({ page }) => {
  let fail = false
  await page.route('**/roadmap.json', route => fail ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { ...fixture, mode: 'snapshot' } }))
  await page.setViewportSize({ width: 390, height: 844 })
  await mockStudioSession(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Clean Slate light theme' }).click()
  await page.getByRole('button', { name: 'Open development roadmap' }).click()
  const dialog = page.getByRole('dialog', { name: 'The work, in the open.' })
  await expect(dialog.getByText('Published snapshot', { exact: true })).toBeVisible()
  fail = true
  await dialog.getByRole('button', { name: 'Refresh roadmap' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Showing the last available snapshot')
  await expect(dialog.locator('.roadmap-task')).toHaveCount(3)
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33')
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  fail = false
  await dialog.getByRole('button', { name: 'Refresh roadmap' }).click()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(dialog.getByText('Published snapshot', { exact: true })).toBeVisible()
  await dialog.screenshot({ path: 'e2e/screenshots/roadmap-light.png' })
})
