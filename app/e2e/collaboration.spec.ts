import { mockStudioSession } from './studio-session'
import { test, expect } from '@playwright/test'
import { getViewportTransform, waitForCanvasReady, waitForViewportSettled } from './helpers'

test('invited browsers share edits, live cursors, selection outlines and viewport following', async ({ page, browser }) => {
  await waitForCanvasReady(page)
  await page.getByRole('button', { name: 'Canvas collaborators' }).click()
  await expect(page.locator('.presence-connection')).toHaveText('Live')
  const invite = await page.getByRole('textbox', { name: 'Canvas invite link' }).inputValue()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    await context.addInitScript(() => localStorage.setItem('paper.profile.v1', JSON.stringify({ version: 1, name: 'Mira Chen' })))
    const peer = await context.newPage()
    await mockStudioSession(peer)
    await peer.goto(invite)
    await expect(peer.getByTestId('canvas-viewport')).toBeVisible()
    await expect(peer.locator('[data-element-id="space"]')).toBeAttached()
    await expect(page.locator('[data-peer-name="Mira Chen"]')).toBeVisible()
    await peer.getByRole('button', { name: 'Canvas collaborators' }).click()
    await expect(peer.getByTestId('presence-peer')).toHaveCount(1)
    await page.getByRole('button', { name: 'Canvas collaborators' }).click()

    await page.getByTestId('tool-rectangle').click()
    const id = await page.locator('.scene-node.is-selected').getAttribute('data-element-id')
    const remoteNode = peer.locator(`[data-element-id="${id}"]`)
    await expect(remoteNode).toBeAttached()
    const outline = peer.locator(`[data-remote-element-id="${id}"]`)
    await expect(outline).toBeVisible()
    const bounds = await remoteNode.boundingBox(), selectedBounds = await outline.boundingBox()
    expect(bounds).toBeTruthy(); expect(selectedBounds).toBeTruthy()
    expect(Math.abs(bounds!.x - selectedBounds!.x)).toBeLessThan(1)
    expect(Math.abs(bounds!.y - selectedBounds!.y)).toBeLessThan(1)
    // Local selection is private even though the remote selection is visible.
    await expect(peer.locator('.scene-node.is-selected')).toHaveCount(0)

    const viewport = await page.getByTestId('canvas-viewport').boundingBox()
    await page.mouse.move(viewport!.x + viewport!.width / 2, viewport!.y + viewport!.height / 2)
    await expect(peer.getByTestId('remote-cursor')).toBeVisible()
    const previous = await peer.getByTestId('remote-cursor').getAttribute('style')
    await page.mouse.move(viewport!.x + viewport!.width / 2 + 120, viewport!.y + viewport!.height / 2 + 80, { steps: 8 })
    await expect(peer.getByTestId('remote-cursor')).not.toHaveAttribute('style', previous!)

    await peer.getByRole('button', { name: 'Follow Paper Designer', exact: true }).click()
    await expect(peer.locator('.follow-banner')).toBeVisible()
    await page.getByTestId('canvas-viewport').focus()
    await page.keyboard.press('+')
    await waitForViewportSettled(page)
    const leader = await getViewportTransform(page)
    await expect.poll(async () => (await getViewportTransform(peer)).zoom).toBeCloseTo(leader.zoom, 3)
    await peer.getByTestId('canvas-viewport').focus()
    await peer.keyboard.press('Escape')
    await expect(peer.locator('.follow-banner')).toHaveCount(0)

    await context.setOffline(true)
    await expect(peer.locator('.presence-connection')).toHaveText(/Offline|Reconnecting/)
    await peer.getByTestId('tool-ellipse').click()
    const offlineId = await peer.locator('.scene-node.is-selected').getAttribute('data-element-id')
    await expect(page.locator(`[data-element-id="${offlineId}"]`)).toHaveCount(0)
    await context.setOffline(false)
    await expect(peer.locator('.presence-connection')).toHaveText('Live', { timeout: 10000 })
    await expect(page.locator(`[data-element-id="${offlineId}"]`)).toBeAttached()
  } finally { await context.close() }
})
