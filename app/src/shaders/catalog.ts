import type { ShaderControl, ShaderDefinition, ShaderKind, ShaderMotion, ShaderPaint, ShaderValue } from './types.ts'
import { shaderBlendModes } from './types.ts'

const number = (key: string, label: string, min = 0, max = 1, step = .01, integer = false): Extract<ShaderControl, { type: 'number' }> => ({ key, label, type: 'number', min, max, step, integer })
const color = (key: string, label: string): ShaderControl => ({ key, label, type: 'color' })
const palette = (max: number): ShaderControl => ({ key: 'colors', label: 'Palette', type: 'palette', max })
const select = (key: string, label: string, options: readonly string[]): ShaderControl => ({ key, label, type: 'select', options })
const colors = ['#edebe1', '#81adec', '#516b94', '#222222']

export const shaderCatalog = {
  'mesh-gradient': {
    label: 'Mesh Gradient', description: 'Soft color, in constant conversation.',
    defaults: { colors, distortion: .65, swirl: .25, grainMixer: .08, grainOverlay: .04 },
    controls: [palette(10), number('distortion', 'Distortion'), number('swirl', 'Swirl'), number('grainMixer', 'Grain mixer'), number('grainOverlay', 'Grain overlay')],
  },
  'dot-orbit': {
    label: 'Dot Orbit', description: 'Little worlds, moving in their own way.',
    defaults: { colors: ['#81adec', '#222222', '#a5b4c8'], colorBack: '#edebe1', size: .3, sizeRange: .4, spreading: .6, stepsPerColor: 1 },
    controls: [palette(10), color('colorBack', 'Background'), number('size', 'Dot size'), number('sizeRange', 'Size variation'), number('spreading', 'Orbit spread'), number('stepsPerColor', 'Color steps', 1, 4, 1, true)],
  },
  'grain-gradient': {
    label: 'Grain Gradient', description: 'A little texture. A softer edge.',
    defaults: { colors, colorBack: '#222222', softness: .55, intensity: .45, noise: .2, shape: 'corners' },
    controls: [palette(7), color('colorBack', 'Background'), number('softness', 'Softness'), number('intensity', 'Intensity'), number('noise', 'Grain'), select('shape', 'Pattern', ['wave', 'dots', 'truchet', 'corners', 'ripple', 'blob', 'sphere'])],
  },
  'halftone-cmyk': {
    label: 'Halftone CMYK', description: 'Four inks. Endless possibilities.',
    defaults: { image: '/shader-source.svg', colorBack: '#edebe1', colorC: '#81adec', colorM: '#db7d98', colorY: '#e8c873', colorK: '#222222', size: .2, gridNoise: .15, type: 'ink', softness: .5, contrast: 1, floodC: .1, floodM: 0, floodY: 0, floodK: 0, gainC: .2, gainM: 0, gainY: .1, gainK: 0, grainMixer: .05, grainOverlay: .03, grainSize: .5 },
    controls: [{ key: 'image', label: 'Source image', type: 'image' }, color('colorBack', 'Paper'), color('colorC', 'Cyan'), color('colorM', 'Magenta'), color('colorY', 'Yellow'), color('colorK', 'Black'), number('size', 'Dot size'), select('type', 'Dot style', ['dots', 'ink', 'sharp']), number('gridNoise', 'Grid noise'), number('softness', 'Softness'), number('contrast', 'Contrast', 0, 2), ...['C', 'M', 'Y', 'K'].flatMap(ink => [number(`flood${ink}`, `${ink} flood`), number(`gain${ink}`, `${ink} gain`, -1, 1)]), number('grainMixer', 'Grain mixer'), number('grainOverlay', 'Grain overlay'), number('grainSize', 'Grain size')],
  },
  'neuro-noise': {
    label: 'Neuro Noise', description: 'An organic network of light and motion.',
    defaults: { colorFront: '#edebe1', colorMid: '#81adec', colorBack: '#080808', brightness: .1, contrast: .35 },
    controls: [color('colorFront', 'Highlight'), color('colorMid', 'Midtone'), color('colorBack', 'Background'), number('brightness', 'Brightness'), number('contrast', 'Contrast')],
  },
  gooey: {
    label: 'Gooey / Metaballs', description: 'Fluid forms that find each other.',
    defaults: { colors: ['#81adec', '#edebe1', '#516b94'], colorBack: '#222222', count: 6, size: .5 },
    controls: [palette(8), color('colorBack', 'Background'), number('count', 'Ball count', 1, 20, 1, true), number('size', 'Ball size')],
  },
  dithering: {
    label: 'Dithering', description: 'A study in pixels, pattern and ink.',
    defaults: { colorBack: '#edebe1', colorFront: '#222222', shape: 'simplex', type: '4x4', size: 2 },
    controls: [color('colorFront', 'Ink'), color('colorBack', 'Paper'), select('shape', 'Pattern', ['simplex', 'warp', 'dots', 'wave', 'ripple', 'swirl', 'sphere']), select('type', 'Dither', ['random', '2x2', '4x4', '8x8']), number('size', 'Pixel size', .5, 20, .5)],
  },
  'perlin-noise': {
    label: 'Perlin Noise', description: 'Layered noise, from soft clouds to fine detail.',
    defaults: { colorFront: '#81adec', colorBack: '#222222', proportion: .5, softness: .65, octaveCount: 3, persistence: .55, lacunarity: 2 },
    controls: [color('colorFront', 'Foreground'), color('colorBack', 'Background'), number('proportion', 'Distribution'), number('softness', 'Softness'), number('octaveCount', 'Octaves', 1, 8, 1, true), number('persistence', 'Roughness', .3, 1), number('lacunarity', 'Frequency step', 1.5, 10, .1)],
  },
  'liquid-distortion': {
    label: 'Liquid Distortion', description: 'Noise and layered swirls turn color into flowing ink.',
    defaults: { colors, proportion: .5, softness: .7, shape: 'stripes', shapeScale: .35, distortion: .45, swirl: .65, swirlIterations: 6 },
    controls: [palette(10), select('shape', 'Pattern', ['checks', 'stripes', 'edge']), number('shapeScale', 'Pattern scale'), number('distortion', 'Distortion'), number('swirl', 'Swirl'), number('swirlIterations', 'Swirl passes', 2, 20, 1, true), number('proportion', 'Distribution'), number('softness', 'Softness')],
  },
  'glass-refraction': {
    label: 'Glass Refraction', description: 'Refract a source image through sculpted glass.',
    defaults: { image: '/shader-source.svg', colorBack: '#edebe1', colorShadow: '#222222', colorHighlight: '#edebe1', shadows: .25, highlights: .25, size: .5, angle: 0, distortion: .55, distortionShape: 'lens', shape: 'lines', shift: 0, stretch: .1, blur: .08, edges: .25, marginLeft: 0, marginRight: 0, marginTop: 0, marginBottom: 0, grainMixer: .02, grainOverlay: .02 },
    controls: [{ key: 'image', label: 'Source image', type: 'image' }, color('colorBack', 'Background'), color('colorShadow', 'Shadow tint'), color('colorHighlight', 'Highlight tint'), select('distortionShape', 'Refraction', ['prism', 'lens', 'contour', 'cascade', 'flat']), select('shape', 'Glass pattern', ['lines', 'linesIrregular', 'wave', 'zigzag', 'pattern']), number('size', 'Rib size'), number('angle', 'Rib angle', 0, 180, 1), number('distortion', 'Refraction strength'), number('shift', 'Image shift', -1, 1), number('stretch', 'Stretch'), number('blur', 'Frosting'), number('edges', 'Edge softness'), number('shadows', 'Shadows'), number('highlights', 'Highlights'), ...['Left', 'Right', 'Top', 'Bottom'].map(side => number(`margin${side}`, `${side} margin`)), number('grainMixer', 'Grain mixer'), number('grainOverlay', 'Grain overlay')],
  },
} satisfies { [K in ShaderKind]: ShaderDefinition<K> }

export const shaderKinds = Object.keys(shaderCatalog) as ShaderKind[]
export const motionControls = [number('speed', 'Speed', 0, 3), number('frame', 'Frame · ms', 0, 120000, 100), number('scale', 'Scale', .01, 4), number('rotation', 'Rotation', 0, 360, 1), number('offsetX', 'Offset X', -1, 1), number('offsetY', 'Offset Y', -1, 1)] as const

export function createShader(kind: ShaderKind, image?: string): ShaderPaint {
  const params = { ...shaderCatalog[kind].defaults }
  const paint = { kind, params, animated: kind !== 'halftone-cmyk' && kind !== 'glass-refraction', speed: .35, frame: 12000, scale: 1, rotation: 0, offsetX: 0, offsetY: 0, composite: { blendMode: 'normal', opacity: 1 } } as ShaderPaint
  return freezeShader((kind === 'halftone-cmyk' || kind === 'glass-refraction') && image ? { ...paint, params: { ...params, image } } as ShaderPaint : paint)
}

/** Serializable, owned values: neither callers nor inspectors can mutate store state. */
export function freezeShader(paint: ShaderPaint): ShaderPaint {
  if (Object.isFrozen(paint) && (!paint.composite || Object.isFrozen(paint.composite)) && Object.isFrozen(paint.params) && Object.values(paint.params).every(value => !Array.isArray(value) || Object.isFrozen(value))) return paint
  const params = Object.fromEntries(Object.entries(paint.params).map(([key, value]) => [key, Array.isArray(value) ? Object.freeze([...value]) : value]))
  return Object.freeze({ ...paint, ...(paint.composite ? { composite: Object.freeze({ ...paint.composite }) } : {}), params: Object.freeze(params) }) as ShaderPaint
}

export function updateShaderParameter(paint: ShaderPaint, key: string, value: ShaderValue): ShaderPaint {
  const next = { ...paint, params: { ...paint.params, [key]: value } } as ShaderPaint
  validateShader(next)
  return freezeShader(next)
}

const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test(value)
export function validateShader(value: unknown): asserts value is ShaderPaint {
  if (!value || typeof value !== 'object') throw new Error('Invalid shader paint')
  const paint = value as ShaderPaint
  if (!Object.hasOwn(shaderCatalog, paint.kind) || !paint.params || typeof paint.params !== 'object' || typeof paint.animated !== 'boolean') throw new Error('Invalid shader kind or parameters')
  if (paint.composite !== undefined) {
    const composite = paint.composite
    if (!composite || typeof composite !== 'object' || Object.keys(composite).length !== 2 || !shaderBlendModes.includes(composite.blendMode) || typeof composite.opacity !== 'number' || !Number.isFinite(composite.opacity) || composite.opacity < 0 || composite.opacity > 1) throw new Error('Invalid shader composite')
  }
  for (const control of motionControls) {
    const n = paint[control.key as keyof ShaderMotion]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < control.min || n > control.max) throw new Error(`Invalid shader ${control.key}`)
  }
  const definition: ShaderDefinition = shaderCatalog[paint.kind]
  const params = paint.params as unknown as Record<string, unknown>
  if (Object.keys(params).length !== definition.controls.length) throw new Error('Invalid shader parameter count')
  for (const control of definition.controls) {
    const param = params[control.key]
    const valid = control.type === 'number' ? typeof param === 'number' && Number.isFinite(param) && param >= control.min && param <= control.max && (!control.integer || Number.isInteger(param))
      : control.type === 'color' ? isColor(param)
      : control.type === 'palette' ? Array.isArray(param) && param.length >= 2 && param.length <= control.max && param.every(isColor)
      : control.type === 'select' ? typeof param === 'string' && control.options.includes(param)
      : typeof param === 'string' && !!param.trim() && /^(\/|\.\/|\.\.\/|https?:\/\/|data:image\/|blob:)/i.test(param)
    if (!valid) throw new Error(`Invalid shader ${control.key}`)
  }
}
