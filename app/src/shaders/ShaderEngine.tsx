import { Dithering, DotOrbit, GrainGradient, HalftoneCmyk, MeshGradient, Metaballs, NeuroNoise } from '@paper-design/shaders-react'
import type { HalftoneCmykProps, PaperShaderElement } from '@paper-design/shaders-react'
import { useEffect, useRef, useState } from 'react'
import type { ShaderPaint } from './types'

function ImageHalftone({ source, onError, ...props }: Omit<HalftoneCmykProps, 'image'> & { source: string; onError: () => void }) {
  const ref = useRef<PaperShaderElement>(null)
  const [loaded, setLoaded] = useState<{ source: string; image: HTMLImageElement } | null>(null)
  const { speed = 0, frame = 0, rotation = 0 } = props
  useEffect(() => {
    let active = true
    const image = new Image()
    const url = new URL(source, document.baseURI)
    if (/^https?:$/.test(url.protocol) && url.origin !== window.location.origin) image.crossOrigin = 'anonymous'
    image.onload = () => { if (active) setLoaded({ source, image }) }
    image.onerror = () => { if (active) onError() }
    image.src = url.href
    return () => { active = false; image.onload = null; image.onerror = null }
  }, [source, onError])
  useEffect(() => {
    if (loaded?.source !== source) return
    // CMYK is an image filter without u_time. Animate its rotation uniform gently,
    // keeping the same deterministic frame semantics as the procedural shaders.
    let request = 0
    const start = performance.now()
    const tick = (now: number) => {
      const mount = ref.current?.paperShaderMount
      if (mount) {
        const time = frame + (now - start) * speed
        mount.setUniforms({ u_rotation: (rotation + Math.sin(time * .0002) * 3) * Math.PI / 180 })
      }
      if (!mount || speed !== 0) request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [loaded, source, speed, frame, rotation])
  return loaded?.source === source ? <HalftoneCmyk {...props} ref={ref} speed={0} image={loaded.image} /> : null
}

/** Uniform updates stay inside Paper's WebGL engine, outside React's frame loop. */
export default function ShaderEngine({ paint, paused, onError, captureScale, capturePixelCount }: { paint: ShaderPaint; paused: boolean; onError: () => void; captureScale?: number; capturePixelCount?: number }) {
  const common = {
    width: '100%', height: '100%', style: { position: 'absolute' as const, inset: 0 },
    minPixelRatio: captureScale ?? 1, maxPixelCount: capturePixelCount ?? (captureScale ? 64_000_000 : 1_500_000),
    speed: paused || !paint.animated ? 0 : paint.speed,
    frame: paint.frame, scale: paint.scale, rotation: paint.rotation, offsetX: paint.offsetX, offsetY: paint.offsetY,
    webGlContextAttributes: { alpha: true, antialias: false, powerPreference: 'high-performance' as const, preserveDrawingBuffer: !!captureScale },
  }
  switch (paint.kind) {
    case 'mesh-gradient': return <MeshGradient {...common} {...paint.params} colors={[...paint.params.colors]} />
    case 'dot-orbit': return <DotOrbit {...common} {...paint.params} colors={[...paint.params.colors]} />
    case 'grain-gradient': return <GrainGradient {...common} {...paint.params} colors={[...paint.params.colors]} />
    case 'halftone-cmyk': return <ImageHalftone {...common} {...paint.params} source={paint.params.image} onError={onError} fit="cover" />
    case 'neuro-noise': return <NeuroNoise {...common} {...paint.params} />
    case 'gooey': return <Metaballs {...common} {...paint.params} colors={[...paint.params.colors]} />
    case 'dithering': return <Dithering {...common} {...paint.params} />
  }
}
