import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import type { MeshAnchor } from './types'
import { clampUnit } from './mesh'

interface Props {
  index: number
  selected?: boolean
  color: string
  anchor: MeshAnchor
  style: CSSProperties
  project: (x: number, y: number) => { x: number; y: number }
  onMove: (point: { x: number; y: number }) => void
  onStart?: () => boolean | void
  onEnd?: (cancel: boolean) => void
}

/** Capture survives leaving the material; pointer edits publish at most once per frame. */
export function MeshAnchorHandle(props: Props) {
  const latest = useRef(props)
  const gesture = useRef<{ pointer: number; frame: number; point: { x: number; y: number } | null } | null>(null)
  useLayoutEffect(() => { latest.current = props })
  const flush = () => {
    const drag = gesture.current
    if (!drag) return
    cancelAnimationFrame(drag.frame)
    drag.frame = 0
    if (drag.point) { latest.current.onMove(drag.point); drag.point = null }
  }
  const finish = (cancel: boolean) => {
    const drag = gesture.current
    if (!drag) return
    if (cancel) cancelAnimationFrame(drag.frame)
    else flush()
    gesture.current = null
    latest.current.onEnd?.(cancel)
  }
  useLayoutEffect(() => {
    const blur = () => finish(true)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('blur', blur); finish(true) }
  }, [])
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = gesture.current
    if (!drag || drag.pointer !== event.pointerId) return
    event.stopPropagation()
    drag.point = latest.current.project(event.clientX, event.clientY)
    if (!drag.frame) drag.frame = requestAnimationFrame(flush)
  }
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); finish(true); return }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!delta || gesture.current) return
    event.preventDefault(); event.stopPropagation()
    const { anchor, onStart, onMove, onEnd } = latest.current
    if (onStart?.() === false) return
    const step = event.shiftKey ? .1 : .01
    onMove({ x: clampUnit(anchor.x + delta[0] * step), y: clampUnit(anchor.y + delta[1] * step) })
    onEnd?.(false)
  }
  return <button type="button" className="mesh-anchor viewport-ui" style={{ ...props.style, background: props.color }} aria-pressed={props.selected} aria-label={`Mesh anchor ${props.index + 1}`} title={`Color ${props.index + 1} · Drag or use arrow keys`} onKeyDown={key}
    onClick={event => event.stopPropagation()}
    onPointerDown={event => {
      if (event.button !== 0 || gesture.current) return
      event.preventDefault(); event.stopPropagation()
      if (latest.current.onStart?.() === false) return
      event.currentTarget.focus({ preventScroll: true })
      event.currentTarget.setPointerCapture(event.pointerId)
      gesture.current = { pointer: event.pointerId, frame: 0, point: null }
    }} onPointerMove={move}
    onPointerUp={event => { if (gesture.current?.pointer !== event.pointerId) return; move(event); finish(false); event.currentTarget.releasePointerCapture(event.pointerId) }}
    onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}><span>{props.index + 1}</span></button>
}
