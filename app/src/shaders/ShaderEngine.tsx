import { Dithering, DotOrbit, FlutedGlass, GrainGradient, HalftoneCmyk, MeshGradient, Metaballs, NeuroNoise, PerlinNoise, ShaderMount, Warp } from '@paper-design/shaders-react'
import type { FlutedGlassProps, HalftoneCmykProps, PaperShaderElement } from '@paper-design/shaders-react'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { ShaderPaint } from './types'
import { meshUniforms } from './mesh'
import { meshFragmentShader } from './meshFragment'

function useSourceImage(source: string, onError: () => void) {
  const [loaded, setLoaded] = useState<{ source: string; image: HTMLImageElement } | null>(null)
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
  return loaded?.source === source ? loaded.image : null
}

/** Image filters have no u_time; drive one uniform directly without React renders. */
function useFilterMotion(ref: RefObject<PaperShaderElement | null>, ready: boolean, speed: number, frame: number, value: number, glass: boolean) {
  useEffect(() => {
    if (!ready || speed === 0) return
    let request = 0
    const start = performance.now()
    const tick = (now: number) => {
      const mount = ref.current?.paperShaderMount
      if (mount) {
        const time = frame + (now - start) * speed
        mount.setUniforms(glass
          ? { u_shift: Math.max(-1, Math.min(1, value + Math.sin(time * .0002) * .08)) }
          : { u_rotation: (value + Math.sin(time * .0002) * 3) * Math.PI / 180 })
      }
      request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [ref, ready, speed, frame, value, glass])
}

function ImageHalftone({ source, onError, ...props }: Omit<HalftoneCmykProps, 'image'> & { source: string; onError: () => void }) {
  const ref = useRef<PaperShaderElement>(null)
  const image = useSourceImage(source, onError)
  useFilterMotion(ref, !!image, props.speed ?? 0, props.frame ?? 0, props.rotation ?? 0, false)
  const rotation = (props.rotation ?? 0) + Math.sin((props.frame ?? 0) * .0002) * 3
  return image ? <HalftoneCmyk {...props} ref={ref} rotation={rotation} speed={0} image={image} /> : null
}

function ImageGlass({ source, onError, ...props }: Omit<FlutedGlassProps, 'image'> & { source: string; onError: () => void }) {
  const ref = useRef<PaperShaderElement>(null)
  const image = useSourceImage(source, onError)
  useFilterMotion(ref, !!image, props.speed ?? 0, props.frame ?? 0, props.shift ?? 0, true)
  const shift = Math.max(-1, Math.min(1, (props.shift ?? 0) + Math.sin((props.frame ?? 0) * .0002) * .08))
  return image ? <FlutedGlass {...props} ref={ref} shift={shift} speed={0} image={image} /> : null
}

/** Uniform updates stay inside Paper's WebGL engine, outside React's frame loop. */
export default function ShaderEngine({ paint, paused, onError, captureScale, capturePixelCount }: { paint: ShaderPaint; paused: boolean; onError: () => void; captureScale?: number; capturePixelCount?: number }) {
  const common = {
    width: '100%', height: '100%', style: { position: 'absolute' as const, inset: 0 },
    minPixelRatio: captureScale ?? 1, maxPixelCount: capturePixelCount ?? (captureScale ? 64_000_000 : 1_500_000),
    speed: paused || !paint.animated ? 0 : paint.speed,
    frame: paint.frame,
    webGlContextAttributes: { alpha: true, antialias: false, powerPreference: 'high-performance' as const, preserveDrawingBuffer: !!captureScale },
  }
  const placement = { scale: paint.scale, rotation: paint.rotation, offsetX: paint.offsetX, offsetY: paint.offsetY }
  switch (paint.kind) {
    case 'mesh-gradient': return paint.mesh ? <ShaderMount {...common} fragmentShader={meshFragmentShader} uniforms={meshUniforms(paint)} /> : <MeshGradient {...common} {...placement} {...paint.params} colors={[...paint.params.colors]} />
    case 'dot-orbit': return <DotOrbit {...common} {...placement} {...paint.params} colors={[...paint.params.colors]} />
    case 'grain-gradient': return <GrainGradient {...common} {...placement} {...paint.params} colors={[...paint.params.colors]} />
    case 'halftone-cmyk': return <ImageHalftone {...common} {...placement} {...paint.params} source={paint.params.image} onError={onError} fit="cover" />
    case 'neuro-noise': return <NeuroNoise {...common} {...placement} {...paint.params} />
    case 'gooey': return <Metaballs {...common} {...placement} {...paint.params} colors={[...paint.params.colors]} />
    case 'dithering': return <Dithering {...common} {...placement} {...paint.params} />
    case 'perlin-noise': return <PerlinNoise {...common} {...placement} {...paint.params} />
    case 'liquid-distortion': return <Warp {...common} {...placement} {...paint.params} colors={[...paint.params.colors]} />
    case 'glass-refraction': return <ImageGlass {...common} {...placement} {...paint.params} source={paint.params.image} onError={onError} fit="cover" />
  }
}
