import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SceneElement } from '../scene/types.ts'
import { findAdjacentKeyframeTimes, isShaderProperty, sampleTimes, trackValue } from './model.ts'
import type { MotionDocument, MotionProperty } from './types.ts'

interface ModifiedNodeRecord {
  readonly node: HTMLElement
  readonly shaderSurface: HTMLElement | null
  readonly originalTransform: string
  readonly originalOpacity: string
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

  const cleanShaderOverrides = useCallback(() => {
    for (const record of modifiedElements.current) {
      if (record.shaderSurface) {
        record.shaderSurface.style.opacity = record.originalOpacity
        record.shaderSurface.style.transform = record.originalTransform
      }
      record.node.style.removeProperty('--shader-opacity')
      record.node.style.removeProperty('--shader-scale')
      record.node.style.removeProperty('--shader-rotation')
      record.node.style.removeProperty('--shader-offset-x')
      record.node.style.removeProperty('--shader-offset-y')
      record.node.style.removeProperty('--shader-speed')
    }
    modifiedElements.current = []
  }, [])

  const paint = useCallback(
    (value: number) => {
      time.current = Math.max(0, Math.min(duration, value))
      setCurrentTimeMs(time.current)

      // Update Web Animations API animations
      animations.current.forEach(animation => {
        animation.currentTime = time.current
      })

      // Update shader properties directly on canvas elements
      const shaderTracks = motion.tracks.filter(t => t.enabled && isShaderProperty(t.property))
      if (shaderTracks.length > 0 && stage.current) {
        const shaderElementIds = new Set(shaderTracks.map(t => t.elementId))
        for (const id of shaderElementIds) {
          const node = stage.current.querySelector<HTMLElement>(
            `.viewport-world .scene-node[data-element-id="${id}"]`
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

      root.current?.style.setProperty('--motion-progress', `${(time.current / duration) * 100}%`)
      if (readout.current) readout.current.value = `${(time.current / 1000).toFixed(2)} s`
      if (scrubber.current) scrubber.current.value = String(time.current)
    },
    [duration, motion.tracks, stage]
  )

  // Construct Web Animations when preview starts or tracks change
  useEffect(() => {
    if (!preview) {
      cleanShaderOverrides()
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
      cleanShaderOverrides()
    }
  }, [motion, elements, stage, preview, duration, paint, cleanShaderOverrides])

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
        paint(next % duration)
      } else {
        paint(next)
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
  }, [])

  const restore = useCallback(() => {
    setPlaying(false)
    setPreview(false)
    cleanShaderOverrides()
    paint(0)
  }, [paint, cleanShaderOverrides])

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
