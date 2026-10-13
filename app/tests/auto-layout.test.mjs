import test from 'node:test'
import assert from 'node:assert/strict'
import { SceneStore } from '../src/scene/store.ts'
import { DEFAULT_AUTO_LAYOUT, reflowAutoLayout } from '../src/scene/autoLayout.ts'
import { buildCSSProps, buildTailwindClasses, buildReactComponent } from '../src/tokens/codegen.ts'
import { elementSchema, validateSchema, patchSchema } from '../src/mcp/schema.ts'
import { sceneToSVG } from '../src/io/svg.ts'
import { createProject } from '../src/io/project.ts'
import { mutateCanvas } from '../src/mcp/operations.ts'

const layout = (patch = {}) => ({ ...DEFAULT_AUTO_LAYOUT, padding: { top: 10, right: 20, bottom: 30, left: 40 }, gap: 12, ...patch })
const sizing = (width = 'fixed', height = 'fixed') => ({ width, height })
const node = (store, id) => store.getSnapshot().elements[id]
function scene(direction = 'horizontal') {
  const store = new SceneStore()
  store.add('frame', { id: 'frame', width: 400, height: 240, layout: layout({ direction }) })
  store.add('rectangle', { id: 'a', parentId: 'frame', width: 60, height: 40 })
  store.add('rectangle', { id: 'b', parentId: 'frame', width: 80, height: 60 })
  return store
}
const geometry = n => [n.x, n.y, n.width, n.height]

test('horizontal and vertical flow respect all four independent padding values', () => {
  const row = scene()
  assert.deepEqual(geometry(node(row, 'a')), [40, 10, 60, 40])
  assert.deepEqual(geometry(node(row, 'b')), [112, 10, 80, 60])
  const column = scene('vertical')
  assert.deepEqual(geometry(node(column, 'a')), [40, 10, 60, 40])
  assert.deepEqual(geometry(node(column, 'b')), [40, 62, 80, 60])
  column.update('frame', 'frame', { layout: layout({ direction: 'horizontal', gap: 0 }) })
  assert.equal(node(column, 'b').x, 100)
})

test('main alignment uses remaining space, and space-between retains a minimum gap', () => {
  const store = scene()
  for (const [justify, x1, x2] of [['start', 40, 112], ['center', 134, 206], ['end', 228, 300], ['space-between', 40, 300]]) {
    store.update('frame', 'frame', { layout: layout({ justify, align: 'end' }) })
    assert.equal(node(store, 'a').x, x1)
    assert.equal(node(store, 'b').x, x2)
    assert.equal(node(store, 'a').y, 170)
    assert.equal(node(store, 'b').y, 150)
  }
  store.update('frame', 'frame', { width: 150, layout: layout({ justify: 'space-between', align: 'center' }) })
  assert.equal(node(store, 'b').x, 112)
  assert.equal(node(store, 'a').y, 90)
  store.remove('b')
  assert.equal(node(store, 'a').x, 40)
})

test('fill siblings share available space and respond to parent resizing on both axes', () => {
  const store = scene()
  store.update('a', 'rectangle', { sizing: sizing('fill', 'fill') })
  store.update('b', 'rectangle', { sizing: sizing('fill', 'fixed') })
  assert.deepEqual(geometry(node(store, 'a')), [40, 10, 164, 200])
  assert.deepEqual(geometry(node(store, 'b')), [216, 10, 164, 60])
  store.update('frame', 'frame', { width: 600 })
  assert.equal(node(store, 'a').width, 264)
  store.update('frame', 'frame', { layout: layout({ direction: 'vertical' }) })
  assert.deepEqual(geometry(node(store, 'a')), [40, 10, 540, 128])
  assert.deepEqual(geometry(node(store, 'b')), [40, 150, 540, 60])
  store.update('b', 'rectangle', { sizing: sizing('fill', 'fill') })
  assert.equal(node(store, 'a').height, 94)
  assert.equal(node(store, 'b').height, 94)
})

test('hug wraps visible content, empty padding, and nested frames without iterative growth', () => {
  const store = scene()
  store.update('frame', 'frame', { sizing: sizing('hug', 'hug') })
  assert.deepEqual([node(store, 'frame').width, node(store, 'frame').height], [212, 100])
  store.add('frame', { id: 'outer', layout: layout({ direction: 'vertical' }), sizing: sizing('hug', 'hug') })
  store.reparent('frame', 'outer')
  assert.deepEqual([node(store, 'outer').width, node(store, 'outer').height], [272, 140])
  store.update('a', 'rectangle', { sizing: sizing('fill', 'fill') })
  const snapshot = store.getSnapshot()
  assert.equal(reflowAutoLayout(snapshot.elements, snapshot.rootIds), snapshot.elements)
  store.setVisible('b', false)
  assert.equal(node(store, 'frame').width, 120)
  assert.equal(node(store, 'outer').width, 180)
  assert.equal(node(store, 'b').width, 80)
  store.remove('a')
  assert.deepEqual([node(store, 'frame').width, node(store, 'frame').height], [60, 40])
})

test('nested fill width and hug height remeasure text when the frame narrows or content changes', () => {
  const store = new SceneStore()
  store.add('frame', { id: 'outer', width: 300, sizing: sizing('fixed', 'hug'), layout: layout({ direction: 'vertical', padding: { top: 0, right: 0, bottom: 0, left: 0 } }) })
  store.add('frame', { id: 'inner', parentId: 'outer', sizing: sizing('fill', 'hug'), layout: layout({ direction: 'vertical', padding: { top: 10, right: 10, bottom: 10, left: 10 } }) })
  store.add('text', { id: 'text', parentId: 'inner', fontSize: 20, letterSpacing: 0, lineHeight: 1.5, text: 'Words that flow across a responsive frame.', sizing: sizing('fill', 'hug') })
  const height = node(store, 'outer').height
  store.update('outer', 'frame', { width: 150 })
  assert.equal(node(store, 'inner').width, 150)
  assert.equal(node(store, 'text').width, 130)
  assert.ok(node(store, 'outer').height > height)
  assert.equal(node(store, 'outer').height, node(store, 'text').height + 20)
  store.update('text', 'text', { text: 'Hi' })
  assert.equal(node(store, 'text').height, 30)
  assert.equal(node(store, 'outer').height, 50)
  store.update('text', 'text', { sizing: sizing('hug', 'hug'), text: 'Hi\nThere' })
  assert.equal(node(store, 'text').width, 60)
  assert.equal(node(store, 'text').height, 60)
})

test('reorder, reparent, visibility, deletion, tokens, and locked siblings all reflow atomically', () => {
  const store = scene()
  store.clearHistory()
  let calls = 0
  store.subscribe(() => calls++)
  store.setLocked('b', true)
  store.update('a', 'rectangle', { width: 120 })
  assert.equal(node(store, 'b').x, 172)
  assert.equal(calls, 2)
  store.undo()
  assert.equal(node(store, 'b').x, 112)
  store.redo()
  assert.equal(node(store, 'b').x, 172)
  store.setLocked('b', false)
  store.reorder('b', 0)
  assert.equal(node(store, 'b').x, 40)
  assert.equal(node(store, 'a').x, 132)
  store.setVisible('b', false)
  assert.equal(node(store, 'a').x, 40)
  store.reparent('a', null)
  store.reparent('a', 'frame')
  const token = store.addToken({ type: 'container', name: 'card', value: 60 })
  store.bindToken('a', 'width', token.id)
  store.setVisible('b', true)
  store.updateToken(token.id, { value: 100 })
  assert.equal(node(store, 'a').width, 100)
  store.remove('b')
  assert.equal(node(store, 'a').x, 40)
})

test('layout settings and resulting geometry survive undo/redo, gestures, JSON and MCP validation', () => {
  const store = scene()
  const before = store.toJSON()
  store.beginTransaction('Adjust spacing')
  for (const gap of [20, 30, 40]) store.update('frame', 'frame', { layout: layout({ gap }) })
  store.endTransaction()
  const after = store.toJSON()
  store.undo()
  assert.deepEqual(store.toJSON(), before)
  store.redo()
  assert.deepEqual(store.toJSON(), after)
  store.beginTransaction('Spacing')
  store.update('frame', 'frame', { layout: layout({ gap: 50 }) })
  store.cancelTransaction()
  assert.deepEqual(store.toJSON(), after)
  const restored = new SceneStore()
  restored.load(JSON.parse(JSON.stringify(after)))
  assert.deepEqual(restored.toJSON(), after)
  validateSchema(node(store, 'frame'), elementSchema)
  validateSchema({ layout: layout(), sizing: sizing('hug', 'fill') }, patchSchema('frame'))
  assert.ok(Object.isFrozen(node(store, 'frame').layout.padding))
  const legacy = new SceneStore()
  legacy.add('frame', { id: 'legacy' })
  validateSchema(node(legacy, 'legacy'), elementSchema)
})

test('invalid layout or sizing inputs reject atomically; exhausted fills remain finite', () => {
  const store = scene()
  const before = store.getSnapshot()
  for (const patch of [{ layout: layout({ gap: -1 }) }, { layout: layout({ direction: 'diagonal' }) }, { layout: layout({ justify: 'stretch' }) }, { layout: layout({ align: 'space-between' }) }, { layout: layout({ padding: { top: 0 } }) }, { layout: layout({ padding: { top: NaN, right: 0, bottom: 0, left: 0 } }) }, { sizing: sizing('bad') }, { sizing: null }]) {
    assert.throws(() => store.update('frame', 'frame', patch), /Invalid/)
    assert.equal(store.getSnapshot(), before)
  }
  store.update('frame', 'frame', { width: 70 })
  store.update('a', 'rectangle', { sizing: sizing('fill', 'fixed') })
  assert.equal(node(store, 'a').width, .01)
  assert.ok(Number.isFinite(node(store, 'b').x))
})

test('explicit resizing converts the resized axis to fixed, and removing layout retains positions', () => {
  const store = scene()
  store.update('a', 'rectangle', { sizing: sizing('fill', 'fill') })
  store.update('a', 'rectangle', { width: 150 })
  assert.deepEqual(node(store, 'a').sizing, sizing('fixed', 'fill'))
  const b = node(store, 'b')
  store.update('frame', 'frame', { layout: null })
  store.update('a', 'rectangle', { width: 180 })
  assert.equal(node(store, 'b'), b)
})

test('handoff generates flex settings, relative children, hug and fill rules; SVG uses resolved geometry', () => {
  const store = scene()
  store.update('frame', 'frame', { layout: layout({ justify: 'space-between', align: 'center' }) })
  store.update('a', 'rectangle', { sizing: sizing('fill', 'fill') })
  const frame = node(store, 'frame'), child = node(store, 'a')
  const css = Object.fromEntries(buildCSSProps(frame).map(p => [p.property, p.value]))
  assert.equal(css.display, 'flex')
  assert.equal(css.padding, '10px 20px 30px 40px')
  assert.equal(css['justify-content'], 'space-between')
  const childCSS = Object.fromEntries(buildCSSProps(child, [], frame).map(p => [p.property, p.value]))
  assert.equal(childCSS.position, 'relative')
  assert.equal(childCSS.flex, '1 1 0px')
  assert.equal(childCSS.height, '100%')
  assert.equal(childCSS.left, undefined)
  assert.match(buildTailwindClasses(frame), /flex-row/)
  assert.match(buildReactComponent(child, [], frame), /flex-1/)
  assert.doesNotMatch(buildReactComponent(child, [], frame), /left:|width:|height:/)
  assert.match(sceneToSVG(store.getSnapshot(), { scope: 'canvas', scale: 1, background: null }), /translate\(40 10\)/)
})


test('MCP frame creation retains layout and sizing, and integration edits reflow children', () => {
  const empty = createProject(new SceneStore(), 'Layout study', { x: 0, y: 0, zoom: 1 }, true)
  const created = mutateCanvas(empty, 'create_frame', { id: 'row', layout: layout(), sizing: sizing('fixed', 'hug'), width: 400 })
  assert.deepEqual(created.element.layout, layout())
  assert.equal(created.element.height, 40)
  const child = mutateCanvas(created.project, 'add_shader_shape', { id: 'child', parentId: 'row', shader_kind: 'mesh-gradient', sizing: sizing('fill', 'fixed') })
  assert.equal(child.element.width, 340)
  assert.equal(child.element.x, 40)
  const changed = mutateCanvas(child.project, 'update_element', { element_id: 'row', patch: { width: 600 } })
  assert.equal(changed.project.scene.elements.child.width, 540)
  assert.equal(changed.project.scene.elements.row.height, 160)
})

test('switching to derived sizing detaches dimension tokens, preserving unrelated bindings', () => {
  const store = scene()
  const width = store.addToken({ type: 'container', name: 'wide', value: 160 })
  const color = store.addToken({ type: 'color', name: 'ink', value: '#080808' })
  store.bindToken('a', 'width', width.id)
  store.bindToken('a', 'fill', color.id)
  store.update('a', 'rectangle', { sizing: sizing('fill', 'fixed') })
  assert.equal(node(store, 'a').tokenBindings.width, undefined)
  assert.equal(node(store, 'a').tokenBindings.fill, color.id)
  store.updateToken(width.id, { value: 200 })
  assert.equal(node(store, 'a').width, 248)
  store.undo()
  store.undo()
  assert.equal(node(store, 'a').tokenBindings.width, width.id)
})

test('overflowing layout arithmetic rejects without publishing a partially reflowed scene', () => {
  const store = scene()
  const before = store.getSnapshot()
  assert.throws(() => store.update('frame', 'frame', { sizing: sizing('hug', 'hug'), layout: layout({ padding: { top: 0, right: 1e308, bottom: 0, left: 1e308 } }) }), /Invalid/)
  assert.equal(store.getSnapshot(), before)
})
