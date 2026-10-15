import type { ShaderPaint } from './types.ts'
import { meshUniforms } from './mesh.ts'
import { meshFragmentShader } from './meshFragment.ts'

/** Self-contained React source: no Paper app imports or missing shader assets. */
export function exportMeshReact(paint: Extract<ShaderPaint, { kind: 'mesh-gradient' }>): string {
  const style = { width: '100%', height: '100%', opacity: paint.composite?.opacity ?? 1, mixBlendMode: paint.composite?.blendMode ?? 'normal' }
  if (!paint.mesh) return `import { MeshGradient } from '@paper-design/shaders-react';\n\nexport default function Material() {\n  return <MeshGradient {...${JSON.stringify({ ...paint.params, speed: paint.animated ? paint.speed : 0, frame: paint.frame, scale: paint.scale, rotation: paint.rotation, offsetX: paint.offsetX, offsetY: paint.offsetY, style }, null, 2)}} />;\n}\n`
  return `import { ShaderMount } from '@paper-design/shaders-react';\n\nconst fragmentShader = \`${meshFragmentShader}\`;\nconst uniforms = ${JSON.stringify(meshUniforms(paint), null, 2)};\n\n// Place inside a parent with an explicit height.\nexport default function Material() {\n  return (\n    <ShaderMount\n      fragmentShader={fragmentShader}\n      uniforms={uniforms}\n      speed={${paint.animated ? paint.speed : 0}}\n      frame={${paint.frame}}\n      minPixelRatio={1}\n      maxPixelCount={1500000}\n      style={${JSON.stringify(style)}}\n    />\n  );\n}\n`
}
