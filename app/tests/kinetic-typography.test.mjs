import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from '../src/scene/elements.ts'
import { SceneStore } from '../src/scene/store.ts'
import { loadOutlineFont, shapeText, fontInstance } from '../src/scene/fontEngine.ts'
import { createBaseline, DEFAULT_KINETIC, cascadeOffset, placeGlyphs, glyphOutlines } from '../src/scene/kineticGeometry.ts'
import { parsePath } from '../src/scene/pathGeometry.ts'
import { sceneToSVG, exportBounds } from '../src/io/svg.ts'

const fontSource = `data:font/ttf;base64,${readFileSync(new URL('../public/fonts/InterVariable-latin.ttf', import.meta.url)).toString('base64')}`
const font = await loadOutlineFont(fontSource)
const text = (patch = {}) => createElement('text', { id: 'type', text: 'Paper', fontFamily: 'PaperInter', fontSource, width: 360, height: 120, ...patch })
const geometry = node => placeGlyphs(node, shapeText(font, node), font.unitsPerEm, 'M0 60 C80 0 240 120 360 60')

test('weight changes real glyph outlines and metrics, not a simulated stroke', () => {
  const light = shapeText(font, text({ variableAxes: { wght: 100 } })).lines[0]
  const black = shapeText(font, text({ variableAxes: { wght: 900 } })).lines[0]
  assert.notEqual(light.glyphs[0].d, black.glyphs[0].d)
  assert.notEqual(light.width, black.width)
  assert.equal(fontInstance(font, text({ variableAxes: { wght: 999 } })), fontInstance(font, text({ variableAxes: { wght: 900 } })))
})

test('all four requested axes clamp to font ranges, including automatic optical size', () => {
  const supported = { wght: { min: 100, max: 900 }, wdth: { min: 50, max: 150 }, slnt: { min: -12, max: 0 }, opsz: { min: 8, max: 72 } }
  let actual
  const fake = { variationAxes: supported, getVariation(axes) { actual = axes; return { unitsPerEm: 1000 } } }
  fontInstance(fake, text({ fontSize: 96, variableAxes: { wght: 999, wdth: 10, slnt: 20 } }))
  assert.deepEqual(actual, { wght: 900, opsz: 72, wdth: 50, slnt: 0 })
})

test('baseline sampling supports lines, curved tangents, arcs and zero-length curves', () => {
  const line = createBaseline('M0 0 L100 0')
  assert.equal(line.length, 100)
  assert.deepEqual(line.at(50), { x: 50, y: 0, angle: 0 })
  const curve = createBaseline('M0 0 C0 100 100 100 100 0')
  assert.ok(Math.abs(curve.length - 200) < .1)
  assert.ok(Math.abs(curve.at(curve.length / 2).x - 50) < .1)
  assert.ok(Math.abs(curve.at(curve.length / 2).y - 75) < .1)
  assert.ok(Math.abs(createBaseline('M0 0 A50 50 0 0 1 100 0').length - Math.PI * 50) < .2)
  assert.deepEqual(createBaseline('M0 0 L0 0').at(0), { x: 0, y: 0, angle: 0 })
})

test('centered glyphs follow curve normals and off-path glyphs are clipped', () => {
  const node = text({ textOnPath: { enabled: true, align: 'center', offset: 50 } })
  const glyphs = geometry(node)
  assert.equal(glyphs.length, 5)
  assert.ok(glyphs.some(glyph => Math.abs(glyph.angle) > 1))
  assert.equal(placeGlyphs(text({ textOnPath: { enabled: true, offset: 100 } }), shapeText(font, node), font.unitsPerEm, 'M0 0 L10 0').length, 0)
})

test('cascade offsets are deterministic, staggered and match animation quarter cycles', () => {
  const k = { ...DEFAULT_KINETIC, phase: .25, amplitude: 20, rotation: 10, stagger: 0 }
  assert.deepEqual(cascadeOffset(k, 0), { y: -20, angle: -10 })
  assert.deepEqual(cascadeOffset({ ...k, phase: .75 }, 0), { y: 20, angle: 10 })
  assert.notDeepEqual(cascadeOffset(DEFAULT_KINETIC, 0), cascadeOffset(DEFAULT_KINETIC, 1))
  assert.deepEqual(cascadeOffset({ ...k, enabled: false }, 1), { y: 0, angle: 0 })
})

test('outlines retain holes and bake phase into curved glyph geometry', () => {
  const node = text({ text: 'O', textOnPath: { enabled: true, align: 'center' } })
  const glyphs = geometry(node)
  const d = glyphOutlines(glyphs)
  const animated = glyphOutlines(glyphs, { ...DEFAULT_KINETIC, phase: .25 })
  assert.ok(parsePath(d).length >= 2, 'O must retain its inner contour')
  assert.notEqual(animated, d)
  assert.ok(parsePath(animated).every(contour => contour.closed))
})

test('conversion retains identity, nesting, transforms, paint order and one-step undo', () => {
  const store = new SceneStore()
  store.add('frame', { id: 'frame', rotation: 20 })
  store.add('rectangle', { id: 'before', parentId: 'frame' })
  store.add('text', { id: 'type', fontSource, text: 'Paper', parentId: 'frame', x: 30, y: 40, rotation: 15 })
  store.add('rectangle', { id: 'after', parentId: 'frame' })
  const before = store.getSnapshot().elements.type
  store.convertTextToOutlines('type', glyphOutlines(geometry(before)))
  const converted = store.getSnapshot().elements.type
  assert.equal(converted.type, 'path')
  for (const key of ['id', 'parentId', 'x', 'y', 'width', 'height', 'rotation', 'zIndex']) assert.equal(converted[key], before[key])
  assert.deepEqual(converted.style, before.style)
  assert.deepEqual(store.getSnapshot().elements.frame.children, ['before', 'type', 'after'])
  store.undo(); assert.equal(store.getSnapshot().elements.type.type, 'text')
  store.redo(); assert.equal(store.getSnapshot().elements.type.type, 'path')
})

test('settings are immutable, survive document round trips and reject invalid values', () => {
  const store = new SceneStore()
  store.add('text', { id: 'type', kinetic: DEFAULT_KINETIC })
  assert.ok(Object.isFrozen(store.getSnapshot().elements.type.kinetic))
  for (const patch of [{ duration: 0 }, { phase: 2 }, { stagger: -1 }, { amplitude: NaN }, { playing: 'yes' }]) assert.throws(() => store.update('type', 'text', { kinetic: { ...DEFAULT_KINETIC, ...patch } }))
  const roundtrip = new SceneStore()
  roundtrip.load(JSON.parse(JSON.stringify(store.toJSON())))
  assert.deepEqual(roundtrip.getSnapshot().elements.type.kinetic, DEFAULT_KINETIC)
})

test('SVG uses selected-phase outlines without clipping and reserves motion bounds', () => {
  const store = new SceneStore(); const node = store.add('text', { id: 'type', fontSource, text: 'Paper', kinetic: DEFAULT_KINETIC })
  const outlines = glyphOutlines(geometry(node), node.kinetic)
  const svg = sceneToSVG(store.getSnapshot(), { scope: 'canvas', scale: 1, background: 'transparent' }, { images: new Map(), shaders: new Map(), textOutlines: new Map([['type', outlines]]) })
  assert.match(svg, /fill-rule="nonzero"/)
  assert.doesNotMatch(svg, /<text\b|clip-path=/)
  const bounds = exportBounds(store.getSnapshot(), 'canvas')
  assert.ok(bounds.width > node.width && bounds.height > node.height)
})
