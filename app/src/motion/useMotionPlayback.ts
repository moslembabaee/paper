import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { SceneElement } from '../scene/types'
import { sampleTimes, trackValue } from './model'
import type { MotionDocument } from './types'

/** Native paused animations isolate preview from scene edits, history and autosave. */
export function useMotionPlayback(motion: MotionDocument, elements: Readonly<Record<string, SceneElement>>, stage: RefObject<HTMLElement | null>) {
  const [playing, setPlaying] = useState(false), [preview, setPreview] = useState(false)
  const time = useRef(0), looping = useRef(false), animations = useRef<Animation[]>([])
  const root = useRef<HTMLElement>(null), readout = useRef<HTMLOutputElement>(null), scrubber = useRef<HTMLInputElement>(null)
  const duration = motion.duration
  const paint = useCallback((value: number) => {
    time.current = Math.max(0, Math.min(duration, value))
    animations.current.forEach(animation => { animation.currentTime = time.current })
    root.current?.style.setProperty('--motion-progress', `${time.current / duration * 100}%`)
    if (readout.current) readout.current.value = `${(time.current / 1000).toFixed(2)} s`
    if (scrubber.current) scrubber.current.value = String(time.current)
  }, [duration])
  useEffect(() => {
    if (!preview) return
    const tracks = motion.tracks.filter(track => track.enabled)
    const nodes = new Map(Array.from(stage.current?.querySelectorAll<HTMLElement>('.viewport-world .scene-node[data-element-id]') ?? []).map(node => [node.dataset.elementId, node]))
    const created: Animation[] = []
    for (const id of new Set(tracks.map(track => track.elementId))) {
      const node = nodes.get(id)
      if (!node || !elements[id]) continue
      const group = tracks.filter(track => track.elementId === id), times = sampleTimes(motion, group)
      const frames = times.map(t => {
        const values = Object.fromEntries(group.map(track => [track.property, trackValue(track, t)]))
        return { offset: t / duration, ...('x' in values || 'y' in values ? { translate: `${values.x ?? 0}px ${values.y ?? 0}px` } : {}), ...('rotation' in values ? { rotate: `${values.rotation}deg` } : {}), ...('scale' in values ? { scale: String(values.scale) } : {}) }
      })
      if (group.some(track => track.property !== 'opacity')) created.push(node.animate(frames, { duration, fill: 'both', easing: 'linear' }))
      const opacity = group.find(track => track.property === 'opacity')
      const content = node.querySelector<HTMLElement>(':scope > .scene-content')
      if (opacity && content) created.push(content.animate(times.map(t => ({ offset: t / duration, opacity: trackValue(opacity, t) })), { duration, fill: 'both', easing: 'linear' }))
    }
    animations.current = created
    created.forEach(animation => animation.pause())
    paint(time.current)
    return () => { created.forEach(animation => animation.cancel()); animations.current = [] }
  }, [motion, elements, stage, preview, duration, paint])
  useEffect(() => {
    paint(time.current)
    if (!playing) return
    let frame = 0, previous: number | undefined
    const tick = (now: number) => {
      const next = time.current + (previous === undefined ? 0 : now - previous)
      previous = now
      if (next >= duration && !looping.current) { paint(duration); setPlaying(false); return }
      paint(next >= duration ? next % duration : next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const visibility = () => { if (document.hidden) setPlaying(false) }
    document.addEventListener('visibilitychange', visibility)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility) }
  }, [playing, duration, paint])
  return { playing, preview, time, root, readout, scrubber, looping,
    seek: (value: number) => { setPlaying(false); setPreview(true); paint(value) },
    toggle: () => { setPreview(true); if (time.current >= duration) paint(0); setPlaying(value => !value) },
    restore: () => { setPlaying(false); setPreview(false); paint(0) },
  }
}
