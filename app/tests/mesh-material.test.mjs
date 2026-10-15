import test from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { SceneStore } from '../src/scene/store.ts'
import { createShader, freezeShader, updateShaderParameter, validateShader } from '../src/shaders/catalog.ts'
import { meshToSurface, surfaceToMesh, meshUniforms } from '../src/shaders/mesh.ts'
import { exportMeshReact } from '../src/shaders/shaderExport.ts'
import { createProject } from '../src/io/project.ts'
import { mutateCanvas } from '../src/mcp/operations.ts'
import { projectSchema, shaderSchema, validateSchema } from '../src/mcp/schema.ts'

const clone = value => JSON.parse(JSON.stringify(value))

test('mesh edits are deeply owned, persisted, and undone as one gesture', () => {
  const store = new SceneStore()
  const input = clone(createShader('mesh-gradient'))
  store.add('rectangle', { id: 'mesh', style: { shader: input } })
  store.setBackgroundShader(input)
  input.mesh.anchors[0].x = 1
  const original = store.getSnapshot().elements.mesh.style.shader
  assert.equal(original.mesh.anchors[0].x, .5)
  assert.ok(Object.isFrozen(original.mesh.anchors[0]))
  assert.ok(Object.isFrozen(store.getSnapshot().backgroundShader.mesh.anchors))
  store.beginTransaction('Drag mesh anchor')
  for (const x of [.6, .7, .8]) store.update('mesh', 'rectangle', { style: { shader: { ...original, mesh: { ...original.mesh, turbulence: .6, chromaticAberration: .4, grainBlend: 'screen', anchors: original.mesh.anchors.map((a, i) => i === 0 ? { ...a, x } : a) } } } })
  const saved = clone(store.toJSON())
  store.endTransaction()
  store.undo()
  assert.deepEqual(store.getSnapshot().elements.mesh.style.shader, original)
  store.redo()
  assert.deepEqual(clone(store.toJSON()), saved)
  const restored = new SceneStore()
  restored.load(saved)
  assert.deepEqual(clone(restored.toJSON()), saved)
  store.beginTransaction('Cancel drag')
  store.update('mesh', 'rectangle', { style: { shader: original } })
  store.cancelTransaction()
  assert.deepEqual(clone(store.toJSON()), saved)
})

test('malformed mesh materials reject atomically and old meshes still load', () => {
  const store = new SceneStore()
  const paint = createShader('mesh-gradient')
  const before = store.getSnapshot()
  for (const changes of [{ anchors: [] }, { anchors: [null, ...paint.mesh.anchors.slice(1)] }, { anchors: paint.mesh.anchors.map(a => ({ ...a, x: NaN })) }, { anchors: paint.mesh.anchors.map(a => ({ ...a, radius: 0 })) }, { turbulence: Infinity }, { frequency: 0 }, { chromaticAberration: 2 }, { grainBlend: 'invalid' }, { extra: true }]) {
    assert.throws(() => store.setBackgroundShader({ ...paint, mesh: { ...paint.mesh, ...changes } }), /Invalid shader mesh/)
    assert.equal(store.getSnapshot(), before)
  }
  assert.throws(() => validateShader({ ...createShader('perlin-noise'), mesh: paint.mesh }), /Invalid shader mesh/)
  const legacy = clone(paint)
  delete legacy.mesh
  validateShader(legacy)
  store.setBackgroundShader(legacy)
  assert.equal(store.getSnapshot().backgroundShader.mesh, undefined)
})

test('palette edits retain existing anchor placement and allocate new stops', () => {
  const paint = createShader('mesh-gradient')
  const next = updateShaderParameter(paint, 'colors', [...paint.params.colors, '#12345680'])
  assert.equal(next.mesh.anchors.length, 5)
  assert.deepEqual(next.mesh.anchors.slice(0, 4), paint.mesh.anchors)
  assert.equal(meshUniforms(next).u_colors[4][3], 128 / 255)
  validateShader(updateShaderParameter(next, 'colors', next.params.colors.slice(0, 2)))
  assert.ok(Object.isFrozen(freezeShader(next).mesh.anchors[4]))
})

test('code bridge accepts mesh documents and custom palettes without losing anchor data', () => {
  const project = createProject(new SceneStore(), 'Mesh studio', { x: 0, y: 0, zoom: 1 }, true)
  const created = mutateCanvas(project, 'add_shader_shape', { id: 'material', shader_kind: 'mesh-gradient', params: { colors: ['#81adec', '#edebe180'] } })
  const paint = created.element.style.shader
  assert.equal(paint.mesh.anchors.length, 2)
  validateSchema(created.project, projectSchema)
  const edited = { ...paint, mesh: { ...paint.mesh, chromaticAberration: .8, grainBlend: 'soft-light', anchors: paint.mesh.anchors.map(a => ({ ...a, x: .8 })) } }
  const updated = mutateCanvas(created.project, 'update_element', { element_id: 'material', patch: { style: { shader: edited } } })
  validateSchema(updated.project, projectSchema)
  assert.deepEqual(updated.element.style.shader.mesh, edited.mesh)
  const legacy = clone(paint)
  delete legacy.mesh
  validateSchema(legacy, shaderSchema)
  assert.throws(() => validateSchema({ ...edited, mesh: { ...edited.mesh, grainBlend: 'invalid' } }, shaderSchema))
  assert.throws(() => validateSchema({ ...createShader('neuro-noise'), mesh: edited.mesh }, shaderSchema))
})

test('anchor transforms invert material scale, rotation and offset', () => {
  const paint = { ...createShader('mesh-gradient'), rotation: 127, scale: 1.7, offsetX: .1, offsetY: -.2 }
  for (const anchor of paint.mesh.anchors) {
    const point = surfaceToMesh(meshToSurface(anchor, paint), paint)
    assert.ok(Math.abs(anchor.x - point.x) < 1e-12)
    assert.ok(Math.abs(anchor.y - point.y) < 1e-12)
  }
  assert.deepEqual(surfaceToMesh({ x: -100, y: 100 }, { ...paint, rotation: 0 }), { x: 0, y: 1 })
})

test('React export is self-contained, typechecks, and preserves current material uniforms', () => {
  const paint = { ...createShader('mesh-gradient'), animated: false, frame: 42000, composite: { blendMode: 'multiply', opacity: .4 } }
  const source = exportMeshReact(paint)
  assert.match(source, /speed=\{0\}/)
  assert.match(source, /frame=\{42000\}/)
  assert.match(source, /"mixBlendMode":"multiply"/)
  assert.match(source, /"u_anchors"/)
  assert.doesNotMatch(source, /from ['"]\.\//)
  const filename = `${process.cwd()}/PaperMaterial.tsx`
  const options = { noEmit: true, strict: true, skipLibCheck: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2023 }
  const host = ts.createCompilerHost(options)
  const read = host.readFile.bind(host), exists = host.fileExists.bind(host)
  host.readFile = name => name === filename ? source : read(name)
  host.fileExists = name => name === filename || exists(name)
  const program = ts.createProgram([filename], options, host)
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [])
})
