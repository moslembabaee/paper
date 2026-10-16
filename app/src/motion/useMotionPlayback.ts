import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SceneElement } from '../scene/types.ts'
import { findAdjacentKeyframeTimes, isShaderProperty, isTypographyProperty, sampleTimes, trackValue } from './model.ts'
import type { MotionDocument, MotionProperty } from './types.ts'

interface ModifiedNodeRecord {
  readonly node: HTMLElement
  readonly shaderSurface: HTMLElement | null
  readonly originalTransform: string
  readonly originalOpacity: string
  readonly originalTransformOrigin: string
  readonly textContainer?: HTMLElement | null
  readonly originalFontVariationSettings?: string
  readonly originalFontWeight?: string
  readonly originalFontStretch?: string
  readonly originalLetterSpacing?: string
  readonly originalFontSize?: string
  readonly originalLineHeight?: string
  readonly textPathElement?: SVGTextPathElement | null
  readonly originalStartOffset?: string
}

/** Native paused animations and WebGL shader modulations isolate preview from scene edits, history and autosave. */
export function useMotionPlayback(
  motion: MotionDocument,
  elements: Readonly<Record<string, SceneElement>>,
  stage: RefObject<HTMLElement | null>,
) {
  const [playing, setPlaying] = useState(false)
  const [preview, setPreview] = useState(false)
  const [playbackRate, setPlaybackRate] = useState<number>(1)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)

  const time = useRef(0)
  const publishedTime = useRef(0)
  const looping = useRef(!!motion.loop)
  const playbackRateRef = useRef(playbackRate)

  useEffect(() => {
    playbackRateRef.current = playbackRate
  }, [playbackRate])

  useEffect(() => {
    looping.current = !!motion.loop
  }, [motion.loop])

  const animations = useRef<Animation[]>([])
  const modifiedElements = useRef<ModifiedNodeRecord[]>([])

  const root = useRef<HTMLElement>(null)
  const readout = useRef<HTMLOutputElement>(null)
  const scrubber = useRef<HTMLInputElement>(null)

  const duration = motion.duration

  const cleanOverrides = useCallback(() => {
    for (const record of modifiedElements.current) {
      if (record.shaderSurface) {
        record.shaderSurface.style.opacity = record.originalOpacity
        record.shaderSurface.style.transform = record.originalTransform
        record.shaderSurface.style.transformOrigin = record.originalTransformOrigin
      }
      record.node.style.removeProperty('--shader-opacity')
      record.node.style.removeProperty('--shader-scale')
      record.node.style.removeProperty('--shader-rotation')
      record.node.style.removeProperty('--shader-offset-x')
      record.node.style.removeProperty('--shader-offset-y')
      record.node.style.removeProperty('--shader-speed')

      if (record.textContainer) {
        if (record.originalFontVariationSettings !== undefined) {
          record.textContainer.style.fontVariationSettings = record.originalFontVariationSettings
        }
        if (record.originalFontWeight !== undefined) {
          record.textContainer.style.fontWeight = record.originalFontWeight
        }
        if (record.originalFontStretch !== undefined) {
          record.textContainer.style.fontStretch = record.originalFontStretch
        }
        if (record.originalLetterSpacing !== undefined) {
          record.textContainer.style.letterSpacing = record.originalLetterSpacing
        }
        if (record.originalFontSize !== undefined) {
          record.textContainer.style.fontSize = record.originalFontSize
        }
        if (record.originalLineHeight !== undefined) {
          record.textContainer.style.lineHeight = record.originalLineHeight
        }
      }
      if (record.textPathElement && record.originalStartOffset !== undefined) {
        record.textPathElement.setAttribute('startOffset', record.originalStartOffset)
      }
      record.node.style.removeProperty('--kinetic-phase')
      record.node.style.removeProperty('--cascade-amplitude')
      record.node.style.removeProperty('--cascade-rotation')
    }
    modifiedElements.current = []
  }, [])

  const paint = useCallback(
    (value: number, applyPreview = preview, publish = true) => {
      time.current = Math.max(0, Math.min(duration, value))
      // Keep the playhead at display refresh rate; React telemetry needs only 20 Hz.
      if (publish || Math.abs(time.current - publishedTime.current) >= 50) {
        publishedTime.current = time.current
        setCurrentTimeMs(time.current)
      }

      // Update Web Animations API animations
      animations.current.forEach(animation => {
        animation.currentTime = time.current
      })

      // Update shader properties directly on canvas elements
      const shaderTracks = motion.tracks.filter(t => t.enabled && isShaderProperty(t.property))
      if (applyPreview && shaderTracks.length > 0 && stage.current) {
        const shaderElementIds = new Set(shaderTracks.map(t => t.elementId))
        for (const id of shaderElementIds) {
          const node = stage.current.querySelector<HTMLElement>(
            `.viewport-world .scene-node[data-element-id="${CSS.escape(id)}"]`
          )
          if (!node) continue

          const shaderSurface = node.querySelector<HTMLElement>('.paper-shader-surface')
          const existing = modifiedElements.current.find(m => m.node === node)
          if (!existing) {
            modifiedElements.current.push({
              node,
              shaderSurface,
              originalTransform: shaderSurface?.style.transform ?? '',
              originalOpacity: shaderSurface?.style.opacity ?? '',
              originalTransformOrigin: shaderSurface?.style.transformOrigin ?? '',
            })
          }

          const elemTracks = shaderTracks.filter(t => t.elementId === id)
          const values: Partial<Record<MotionProperty, number>> = {}
          for (const t of elemTracks) {
            values[t.property] = trackValue(t, time.current)
          }

          if (values.shaderOpacity !== undefined) {
            if (shaderSurface) shaderSurface.style.opacity = String(values.shaderOpacity)
            node.style.setProperty('--shader-opacity', String(values.shaderOpacity))
          }
          if (values.shaderSpeed !== undefined) {
            node.style.setProperty('--shader-speed', String(values.shaderSpeed))
          }

          const scale = values.shaderScale
          const rot = values.shaderRotation
          const offX = values.shaderOffsetX
          const offY = values.shaderOffsetY

          if (scale !== undefined || rot !== undefined || offX !== undefined || offY !== undefined) {
            const transforms: string[] = []
            if (offX !== undefined || offY !== undefined) {
              transforms.push(`translate(${(offX ?? 0) * 100}%, ${(offY ?? 0) * 100}%)`)
            }
            if (rot !== undefined) transforms.push(`rotate(${rot}deg)`)
            if (scale !== undefined) transforms.push(`scale(${scale})`)

            if (shaderSurface) {
              shaderSurface.style.transformOrigin = 'center center'
              shaderSurface.style.transform = transforms.join(' ')
            }
            if (scale !== undefined) node.style.setProperty('--shader-scale', String(scale))
            if (rot !== undefined) node.style.setProperty('--shader-rotation', `${rot}deg`)
            if (offX !== undefined) node.style.setProperty('--shader-offset-x', `${offX * 100}%`)
            if (offY !== undefined) node.style.setProperty('--shader-offset-y', `${offY * 100}%`)
          }
        }
      }

      // Update variable font axes and kinetic typography properties directly on canvas elements
      const typoTracks = motion.tracks.filter(t => t.enabled && isTypographyProperty(t.property))
      if (applyPreview && typoTracks.length > 0 && stage.current) {
        const typoElementIds = new Set(typoTracks.map(t => t.elementId))
        for (const id of typoElementIds) {
          const elem = elements[id]
          if (elem?.type !== 'text') continue
          const node = stage.current.querySelector<HTMLElement>(
            `.viewport-world .scene-node[data-element-id="${CSS.escape(id)}"]`
          )
          if (!node) continue

          const textContainer =
            node.querySelector<HTMLElement>('.scene-text') ??
            node.querySelector<HTMLElement>('.scene-text-on-path')
          const textPathElement = node.querySelector<SVGTextPathElement>('textPath')

          let record = modifiedElements.current.find(m => m.node === node)
          if (!record) {
            record = {
              node,
              shaderSurface: null,
              originalTransform: '',
              originalOpacity: '',
              originalTransformOrigin: '',
              textContainer,
              originalFontVariationSettings: textContainer?.style.fontVariationSettings ?? '',
              originalFontWeight: textContainer?.style.fontWeight ?? '',
              originalFontStretch: textContainer?.style.fontStretch ?? '',
              originalLetterSpacing: textContainer?.style.letterSpacing ?? '',
              originalFontSize: textContainer?.style.fontSize ?? '',
              originalLineHeight: textContainer?.style.lineHeight ?? '',
              textPathElement,
              originalStartOffset: textPathElement?.getAttribute('startOffset') ?? '',
            }
            modifiedElements.current.push(record)
          }

          const elemTracks = typoTracks.filter(t => t.elementId === id)
          const values: Partial<Record<MotionProperty, number>> = {}
          for (const t of elemTracks) {
            values[t.property] = trackValue(t, time.current)
          }

          const currentAxes = elem.variableAxes ?? {}
          const wght = values.fontWeight ?? currentAxes.wght ?? elem.fontWeight
          const wdth = values.fontWidth ?? currentAxes.wdth
          const slnt = values.fontSlant ?? currentAxes.slnt
          const opsz = values.fontOpticalSize ?? currentAxes.opsz

          const variationParts: string[] = []
          if (wght !== undefined && Number.isFinite(wght)) variationParts.push(`'wght' ${Number(wght.toFixed(2))}`)
          if (wdth !== undefined && Number.isFinite(wdth)) variationParts.push(`'wdth' ${Number(wdth.toFixed(2))}`)
          if (slnt !== undefined && Number.isFinite(slnt)) variationParts.push(`'slnt' ${Number(slnt.toFixed(2))}`)
          if (opsz !== undefined && Number.isFinite(opsz)) variationParts.push(`'opsz' ${Number(opsz.toFixed(1))}`)

          if (textContainer) {
            if (variationParts.length > 0) {
              textContainer.style.fontVariationSettings = variationParts.join(', ')
            }
            if (values.fontWeight !== undefined) {
              textContainer.style.fontWeight = String(Math.round(values.fontWeight))
            }
            if (values.fontWidth !== undefined) {
              textContainer.style.fontStretch = `${values.fontWidth}%`
            }
            if (values.fontSize !== undefined) {
              textContainer.style.fontSize = `${values.fontSize}px`
            }
            if (values.letterSpacing !== undefined) {
              textContainer.style.letterSpacing = `${values.letterSpacing}px`
            }
            if (values.lineHeight !== undefined) {
              textContainer.style.lineHeight = String(values.lineHeight)
            }
          }

          if (textPathElement && values.textPathOffset !== undefined) {
            textPathElement.setAttribute('startOffset', `${values.textPathOffset}%`)
          }

          if (values.kineticPhase !== undefined) {
            node.style.setProperty('--kinetic-phase', String(values.kineticPhase))
          }
          if (values.kineticAmplitude !== undefined) {
            node.style.setProperty('--cascade-amplitude', `${values.kineticAmplitude}px`)
          }
          if (values.kineticRotation !== undefined) {
            node.style.setProperty('--cascade-rotation', `${values.kineticRotation}deg`)
          }
        }
      }

      root.current?.style.setProperty('--motion-progress', `${(time.current / duration) * 100}%`)
      if (readout.current) readout.current.value = `${(time.current / 1000).toFixed(2)} s`
      if (scrubber.current) scrubber.current.value = String(time.current)
    },
    [duration, motion.tracks, stage, preview, elements]
  )

  // Construct Web Animations when preview starts or tracks change
  useEffect(() => {
    if (!preview) {
      cleanOverrides()
      return
    }

    const tracks = motion.tracks.filter(track => track.enabled)
    const nodes = new Map(
      Array.from(
        stage.current?.querySelectorAll<HTMLElement>('.viewport-world .scene-node[data-element-id]') ?? []
      ).map(node => [node.dataset.elementId!, node])
    )

    const created: Animation[] = []
    const transformProperties = new Set<MotionProperty>(['x', 'y', 'rotation', 'scale', 'opacity'])

    for (const id of new Set(tracks.map(track => track.elementId))) {
      const node = nodes.get(id)
      if (!node || !elements[id]) continue

      const group = tracks.filter(track => track.elementId === id && transformProperties.has(track.property))
      if (!group.length) continue

      const times = sampleTimes(motion, group)
      const frames = times.map(t => {
        const values = Object.fromEntries(group.map(track => [track.property, trackValue(track, t)]))
        return {
          offset: t / duration,
          ...('x' in values || 'y' in values ? { translate: `${values.x ?? 0}px ${values.y ?? 0}px` } : {}),
          ...('rotation' in values ? { rotate: `${values.rotation}deg` } : {}),
          ...('scale' in values ? { scale: String(values.scale) } : {}),
        }
      })

      if (group.some(track => track.property !== 'opacity')) {
        created.push(node.animate(frames, { duration, fill: 'both', easing: 'linear' }))
      }

      const opacity = group.find(track => track.property === 'opacity')
      const content = node.querySelector<HTMLElement>(':scope > .scene-content')
      if (opacity && content) {
        created.push(
          content.animate(
            times.map(t => ({ offset: t / duration, opacity: trackValue(opacity, t) })),
            { duration, fill: 'both', easing: 'linear' }
          )
        )
      }
    }

    animations.current = created
    created.forEach(animation => animation.pause())
    paint(time.current)

    return () => {
      created.forEach(animation => animation.cancel())
      animations.current = []
      cleanOverrides()
    }
  }, [motion, elements, stage, preview, duration, paint, cleanOverrides])

  // Playback animation frame loop
  useEffect(() => {
    paint(time.current)
    if (!playing) return

    let frame = 0
    let previous: number | undefined

    const tick = (now: number) => {
      const delta = (previous === undefined ? 0 : now - previous) * playbackRateRef.current
      const next = time.current + delta
      previous = now

      if (next >= duration) {
        if (!looping.current) {
          paint(duration)
          setPlaying(false)
          return
        }
        paint(next % duration, true, false)
      } else {
        paint(next, true, false)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    const visibility = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener('visibilitychange', visibility)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [playing, duration, paint])

  const seek = useCallback(
    (value: number) => {
      setPlaying(false)
      setPreview(true)
      paint(value)
    },
    [paint]
  )

  const toggle = useCallback(() => {
    setPreview(true)
    if (time.current >= duration) paint(0)
    setPlaying(value => !value)
  }, [duration, paint])

  const play = useCallback(() => {
    setPreview(true)
    if (time.current >= duration) paint(0)
    setPlaying(true)
  }, [duration, paint])

  const pause = useCallback(() => {
    setPlaying(false)
    paint(time.current)
  }, [paint])

  const restore = useCallback(() => {
    setPlaying(false)
    setPreview(false)
    cleanOverrides()
    paint(0, false)
  }, [paint, cleanOverrides])

  const stepFrame = useCallback(
    (deltaFrames: number, fps = 60) => {
      const frameDuration = 1000 / fps
      const target = Math.max(0, Math.min(duration, time.current + deltaFrames * frameDuration))
      seek(target)
    },
    [duration, seek]
  )

  const jumpKeyframe = useCallback(
    (direction: 'prev' | 'next') => {
      const { prev, next } = findAdjacentKeyframeTimes(motion, time.current)
      const target = direction === 'prev' ? prev : next
      if (target !== null) {
        seek(target)
      }
    },
    [motion, seek]
  )

  const setLooping = useCallback((loop: boolean) => {
    looping.current = loop
  }, [])

  return {
    playing,
    preview,
    time,
    currentTimeMs,
    playbackRate,
    setPlaybackRate,
    root,
    readout,
    scrubber,
    looping,
    setLooping,
    seek,
    toggle,
    play,
    pause,
    restore,
    stepFrame,
    jumpKeyframe,
  }
}
