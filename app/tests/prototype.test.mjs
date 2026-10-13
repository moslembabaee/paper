import test from 'node:test'
import assert from 'node:assert/strict'
import { SceneStore } from '../src/scene/store.ts'
import { createProject, parseProject, serializeProject } from '../src/io/project.ts'
import { CURVES, DEFAULT_TRANSITION, EMPTY_PROTOTYPE, easeProgress, frameFor, matchedLayers, presentationExtent, smartKeyframes, transitionFrames, validatePrototype } from '../src/prototype/model.ts'

function fixture() {
  const store = new SceneStore()
  store.add('frame', { id: 'a', width: 390, height: 420 })
  store.add('frame', { id: 'b', x: 510, width: 390, height: 420 })
  store.add('frame', { id: 'nested', parentId: 'a', name: 'Card', width: 200, height: 100 })
  store.add('rectangle', { id: 'button', parentId: 'nested', name: 'Button', x: 10, y: 20 })
  store.add('rectangle', { id: 'bottom', parentId: 'a', y: 900 })
  store.clearHistory()
  return store
}

test('connections and settings are immutable, undoable, and preserved by project round trips', () => {
  const store = fixture(), before = store.getSnapshot()
  const interaction = store.connectPrototype('button', 'b')
  assert.equal(frameFor(before.elements, 'button'), 'a')
  assert.equal(Object.isFrozen(interaction.transition.curve), true)
  store.undo()
  assert.equal(store.getSnapshot(), before)
  store.redo()
  store.setPrototype({ ...store.getSnapshot().prototype, startFrameId: 'a', device: 'phone' })
  for (const trigger of ['click', 'hover', 'drag', 'delay']) {
    store.updateInteraction(interaction.id, { trigger, delay: 1200 })
    const restored = parseProject(serializeProject(createProject(store, 'Prototype', { x: 0, y: 0, zoom: 1 }, true)))
    assert.deepEqual(restored.scene.prototype, store.getSnapshot().prototype)
  }
  const history = store.getHistorySnapshot()
  store.updateInteraction(interaction.id, { delay: 1200 })
  assert.equal(store.getHistorySnapshot(), history)
  store.removeInteraction(interaction.id)
  assert.equal(store.getSnapshot().prototype.interactions.length, 0)
  store.undo()
  assert.equal(store.getSnapshot().prototype.interactions.length, 1)
})

test('deletion and reparenting clean invalid wires in the same reversible edit', () => {
  const store = fixture(), interaction = store.connectPrototype('button', 'b')
  store.setPrototype({ ...store.getSnapshot().prototype, startFrameId: 'b' })
  const before = store.getSnapshot()
  store.remove('b')
  assert.equal(store.getSnapshot().prototype.startFrameId, null)
  assert.equal(store.getSnapshot().prototype.interactions.length, 0)
  store.undo()
  assert.equal(store.getSnapshot(), before)
  store.updateInteraction(interaction.id, { action: 'scroll', targetId: 'bottom' })
  const scrollState = store.getSnapshot()
  store.reparent('bottom', 'b')
  assert.equal(store.getSnapshot().prototype.interactions.length, 0)
  store.undo()
  assert.equal(store.getSnapshot(), scrollState)
})

test('invalid imports and edits fail atomically without changing the redo branch', () => {
  const store = fixture(), interaction = store.connectPrototype('button', 'b')
  store.updateInteraction(interaction.id, { delay: 1000 })
  store.undo()
  const before = store.getSnapshot(), history = store.getHistorySnapshot()
  const prototype = before.prototype
  const invalid = [
    { ...prototype, device: 'watch' },
    { ...prototype, startFrameId: 'button' },
    { ...prototype, interactions: [interaction, interaction] },
    ...[
      { trigger: 'unknown' }, { targetId: 'missing' }, { sourceId: 'missing' },
      { action: 'navigate', targetId: 'button' }, { action: 'scroll', targetId: 'b' },
      { delay: NaN }, { delay: -1 }, { delay: 60001 },
      { transition: { ...DEFAULT_TRANSITION, duration: Infinity } },
      { transition: { ...DEFAULT_TRANSITION, curve: [1.1, 0, 1, 1] } },
      { transition: { ...DEFAULT_TRANSITION, curve: [0, 0, 1] } },
      { transition: { ...DEFAULT_TRANSITION, kind: 'unknown' } },
    ].map(patch => ({ ...prototype, interactions: [{ ...interaction, ...patch }] })),
  ]
  for (const value of invalid) {
    assert.throws(() => store.load({ ...store.toJSON(), prototype: value }))
    assert.equal(store.getSnapshot(), before)
    assert.equal(store.getHistorySnapshot(), history)
  }
  assert.throws(() => store.updateInteraction(interaction.id, { action: 'scroll', targetId: 'b' }))
  assert.equal(store.getSnapshot(), before)
  assert.equal(validatePrototype(undefined, before.elements), EMPTY_PROTOTYPE)
})

test('legacy documents load without adding prototype settings', () => {
  const store = fixture(), document = store.toJSON()
  store.connectPrototype('button', 'b')
  store.load(document)
  assert.equal(Object.hasOwn(store.toJSON(), 'prototype'), false)
})

test('smart matching uses hierarchy, type and duplicate ordinals; hidden subtrees are excluded', () => {
  const store = fixture()
  store.add('frame', { id: 'nested-b', parentId: 'b', name: 'Card' })
  store.add('rectangle', { id: 'button-b', parentId: 'nested-b', name: 'Button' })
  store.add('rectangle', { id: 'duplicate-a', parentId: 'nested', name: 'Button' })
  store.add('rectangle', { id: 'duplicate-b', parentId: 'nested-b', name: 'Button' })
  assert.deepEqual(matchedLayers(store.getSnapshot().elements, 'a', 'b').map(pair => [pair.from.id, pair.to.id]), [
    ['a', 'b'], ['nested', 'nested-b'], ['button', 'button-b'], ['duplicate-a', 'duplicate-b'],
  ])
  store.setVisible('nested-b', false)
  assert.equal(matchedLayers(store.getSnapshot().elements, 'a', 'b').length, 1)
})

test('Smart Animate matrices preserve centered rotation and compensate nested parent sizes', () => {
  const store = fixture(), from = store.getSnapshot().elements.button
  const to = { ...from, x: 60, y: 80, width: 80, height: 40, rotation: 90 }
  const parent = { from: { ...from, width: 200, height: 100 }, to: { ...from, width: 400, height: 200 } }
  const frames = smartKeyframes(from, to, parent)
  const numbers = frame => frame.transform.slice(7, -1).split(',').map(Number)
  const start = numbers(frames[0]), end = numbers(frames[1])
  // The parent's 0.5 starting scale must be undone for its child's coordinates.
  assert.equal(start[4] + to.x, from.x * 2)
  assert.equal(start[5] + to.y, from.y * 2)
  assert.equal(start[0] * to.width / 2, from.width)
  assert.ok(Math.abs(end[0]) < 1e-12)
  assert.equal(end[1], 1)
  assert.equal(end[2], -1)
  assert.equal(end[4], 60) // width/2 + height/2 at a center-origin 90° rotation
  assert.equal(end[5], -20)
  const root = smartKeyframes(parent.from, parent.to, undefined, 2, 120)
  assert.equal(numbers(root[0])[5], -120)
  assert.equal(numbers(root[1])[5], 0)
  const horizontal = smartKeyframes(parent.from, parent.to, undefined, 2, 0, 240)
  assert.equal(numbers(horizontal[0])[4], -240)
  assert.equal(numbers(horizontal[1])[4], 0)
})

test('presentation scroll bounds include both axes and respect nested clipping and visibility', () => {
  const store = fixture()
  store.update('a', 'frame', { x: 1800, y: 2400, rotation: 45 })
  store.add('rectangle', { id: 'right', parentId: 'a', x: 900, y: 40, width: 300, height: 80 })
  store.add('rectangle', { id: 'clipped', parentId: 'nested', x: 3000, y: 3000, width: 100, height: 100 })
  assert.deepEqual(presentationExtent(store.getSnapshot(), 'a'), { width: 1200, height: 1020 })
  store.setVisible('right', false)
  assert.equal(presentationExtent(store.getSnapshot(), 'a').width, 390)
  store.update('nested', 'frame', { clipContent: false })
  assert.deepEqual(presentationExtent(store.getSnapshot(), 'nested'), { width: 3100, height: 3100 })
})

test('easing solves the cubic x coordinate and slides cover each direction', () => {
  assert.equal(easeProgress(0, CURVES.linear), 0)
  assert.equal(easeProgress(1, CURVES.linear), 1)
  assert.ok(Math.abs(easeProgress(.3, CURVES.linear) - .3) < .00001)
  assert.ok(easeProgress(.5, CURVES['ease-out']) > .5)
  assert.ok(easeProgress(.5, CURVES['ease-in']) < .5)
  for (const direction of ['left', 'right', 'up', 'down']) {
    const incoming = transitionFrames({ ...DEFAULT_TRANSITION, kind: 'slide-in', direction })
    const outgoing = transitionFrames({ ...DEFAULT_TRANSITION, kind: 'slide-out', direction })
    assert.equal(incoming.incoming[1].transform, 'translate(0, 0)')
    assert.equal(outgoing.outgoing[0].transform, 'translate(0, 0)')
    assert.match(outgoing.outgoing[1].transform, /100%/)
  }
  assert.equal(transitionFrames({ ...DEFAULT_TRANSITION, kind: 'instant' }).incoming[0].opacity, 1)
})
