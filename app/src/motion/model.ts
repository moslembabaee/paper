import { easeProgress } from '../prototype/model.ts'
import { DEFAULT_SPRING, springDuration, springProgress, validateSpring } from '../prototype/spring.ts'
import type { BezierCurve, SpringParameters } from '../prototype/types.ts'
import type { SceneElement } from '../scene/types.ts'
import type { MotionDocument, MotionEasing, MotionKeyframe, MotionProperty, MotionTrack } from './types.ts'

export const EMPTY_MOTION: MotionDocument = Object.freeze({ duration: 2000, tracks: Object.freeze([]) })
export const DEFAULT_EASING: MotionEasing = Object.freeze({ kind: 'spring', spring: DEFAULT_SPRING })

export interface PropertyMeta {
  readonly label: string
  readonly shortLabel: string
  readonly unit: string
  readonly from: number
  readonly to: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly category: 'transform' | 'shader'
}

export const PROPERTY_META: Record<MotionProperty, PropertyMeta> = {
  x: { label: 'Translate X', shortLabel: 'X', unit: 'px', from: 0, to: 120, min: -100000, max: 100000, step: 1, category: 'transform' },
  y: { label: 'Translate Y', shortLabel: 'Y', unit: 'px', from: 24, to: 0, min: -100000, max: 100000, step: 1, category: 'transform' },
  rotation: { label: 'Rotation', shortLabel: 'Rotate', unit: '°', from: 0, to: 90, min: -36000, max: 36000, step: 1, category: 'transform' },
  scale: { label: 'Scale', shortLabel: 'Scale', unit: '×', from: 0.8, to: 1, min: 0.01, max: 100, step: 0.01, category: 'transform' },
  opacity: { label: 'Opacity', shortLabel: 'Opacity', unit: '', from: 0, to: 1, min: 0, max: 1, step: 0.01, category: 'transform' },
  shaderSpeed: { label: 'Shader Speed', shortLabel: 'Shd Speed', unit: '×', from: 1, to: 2.5, min: 0, max: 10, step: 0.1, category: 'shader' },
  shaderScale: { label: 'Shader Scale', shortLabel: 'Shd Scale', unit: '×', from: 1, to: 2, min: 0.01, max: 20, step: 0.05, category: 'shader' },
  shaderRotation: { label: 'Shader Rotation', shortLabel: 'Shd Rot', unit: '°', from: 0, to: 180, min: -36000, max: 36000, step: 1, category: 'shader' },
  shaderOffsetX: { label: 'Shader Offset X', shortLabel: 'Shd OffX', unit: '', from: 0, to: 0.3, min: -10, max: 10, step: 0.01, category: 'shader' },
  shaderOffsetY: { label: 'Shader Offset Y', shortLabel: 'Shd OffY', unit: '', from: 0, to: 0.3, min: -10, max: 10, step: 0.01, category: 'shader' },
  shaderOpacity: { label: 'Shader Opacity', shortLabel: 'Shd Opacity', unit: '', from: 0.2, to: 1, min: 0, max: 1, step: 0.01, category: 'shader' },
}

export const isShaderProperty = (property: MotionProperty): boolean => PROPERTY_META[property]?.category === 'shader'

export const MOTION_BEZIER_PRESETS: Record<string, { label: string; curve: BezierCurve }> = {
  linear: { label: 'Linear', curve: [0, 0, 1, 1] },
  ease: { label: 'Ease', curve: [0.25, 0.1, 0.25, 1] },
  'ease-in': { label: 'Ease In', curve: [0.42, 0, 1, 1] },
  'ease-out': { label: 'Ease Out', curve: [0, 0, 0.16, 1] },
  'ease-in-out': { label: 'Ease In-Out', curve: [0.65, 0, 0.35, 1] },
  anticipate: { label: 'Anticipate', curve: [0.36, 0, 0.66, -0.56] },
  overshoot: { label: 'Overshoot', curve: [0.34, 1.56, 0.64, 1] },
  snappy: { label: 'Snappy', curve: [0.2, 0.8, 0.2, 1] },
  cinematic: { label: 'Cinematic', curve: [0.16, 1, 0.3, 1] },
  bounce: { label: 'Bounce', curve: [0.68, -0.55, 0.265, 1.55] },
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
  return Object.freeze({
    duration: value.duration,
    tracks: Object.freeze(tracks),
    ...(value.loop !== undefined ? { loop: !!value.loop } : {}),
    ...(value.fps !== undefined ? { fps: value.fps } : {}),
  })
}

export function pruneMotion(motion: MotionDocument, elements: Readonly<Record<string, SceneElement>>): MotionDocument {
  const tracks = motion.tracks.filter(track => Object.hasOwn(elements, track.elementId))
  return tracks.length === motion.tracks.length ? motion : Object.freeze({ ...motion, tracks: Object.freeze(tracks) })
}

export function getElementPropertyValue(element: SceneElement, property: MotionProperty): number {
  switch (property) {
    case 'x': return 0
    case 'y': return 0
    case 'rotation': return 0
    case 'scale': return 1
    case 'opacity': return element.style.opacity ?? 1
    case 'shaderSpeed': return element.style.shader?.speed ?? 1
    case 'shaderScale': return element.style.shader?.scale ?? 1
    case 'shaderRotation': return element.style.shader?.rotation ?? 0
    case 'shaderOffsetX': return element.style.shader?.offsetX ?? 0
    case 'shaderOffsetY': return element.style.shader?.offsetY ?? 0
    case 'shaderOpacity': return element.style.shader?.composite?.opacity ?? 1
  }
}

export function createTrack(
  elementId: string,
  property: MotionProperty,
  duration: number,
  element?: SceneElement,
): MotionTrack {
  const meta = PROPERTY_META[property]
  let from = meta.from
  let to = meta.to

  if (element) {
    if (property === 'scale') {
      from = 1
      to = 1.2
    } else if (property === 'opacity') {
      from = element.style.opacity ?? 1
      to = from < 0.5 ? 1 : 0.2
    } else if (element.style.shader) {
      const shader = element.style.shader
      if (property === 'shaderSpeed') {
        from = shader.speed
        to = Math.min(meta.max, from * 2 || 2)
      } else if (property === 'shaderScale') {
        from = shader.scale
        to = Math.min(meta.max, from * 1.5 || 2)
      } else if (property === 'shaderRotation') {
        from = shader.rotation
        to = from + 180
      } else if (property === 'shaderOffsetX') {
        from = shader.offsetX
        to = 0.3
      } else if (property === 'shaderOffsetY') {
        from = shader.offsetY
        to = 0.3
      } else if (property === 'shaderOpacity') {
        from = shader.composite?.opacity ?? 1
        to = from < 0.5 ? 1 : 0.2
      }
    }
  }

  return {
    id: crypto.randomUUID(),
    elementId,
    property,
    enabled: true,
    keyframes: [
      { id: crypto.randomUUID(), time: 0, value: from, easing: DEFAULT_EASING },
      { id: crypto.randomUUID(), time: duration, value: to, easing: DEFAULT_EASING },
    ],
  }
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

export function addKeyframeAtTime(track: MotionTrack, time: number, customValue?: number): { track: MotionTrack; keyframeId: string } | null {
  if (track.keyframes.length >= 200) return null
  const roundedTime = Math.round(time)
  if (track.keyframes.some(key => Math.abs(key.time - roundedTime) < 1)) return null
  const value = customValue !== undefined ? customValue : trackValue(track, roundedTime)
  const prevKey = track.keyframes.filter(k => k.time < roundedTime).at(-1)
  const nextKey = track.keyframes.find(k => k.time > roundedTime)
  const easing = prevKey?.easing ?? nextKey?.easing ?? DEFAULT_EASING
  const meta = PROPERTY_META[track.property]
  const clampedValue = Math.max(meta.min, Math.min(meta.max, Number(value.toFixed(3))))
  const newKey: MotionKeyframe = {
    id: crypto.randomUUID(),
    time: roundedTime,
    value: clampedValue,
    easing,
  }
  const keyframes = [...track.keyframes, newKey].sort((a, b) => a.time - b.time)
  return {
    track: { ...track, keyframes },
    keyframeId: newKey.id,
  }
}

export function deleteKeyframeFromTrack(track: MotionTrack, keyId: string): MotionTrack | null {
  if (track.keyframes.length <= 2) return null
  return {
    ...track,
    keyframes: track.keyframes.filter(k => k.id !== keyId),
  }
}

export function duplicateKeyframeInTrack(track: MotionTrack, keyId: string, duration: number, offsetMs = 100): { track: MotionTrack; newKeyId: string } | null {
  if (track.keyframes.length >= 200) return null
  const key = track.keyframes.find(k => k.id === keyId)
  if (!key) return null
  let targetTime = Math.min(duration, key.time + offsetMs)
  if (track.keyframes.some(k => Math.abs(k.time - targetTime) < 1)) {
    targetTime = Math.max(0, key.time - offsetMs)
    if (track.keyframes.some(k => Math.abs(k.time - targetTime) < 1)) return null
  }
  const newKey: MotionKeyframe = {
    id: crypto.randomUUID(),
    time: targetTime,
    value: key.value,
    easing: key.easing,
  }
  return {
    track: { ...track, keyframes: [...track.keyframes, newKey].sort((a, b) => a.time - b.time) },
    newKeyId: newKey.id,
  }
}

export function findAdjacentKeyframeTimes(motion: MotionDocument, currentTime: number): { prev: number | null; next: number | null } {
  const times = new Set<number>()
  for (const track of motion.tracks) {
    if (!track.enabled) continue
    for (const key of track.keyframes) {
      times.add(key.time)
    }
  }
  const sorted = Array.from(times).sort((a, b) => a - b)
  let prev: number | null = null
  let next: number | null = null
  for (const t of sorted) {
    if (t < currentTime - 1) prev = t
    else if (t > currentTime + 1 && next === null) next = t
  }
  return { prev, next }
}

export function formatTime(ms: number, fps = 60): { seconds: string; frames: string; full: string } {
  const s = ms / 1000
  const frames = Math.round((ms / 1000) * fps)
  return {
    seconds: `${s.toFixed(2)}s`,
    frames: `F${frames}`,
    full: `${s.toFixed(2)}s (${frames}f)`,
  }
}
