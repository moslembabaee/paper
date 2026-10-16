import test from 'node:test'
import assert from 'node:assert/strict'
import { SceneStore } from '../src/scene/store.ts'
import { createShader, validateShader } from '../src/shaders/catalog.ts'
import { createDefaultPostProcessing, POST_PROCESSING_PRESETS } from '../src/canvas/postprocessing/presets.ts'
import { createPostProcessPass, validatePostProcessing } from '../src/canvas/postprocessing/model.ts'

test('all finishing presets validate, persist, own their parameters and survive undo/redo', () => {
  for (const preset of Object.keys(POST_PROCESSING_PRESETS)) {
    const pipeline = createDefaultPostProcessing(preset)
    validatePostProcessing(pipeline)
    const store = new SceneStore()
    store.add('rectangle', { id: 'shape' })
    const paint = { ...createShader('mesh-gradient'), postProcessing: pipeline }
    store.update('shape', 'rectangle', { style: { shader: paint } })
    pipeline.passes[0].params.intensity = 0
    const saved = store.getSnapshot().elements.shape.style.shader
    assert.notEqual(saved.postProcessing.passes[0].params.intensity, 0)
    assert.ok(Object.isFrozen(saved.postProcessing.passes[0].params))
    const document = JSON.parse(JSON.stringify(store.toJSON()))
    const restored = new SceneStore()
    restored.load(document)
    assert.deepEqual(restored.toJSON(), document)
    store.undo()
    assert.equal(store.getSnapshot().elements.shape.style.shader, null)
    store.redo()
    assert.deepEqual(store.getSnapshot().elements.shape.style.shader, saved)
  }
})

test('malformed stacks reject atomically, including pass limits, ranges and discriminants', () => {
  const store = new SceneStore()
  store.setBackgroundShader(createShader('mesh-gradient'))
  const before = store.getSnapshot()
  const valid = createDefaultPostProcessing()
  const bad = [null, {}, { ...valid, version: 2 }, { ...valid, enabled: 'yes' },
    { ...valid, passes: Array.from({ length: 9 }, () => createPostProcessPass('bloom')) },
    { ...valid, passes: [valid.passes[0], valid.passes[0]] }]
  for (const changes of [{ type: 'unknown' }, { opacity: NaN }, { opacity: '1' }, { opacity: 2 }, { enabled: 1 }, { blendMode: 'unknown' }, { params: { ...valid.passes[0].params, threshold: -1 } }, { params: {} }]) bad.push({ ...valid, passes: [{ ...valid.passes[0], ...changes }] })
  for (const postProcessing of bad) {
    const shader = { ...createShader('mesh-gradient'), postProcessing }
    assert.throws(() => store.setBackgroundShader(shader), /Invalid shader post-processing/)
    assert.equal(store.getSnapshot(), before)
  }
  validateShader(createShader('mesh-gradient')) // Legacy documents have no stack.
  const passes = ['bloom', 'film-grain', 'vignette', 'chromatic-aberration', 'color-grade'].map(createPostProcessPass)
  validatePostProcessing({ version: 1, enabled: true, preset: 'custom', passes })
})
