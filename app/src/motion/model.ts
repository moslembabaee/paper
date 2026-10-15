import { easeProgress } from '../prototype/model.ts'
import { DEFAULT_SPRING, springDuration, springProgress, validateSpring } from '../prototype/spring.ts'
import type { SpringParameters } from '../prototype/types.ts'
import type { SceneElement } from '../scene/types.ts'
import type { MotionDocument, MotionEasing, MotionKeyframe, MotionProperty, MotionTrack } from './types.ts'

export const EMPTY_MOTION: MotionDocument = Object.freeze({ duration: 2000, tracks: Object.freeze([]) })
export const DEFAULT_EASING: MotionEasing = Object.freeze({ kind: 'spring', spring: DEFAULT_SPRING })
export const PROPERTY_META: Record<MotionProperty, { label: string; unit: string; from: number; to: number; min: number; max: number }> = {
  x: { label: 'Translate X', unit: 'px', from: 0, to: 120, min: -100000, max: 100000 },
  y: { label: 'Translate Y', unit: 'px', from: 24, to: 0, min: -100000, max: 100000 },
  rotation: { label: 'Rotation', unit: '°', from: 0, to: 90, min: -36000, max: 36000 },
  scale: { label: 'Scale', unit: '×', from: .8, to: 1, min: .01, max: 100 },
  opacity: { label: 'Opacity', unit: '', from: 0, to: 1, min: 0, max: 1 },
}
const finite = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max
const validId = (id: string) => typeof id === 'string' && id.length > 0 && id.length <= 200 && !['__proto__', 'constructor', 'prototype'].includes(id)
export function validateMotion(value: MotionDocument, elements: Readonly<Record<string, SceneElement>>): MotionDocument {
  if (!value || !finite(value.duration, 100, 30000) || !Array.isArray(value.tracks) || value.tracks.length > 200) throw new Error('Invalid motion timeline')
  const ids = new Set<string>(), channels = new Set<string>()
  const tracks = (value.tracks as readonly MotionTrack[]).map((track: MotionTrack) => {
    const channel = JSON.stringify([track.elementId, track.property])
    if (!validId(track.id) || ids.has(track.id) || !Object.hasOwn(elements, track.elementId) || !Object.hasOwn(PROPERTY_META, track.property) || channels.has(channel) || typeof track.enabled !== 'boolean' || !Array.isArray(track.keyframes) || track.keyframes.length < 2 || track.keyframes.length > 200) throw new Error('Invalid motion track')
    ids.add(track.id); channels.add(channel)
    const keyIds = new Set<string>(), meta = PROPERTY_META[track.property as MotionProperty]
    let previous = -1
    const keyframes = (track.keyframes as readonly MotionKeyframe[]).map((key: MotionKeyframe) => {
      if (!validId(key.id) || keyIds.has(key.id) || !finite(key.time, 0, value.duration) || key.time <= previous || !finite(key.value, meta.min, meta.max) || !key.easing) throw new Error('Invalid motion keyframe')
      previous = key.time; keyIds.add(key.id)
      let easing: MotionEasing
      if (key.easing.kind === 'spring') easing = Object.freeze({ kind: 'spring', spring: validateSpring(key.easing.spring) })
      else if (key.easing.kind === 'bezier') {
        const curve = key.easing.curve
        if (!Array.isArray(curve) || curve.length !== 4 || !curve.every((n, index) => finite(n, index % 2 ? -2 : 0, index % 2 ? 3 : 1))) throw new Error('Invalid motion Bézier curve')
        easing = Object.freeze({ kind: 'bezier', curve: Object.freeze([...curve]) as unknown as typeof curve })
      } else throw new Error('Invalid motion easing')
      return Object.freeze({ id: key.id, time: key.time, value: key.value, easing })
    })
    return Object.freeze({ id: track.id, elementId: track.elementId, property: track.property, enabled: track.enabled, keyframes: Object.freeze(keyframes) })
  })
  return Object.freeze({ duration: value.duration, tracks: Object.freeze(tracks) })
}

export function pruneMotion(motion: MotionDocument, elements: Readonly<Record<string, SceneElement>>): MotionDocument {
  const tracks = motion.tracks.filter(track => Object.hasOwn(elements, track.elementId))
  return tracks.length === motion.tracks.length ? motion : Object.freeze({ ...motion, tracks: Object.freeze(tracks) })
}
export function createTrack(elementId: string, property: MotionProperty, duration: number): MotionTrack {
  const meta = PROPERTY_META[property]
  return { id: crypto.randomUUID(), elementId, property, enabled: true, keyframes: [
    { id: crypto.randomUUID(), time: 0, value: meta.from, easing: DEFAULT_EASING },
    { id: crypto.randomUUID(), time: Math.min(duration, springDuration()), value: meta.to, easing: DEFAULT_EASING },
  ] }
}
const durations = new WeakMap<SpringParameters, number>()
export function easingProgress(progress: number, easing: MotionEasing): number {
  if (easing.kind === 'bezier') return easeProgress(progress, easing.curve)
  let duration = durations.get(easing.spring)
  if (duration === undefined) { duration = springDuration(easing.spring); durations.set(easing.spring, duration) }
  return springProgress(progress, easing.spring, duration)
}
export function trackValue(track: MotionTrack, time: number): number {
  const keys = track.keyframes
  if (time <= keys[0].time) return keys[0].value
  const next = keys.findIndex(key => key.time > time)
  if (next < 0) return keys.at(-1)!.value
  const a = keys[next - 1], b = keys[next]
  const value = a.value + (b.value - a.value) * easingProgress((time - a.time) / (b.time - a.time), a.easing)
  const { min, max } = PROPERTY_META[track.property]
  return Math.max(min, Math.min(max, value))
}
/** Include every authored keyframe in addition to 120 Hz samples. Preview and exports share this clock. */
export function sampleTimes(motion: MotionDocument, tracks = motion.tracks): number[] {
  const count = Math.ceil(motion.duration / (1000 / 120))
  return [...new Set([0, motion.duration, ...Array.from({ length: count + 1 }, (_, i) => Math.round(motion.duration * i / count)), ...tracks.flatMap(track => track.keyframes.map(key => key.time))])].sort((a, b) => a - b)
}
export function patchKeyframe(track: MotionTrack, id: string, patch: Partial<MotionKeyframe>): MotionTrack {
  return { ...track, keyframes: track.keyframes.map(key => key.id === id ? { ...key, ...patch } : key).sort((a, b) => a.time - b.time) }
}
