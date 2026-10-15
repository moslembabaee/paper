import test from 'node:test'
import assert from 'node:assert/strict'
import { SceneStore } from '../src/scene/store.ts'
import { SceneReplica } from '../src/collaboration/model.ts'
import { CURVES } from '../src/prototype/model.ts'
import { SPRING_PRESETS } from '../src/prototype/spring.ts'
import {
  createTrack,
  DEFAULT_EASING,
  EMPTY_MOTION,
  easingProgress,
  patchKeyframe,
  PROPERTY_META,
  pruneMotion,
  sampleTimes,
  trackValue,
  validateMotion,
} from '../src/motion/model.ts'
import { exportMotion } from '../src/motion/export.ts'

function fixture() {
  const store = new SceneStore()
  store.add('frame', { id: 'frame1', width: 400, height: 400 })
  store.add('rectangle', { id: 'rect1', parentId: 'frame1', x: 20, y: 20, width: 100, height: 80 })
  store.add('ellipse', { id: 'circle1', parentId: 'frame1', x: 150, y: 150, width: 60, height: 60 })
  store.clearHistory()
  return store
}

test('motion track creation, validation, and keyframe retiming', () => {
  const store = fixture()
  const elements = store.getSnapshot().elements

  const trackX = createTrack('rect1', 'x', 2000)
  assert.equal(trackX.elementId, 'rect1')
  assert.equal(trackX.property, 'x')
  assert.equal(trackX.keyframes.length, 2)
  assert.equal(trackX.keyframes[0].time, 0)
  assert.equal(trackX.keyframes[0].value, PROPERTY_META.x.from)
  assert.equal(trackX.keyframes[1].value, PROPERTY_META.x.to)

  const motionDoc = {
    duration: 2000,
    tracks: [trackX],
  }

  const validated = validateMotion(motionDoc, elements)
  assert.equal(validated.duration, 2000)
  assert.equal(validated.tracks.length, 1)
  assert.equal(Object.isFrozen(validated), true)
  assert.equal(Object.isFrozen(validated.tracks), true)
  assert.equal(Object.isFrozen(validated.tracks[0].keyframes), true)

  // Invalid cases throw
  assert.throws(() => validateMotion({ duration: 50, tracks: [] }, elements)) // < 100ms
  assert.throws(() => validateMotion({ duration: 2000, tracks: [{ ...trackX, elementId: 'nonexistent' }] }, elements))
  assert.throws(() => validateMotion({ duration: 2000, tracks: [{ ...trackX, property: 'invalid' }] }, elements))

  // Out of order keyframes throw
  const badTrack = {
    ...trackX,
    keyframes: [
      { id: 'k1', time: 500, value: 0, easing: DEFAULT_EASING },
      { id: 'k2', time: 200, value: 100, easing: DEFAULT_EASING },
    ],
  }
  assert.throws(() => validateMotion({ duration: 2000, tracks: [badTrack] }, elements))

  // Retiming keyframes with patchKeyframe sorts properly
  const patched = patchKeyframe(trackX, trackX.keyframes[0].id, { time: 100 })
  assert.equal(patched.keyframes[0].time, 100)
})

test('spring physics and cubic Bézier curve evaluation with property bounds', () => {
  // Spring evaluation
  const springEasing = { kind: 'spring', spring: SPRING_PRESETS.bouncy.spring }
  const startVal = easingProgress(0, springEasing)
  assert.equal(startVal, 0)
  const endVal = easingProgress(1, springEasing)
  assert.ok(Math.abs(endVal - 1) < 0.05)

  // Bouncy spring exhibits overshoot (> 1.0) mid-flight
  const samples = Array.from({ length: 50 }, (_, i) => easingProgress(i / 50, springEasing))
  const maxSample = Math.max(...samples)
  assert.ok(maxSample > 1.0, `Expected bouncy spring overshoot > 1.0, got ${maxSample}`)

  // Cubic Bézier evaluation
  const bezierEasing = { kind: 'bezier', curve: CURVES['ease-out'] }
  assert.equal(easingProgress(0, bezierEasing), 0)
  assert.equal(easingProgress(1, bezierEasing), 1)
  assert.ok(easingProgress(0.5, bezierEasing) > 0.5) // Ease-out is ahead of linear at midpoint

  // Track value interpolation
  const track = {
    id: 't1',
    elementId: 'rect1',
    property: 'opacity',
    enabled: true,
    keyframes: [
      { id: 'k1', time: 0, value: 0.2, easing: { kind: 'bezier', curve: [0, 0, 1, 1] } },
      { id: 'k2', time: 1000, value: 0.8, easing: DEFAULT_EASING },
    ],
  }

  // Linear progression from 0.2 to 0.8 over 1000ms
  assert.equal(trackValue(track, 0), 0.2)
  assert.ok(Math.abs(trackValue(track, 500) - 0.5) < 0.01)
  assert.equal(trackValue(track, 1000), 0.8)
  assert.equal(trackValue(track, 1500), 0.8) // Clamps past last keyframe
  assert.equal(trackValue(track, -100), 0.2) // Clamps before first keyframe

  // Sample times includes boundary and keyframe timestamps
  const motionDoc = { duration: 1000, tracks: [track] }
  const times = sampleTimes(motionDoc)
  assert.equal(times[0], 0)
  assert.equal(times.at(-1), 1000)
  assert.ok(times.includes(0))
  assert.ok(times.includes(1000))
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] > times[i - 1], 'Sample times must be strictly increasing')
  }
})

test('scene store motion document persistence, undo/redo, and pruning on element removal', () => {
  const store = fixture()
  const track1 = createTrack('rect1', 'x', 2000)
  const track2 = createTrack('circle1', 'y', 2000)
  const initialMotion = { duration: 2000, tracks: [track1, track2] }

  // Set motion on store
  store.setMotion(initialMotion, 'Add motion tracks')
  const snap = store.getSnapshot()
  assert.ok(snap.motion)
  assert.equal(snap.motion.tracks.length, 2)

  // Undo restores previous motion state
  store.undo()
  assert.equal(store.getSnapshot().motion, undefined)

  // Redo re-applies motion state
  store.redo()
  assert.equal(store.getSnapshot().motion?.tracks.length, 2)

  // Project serialization & round trip
  const json = store.toJSON()
  assert.ok(json.motion)
  assert.equal(json.motion.tracks.length, 2)

  const restoredStore = new SceneStore()
  restoredStore.load(json)
  assert.deepEqual(restoredStore.getSnapshot().motion, snap.motion)

  // Removing an element prunes associated motion tracks automatically
  store.remove('rect1')
  const afterRemove = store.getSnapshot()
  assert.equal(afterRemove.motion?.tracks.length, 1)
  assert.equal(afterRemove.motion?.tracks[0].elementId, 'circle1')

  // Pruning function directly
  const pruned = pruneMotion(initialMotion, { circle1: store.getSnapshot().elements.circle1 })
  assert.equal(pruned.tracks.length, 1)
  assert.equal(pruned.tracks[0].elementId, 'circle1')
})

test('collaboration replica tracks and synchronizes motion changes', () => {
  const store = fixture()
  const replica = new SceneReplica()
  const before = store.getSnapshot()

  const track = createTrack('rect1', 'rotation', 1500)
  store.setMotion({ duration: 1500, tracks: [track] })
  const after = store.getSnapshot()

  const changes = replica.change(before, after)
  assert.ok(changes.some(c => c.path[0] === 'motion'))
})

test('motion code export for Framer Motion and CSS keyframes', () => {
  const store = fixture()
  const elements = store.getSnapshot().elements
  const trackX = createTrack('rect1', 'x', 2000)
  const trackScale = createTrack('rect1', 'scale', 2000)
  const motionDoc = { duration: 2000, tracks: [trackX, trackScale] }

  // Empty state handling
  assert.ok(exportMotion(EMPTY_MOTION, elements, 'framer').includes('// Add an enabled motion track'))
  assert.ok(exportMotion(EMPTY_MOTION, elements, 'css').includes('/* Add an enabled motion track'))

  // Framer Motion export
  const framerCode = exportMotion(motionDoc, elements, 'framer')
  assert.ok(framerCode.includes('import { motion } from "framer-motion";'))
  assert.ok(framerCode.includes('export function MotionLayer1()'))
  assert.ok(framerCode.includes('initial='))
  assert.ok(framerCode.includes('animate='))
  assert.ok(framerCode.includes('transition='))
  assert.ok(framerCode.includes('"ease":"linear"'))

  // CSS keyframes export
  const cssCode = exportMotion(motionDoc, elements, 'css')
  assert.ok(cssCode.includes('.paper-motion-1'))
  assert.ok(cssCode.includes('@keyframes paper-motion-1'))
  assert.ok(cssCode.includes('translate:'))
  assert.ok(cssCode.includes('scale:'))
  assert.ok(cssCode.includes('@media (prefers-reduced-motion: reduce)'))
  assert.ok(cssCode.includes('0% {'))
  assert.ok(cssCode.includes('100% {'))
})
