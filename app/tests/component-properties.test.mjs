import test from 'node:test'
import assert from 'node:assert/strict'
import { SceneStore } from '../src/scene/store.ts'
import { subtree } from '../src/scene/components.ts'
import { foundationTokens } from '../src/tokens/foundation.ts'
import { buildCSSProps, buildTailwindClasses } from '../src/tokens/codegen.ts'

function setup() {
  const store = new SceneStore()
  store.add('frame', { id: 'button', width: 240, height: 120 })
  store.add('text', { id: 'label', parentId: 'button', text: 'Continue' })
  store.add('ellipse', { id: 'icon', parentId: 'button', width: 16, height: 16 })
  store.createComponent('button')
  const definitions = [
    { id: 'tone', name: 'Tone', kind: 'variant', defaultValue: 'Default', options: [{ value: 'Default', layers: {} }, { value: 'Accent', layers: { button: { style: { fill: '#81adec' } }, label: { properties: { fontWeight: 600 } } } }] },
    { id: 'copy', name: 'Label', kind: 'text', sourceId: 'label', defaultValue: 'Continue' },
    { id: 'show-icon', name: 'Show icon', kind: 'boolean', sourceId: 'icon', defaultValue: true },
  ]
  store.setComponentProperties('button', definitions)
  const instance = store.createComponentInstance('button')
  const layer = sourceId => subtree(store.getSnapshot().elements, instance.id).find(node => node.component.sourceId === sourceId)
  return { store, instance, layer, definitions }
}
function roundtrip(store) {
  const restored = new SceneStore()
  restored.load(JSON.parse(JSON.stringify(store.toJSON())))
  assert.deepEqual(restored.toJSON(), store.toJSON())
}

test('variant, text and visibility switches compose without changing the master; local edits win', () => {
  const { store, instance, layer } = setup()
  const untouched = store.add('rectangle', { id: 'unrelated' })
  store.setComponentProperty(instance.id, 'tone', 'Accent')
  store.setComponentProperty(layer('label').id, 'copy', '')
  store.setComponentProperty(instance.id, 'show-icon', false)
  assert.equal(layer('button').style.fill, '#81adec')
  assert.equal(layer('label').text, '')
  assert.equal(layer('label').fontWeight, 600)
  assert.equal(layer('icon').visible, false)
  assert.equal(store.getSnapshot().elements.icon.visible, true)
  assert.equal(store.getSnapshot().elements.unrelated, untouched)
  store.update(layer('label').id, 'text', { text: 'Local' })
  store.setComponentProperty(instance.id, 'copy', 'Configured')
  assert.equal(layer('label').text, 'Local')
  store.resetComponentOverrides(layer('label').id)
  assert.equal(layer('label').text, 'Configured')
  roundtrip(store)
})

test('property defaults propagate while local values persist; root reset, undo and detach are complete', () => {
  const { store, instance, layer, definitions } = setup()
  store.setComponentProperty(instance.id, 'copy', 'Local label')
  store.setComponentProperties('button', definitions.map(property => property.id === 'copy' ? { ...property, defaultValue: 'New default' } : property))
  assert.equal(layer('label').text, 'Local label')
  store.setComponentProperty(instance.id, 'copy', null)
  assert.equal(layer('label').text, 'New default')
  store.setComponentProperty(instance.id, 'tone', 'Accent')
  store.setComponentProperty(instance.id, 'show-icon', false)
  store.clearHistory()
  store.resetComponentOverrides(instance.id)
  assert.equal(layer('icon').visible, true)
  assert.deepEqual(layer('button').component.propertyValues, {})
  store.undo()
  assert.equal(layer('icon').visible, false)
  assert.equal(layer('button').style.fill, '#81adec')
  roundtrip(store)
  const root = layer('button')
  store.detachComponentInstance(instance.id)
  assert.equal(store.getSnapshot().elements[root.id].component, undefined)
  assert.equal(store.getSnapshot().elements[root.id].style.fill, '#81adec')
})

test('invalid definitions and inactive variants are rejected atomically; removed layers release definitions', () => {
  const { store, instance, definitions } = setup()
  const before = store.getSnapshot()
  assert.throws(() => store.setComponentProperty(instance.id, 'tone', 'Unknown'))
  assert.throws(() => store.setComponentProperty(instance.id, 'show-icon', 'false'))
  assert.throws(() => store.setComponentProperties('button', [...definitions, { id: 'bad', name: 'Bad', kind: 'text', sourceId: 'icon', defaultValue: 'x' }]))
  assert.throws(() => store.setComponentProperties('button', [{ ...definitions[0], options: [{ value: 'Default', layers: {} }, { value: 'Bad', layers: { button: { properties: { width: -1 } } } }] }]))
  assert.equal(store.getSnapshot(), before)
  const corrupt = structuredClone(store.toJSON())
  corrupt.elements[instance.id].component.propertyValues = { tone: 'Unknown' }
  assert.throws(() => new SceneStore().load(corrupt))
  store.setComponentProperty(instance.id, 'show-icon', false)
  store.remove('icon')
  assert.equal(store.getSnapshot().elements.button.component.properties.some(property => property.id === 'show-icon'), false)
  assert.equal(Object.hasOwn(store.getSnapshot().elements[instance.id].component.propertyValues, 'show-icon'), false)
  roundtrip(store)
})

test('semantic colors, type scales and elevation aliases synchronize variants through themes and deletion', () => {
  const { store, instance, layer, definitions } = setup()
  store.addTokens(foundationTokens(store.getSnapshot().tokens))
  assert.equal(foundationTokens(store.getSnapshot().tokens).length, 0)
  const token = name => store.getSnapshot().tokens.find(token => token.name === name)
  store.bindToken('label', 'fontSize', token('body').id)
  store.bindToken('button', 'shadow', token('raised').id)
  const accent = { ...definitions[0], options: [{ value: 'Default', layers: {} }, { value: 'Accent', layers: { button: { tokenBindings: { fill: token('action').id } } } }] }
  store.setComponentProperties('button', [accent, ...definitions.slice(1)])
  store.setComponentProperty(instance.id, 'tone', 'Accent')
  store.updateToken(token('blue').id, { value: '#222222' })
  store.updateToken(token('body').id, { value: 20 })
  store.updateToken(token('raised').id, { value: 8 })
  assert.equal(layer('button').style.fill, '#222222')
  assert.equal(layer('label').fontSize, 20)
  assert.deepEqual(layer('button').style.shadow, { x: 0, y: 8, blur: 16, color: '#08080826' })
  const night = store.addTheme('Night')
  store.setTokenThemeValue(token('raised').id, night, 12)
  store.setActiveTheme(night)
  assert.equal(layer('button').style.shadow.y, 12)
  assert.match(buildCSSProps(layer('button'), store.getSnapshot().tokens).find(prop => prop.property === 'box-shadow').value, /var\(--elevation-raised\)/)
  assert.match(buildTailwindClasses(layer('button'), store.getSnapshot().tokens), /--elevation-raised/)
  roundtrip(store)
  store.removeTokens([token('action').id, token('raised').id])
  assert.equal(layer('button').style.fill, '#222222')
  assert.equal(layer('button').style.shadow.y, 12)
  store.setComponentProperty(instance.id, 'tone', 'Default')
  store.setComponentProperty(instance.id, 'tone', 'Accent')
  assert.equal(layer('button').style.fill, '#222222')
  roundtrip(store)
})

test('elevation edits release only the shadow binding, and zero remains linked in handoff', () => {
  const { store, instance, layer } = setup()
  const elevation = store.addToken({ type: 'elevation', name: 'raised', value: 4 })
  store.bindToken('button', 'shadow', elevation.id)
  store.update(layer('button').id, 'frame', { style: { shadow: { x: 1, y: 2, blur: 3, color: '#08080833' } } })
  store.updateToken(elevation.id, { value: 10 })
  assert.equal(layer('button').style.shadow.y, 2)
  assert.equal(layer('button').tokenBindings.shadow, undefined)
  store.resetComponentOverrides(instance.id)
  assert.equal(layer('button').style.shadow.y, 10)
  store.updateToken(elevation.id, { value: 0 })
  assert.equal(layer('button').style.shadow, null)
  assert.match(buildCSSProps(layer('button'), store.getSnapshot().tokens).find(prop => prop.property === 'box-shadow').value, /--elevation-raised/)
  roundtrip(store)
})

test('component documents and zero elevation satisfy the published project schema', async () => {
  const { projectSchema, validateSchema } = await import('../src/mcp/schema.ts')
  const { createProject } = await import('../src/io/project.ts')
  const { store, instance } = setup()
  store.addToken({ type: 'elevation', name: 'flat', value: 0 })
  store.setComponentProperty(instance.id, 'copy', '')
  validateSchema(createProject(store, 'Components', { x: 0, y: 0, zoom: 1 }, true), projectSchema)
})

test('deleting a shared style materializes inactive variants before releasing their links', () => {
  const { store, instance, layer, definitions } = setup()
  const style = store.addSharedStyle({ kind: 'color', name: 'Dark surface', value: '#222222' })
  store.setComponentProperties('button', [{ ...definitions[0], options: [{ value: 'Default', layers: {} }, { value: 'Accent', layers: { button: { sharedStyleBindings: { color: style.id } } } }] }, ...definitions.slice(1)])
  store.removeSharedStyle(style.id)
  store.setComponentProperty(instance.id, 'tone', 'Accent')
  assert.equal(layer('button').style.fill, '#222222')
  roundtrip(store)
})

test('generated elevation handoff compiles through Tailwind', async () => {
  const { compile } = await import('tailwindcss')
  const { tokensToCSS } = await import('../src/tokens/model.ts')
  const { store, layer } = setup()
  const token = store.addToken({ type: 'elevation', name: 'raised', value: 4 })
  store.bindToken('button', 'shadow', token.id)
  const compiler = await compile(`${tokensToCSS(store.getSnapshot().tokens, true)}\n@tailwind utilities;`)
  const css = compiler.build(buildTailwindClasses(layer('button'), store.getSnapshot().tokens).split(' '))
  assert.match(css, /var\(--elevation-raised\)/)
  assert.match(css, /--tw-shadow:/)
})
