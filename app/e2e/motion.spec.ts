import { test, expect } from '@playwright/test'
import { waitForCanvasReady } from './helpers'

test.beforeEach(async ({ page }) => {
  await waitForCanvasReady(page)
})

test('motion sequencer drawer opens via toolbar and keyboard shortcut K', async ({ page }) => {
  const motionButton = page.getByTestId('tool-motion')
  await expect(motionButton).toBeVisible()

  // Open via toolbar button
  await motionButton.click()
  const drawer = page.getByTestId('motion-drawer')
  await expect(drawer).toBeVisible()
  await expect(drawer).toContainText('SEQUENCER')

  // Close via close button in header
  await page.getByRole('button', { name: 'Close motion timeline' }).click()
  await expect(drawer).toHaveCount(0)

  // Open via keyboard shortcut 'k'
  await page.keyboard.press('k')
  await expect(drawer).toBeVisible()

  // Close via Escape
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
})

test('starter template creates tracks and enables playback & transport controls', async ({ page }) => {
  // Open sequencer
  await page.getByTestId('tool-motion').click()
  const drawer = page.getByTestId('motion-drawer')
  await expect(drawer).toBeVisible()

  // Empty state should be visible initially
  await expect(page.getByText('Canvas Keyframe Motion Sequencer')).toBeVisible()

  // Click starter template "Animate Position (X/Y)"
  await page.getByRole('button', { name: 'Animate Position (X/Y)' }).click()

  // Should have created 2 tracks (Translate X and Translate Y)
  await expect(drawer.locator('.motion-track-row')).toHaveCount(2)
  await expect(drawer.locator('.motion-diamond')).toHaveCount(4) // 2 keyframes per track

  // Play button should now be enabled
  const playButton = page.getByRole('button', { name: /Play motion/i })
  await expect(playButton).toBeEnabled()

  // Start playback
  await playButton.click()
  await expect(page.getByRole('button', { name: /Pause motion/i })).toBeVisible()

  // Pause playback
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: /Play motion/i })).toBeVisible()

  // Loop toggle
  const loopButton = page.getByRole('button', { name: 'Loop motion' })
  await expect(loopButton).toHaveAttribute('aria-pressed', 'false')
  await loopButton.click()
  await expect(loopButton).toHaveAttribute('aria-pressed', 'true')

  // Step frames
  const forwardStep = page.getByRole('button', { name: 'Step forward 1 frame (Right Arrow)' })
  await forwardStep.click()
  await forwardStep.click()

  // Restore design button appears during preview
  const restoreButton = page.getByRole('button', { name: 'Restore design' })
  await expect(restoreButton).toBeVisible()
  await restoreButton.click()
  await expect(restoreButton).toHaveCount(0)
})

test('keyframe inspector allows adding keyframes, editing values, and custom Bézier presets', async ({ page }) => {
  await page.getByTestId('tool-motion').click()
  const drawer = page.getByTestId('motion-drawer')

  // Apply scale & opacity starter
  await page.getByRole('button', { name: 'Animate Scale & Opacity' }).click()
  await expect(drawer.locator('.motion-track-row')).toHaveCount(2)

  // Select first keyframe diamond of first track
  const firstDiamond = drawer.locator('.motion-diamond').first()
  await firstDiamond.click()
  await expect(firstDiamond).toHaveClass(/is-selected/)

  // Inspector sidebar should show keyframe details
  const inspector = drawer.locator('.motion-inspector')
  await expect(inspector).toContainText('KEYFRAME 1 / 2')

  // Switch to Cubic Bézier tab
  await inspector.getByRole('button', { name: 'Cubic Bézier' }).click()

  // Change Bézier preset to 'Snappy'
  const presetSelect = inspector.getByLabel('Motion Bézier preset')
  await expect(presetSelect).toBeVisible()
  await presetSelect.selectOption('snappy')

  // Add a keyframe at playhead
  // Move playhead forward first
  await page.getByRole('button', { name: 'Step forward 1 frame (Right Arrow)' }).click()
  await page.getByRole('button', { name: 'Step forward 1 frame (Right Arrow)' }).click()
  await page.getByRole('button', { name: 'Keyframe', exact: true }).click()

  // Now the track should have 3 keyframes
  const firstTrackRow = drawer.locator('.motion-track-row').first()
  await expect(firstTrackRow.locator('.motion-diamond')).toHaveCount(3)

  // Duplicate keyframe
  await page.getByTitle(/Duplicate keyframe/i).click()
  await expect(firstTrackRow.locator('.motion-diamond')).toHaveCount(4)

  // Delete keyframe
  await page.getByRole('button', { name: 'Delete motion keyframe' }).click()
  await expect(firstTrackRow.locator('.motion-diamond')).toHaveCount(3)
})

test('code export dialog generates Framer Motion, CSS, WAAPI, and JSON', async ({ page }) => {
  await page.getByTestId('tool-motion').click()

  // Add tracks
  await page.getByRole('button', { name: 'Animate Position (X/Y)' }).click()

  // Open Export Modal
  await page.getByRole('button', { name: 'Export code' }).click()
  const modal = page.locator('.motion-export')
  await expect(modal).toBeVisible()

  const textarea = modal.locator('textarea')
  await expect(textarea).toContainText('import { motion } from "framer-motion"')

  // Switch to CSS Keyframes
  const formatSelect = modal.getByLabel('Motion export format')
  await formatSelect.selectOption('css')
  await expect(textarea).toContainText('@keyframes paper-motion')
  await expect(textarea).toContainText('translate:')

  // Switch to WAAPI
  await formatSelect.selectOption('waapi')
  await expect(textarea).toContainText('element.animate(')

  // Switch to JSON
  await formatSelect.selectOption('json')
  await expect(textarea).toContainText('"duration":')
  await expect(textarea).toContainText('"tracks":')

  // Close export modal
  await modal.getByRole('button', { name: 'Close motion export' }).click()
  await expect(modal).toHaveCount(0)
})

test('motion sequencer aesthetic and bezier curve selection', async ({ page }) => {
  await page.getByTestId('tool-motion').click()
  const drawer = page.getByTestId('motion-drawer')
  await expect(drawer).toBeVisible()

  // Apply position starter template
  await page.getByRole('button', { name: 'Animate Position (X/Y)' }).click()
  await expect(drawer.locator('.motion-track-row')).toHaveCount(2)

  // Select keyframe to display the interactive cubic Bézier curve
  const firstDiamond = drawer.locator('.motion-diamond').first()
  await firstDiamond.click()
  const inspector = drawer.locator('.motion-inspector')
  await inspector.getByRole('button', { name: 'Cubic Bézier' }).click()
  await inspector.getByLabel('Motion Bézier preset').selectOption('cinematic')

  // Verify Bézier curve path and control handles are rendered in the SVG
  await expect(inspector.locator('.motion-curve')).toBeVisible()
  await expect(inspector.locator('.motion-graph-handle')).toHaveCount(2)
})

test('spring physics controls, sliders, telemetry, and test bounce simulation', async ({ page }) => {
  await page.getByTestId('tool-motion').click()
  const drawer = page.getByTestId('motion-drawer')
  await expect(drawer).toBeVisible()

  // Apply position starter template
  await page.getByRole('button', { name: 'Animate Position (X/Y)' }).click()

  // Select keyframe
  const firstDiamond = drawer.locator('.motion-diamond').first()
  await firstDiamond.click()
  const inspector = drawer.locator('.motion-inspector')

  // Switch to Spring Physics tab
  await inspector.getByRole('button', { name: 'Spring Physics' }).click()

  // Verify spring preset select and telemetry
  const springPresetSelect = inspector.getByLabel('Motion spring preset')
  await expect(springPresetSelect).toBeVisible()

  // Telemetry box should be rendered
  const telemetry = inspector.locator('.motion-spring-telemetry')
  await expect(telemetry).toBeVisible()
  await expect(telemetry).toContainText('Damping (ζ)')
  await expect(telemetry).toContainText('Settle Time')

  // Sliders for stiffness, damping, mass
  await expect(inspector.getByLabel('Motion spring stiffness slider')).toBeVisible()
  await expect(inspector.getByLabel('Motion spring damping slider')).toBeVisible()
  await expect(inspector.getByLabel('Motion spring mass slider')).toBeVisible()

  // Quick preset pills
  const snappyPill = inspector.locator('.motion-quick-presets').getByRole('button', { name: 'Snappy' })
  await expect(snappyPill).toBeVisible()
  await snappyPill.click()

  // Test Bounce simulation button
  const testBounceBtn = inspector.getByRole('button', { name: /Test Bounce/i })
  await expect(testBounceBtn).toBeVisible()
  await testBounceBtn.click()
})
