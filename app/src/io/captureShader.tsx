import { createRoot } from 'react-dom/client'
import type { PaperShaderElement } from '@paper-design/shaders-react'
import ShaderEngine from '../shaders/ShaderEngine'
import type { ShaderPaint } from '../shaders/types'

/** Render the saved static frame at export resolution, including offscreen layers. */
export async function captureShader(paint: ShaderPaint, width: number, height: number, scale: number): Promise<string> {
  const probe = document.createElement('canvas').getContext('webgl2')
  if (!probe) throw new Error('Shader export needs WebGL 2 in this browser.')
  probe.getExtension('WEBGL_lose_context')?.loseContext()
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;opacity:0;pointer-events:none;z-index:-1;`
  document.body.append(host)
  const root = createRoot(host)
  let failed = false
  try {
    root.render(<ShaderEngine paint={paint} paused captureScale={scale} onError={() => { failed = true }} />)
    const started = performance.now()
    while (performance.now() - started < 8000) {
      if (failed) throw new Error('The shader image could not be loaded for export.')
      const canvas = host.querySelector('canvas')
      const mount = (canvas?.parentElement as PaperShaderElement | null)?.paperShaderMount
      if (canvas && mount && canvas.width > 0 && canvas.height > 0) {
        // ResizeObserver initializes physical resolution after the React mount.
        // Wait for layout before reading the drawing buffer.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        mount.setFrame(paint.frame)
        return canvas.toDataURL('image/png')
      }
      await new Promise(resolve => window.setTimeout(resolve, 30))
    }
    throw new Error('The shader took too long to render. Please try again.')
  } finally { root.unmount(); host.remove() }
}
