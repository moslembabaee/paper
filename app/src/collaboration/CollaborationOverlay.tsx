import { memo, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { ViewportController } from '../canvas/ViewportController'
import type { Point } from '../canvas/types'
import type { SceneStore } from '../scene/store'
import { getWorldMatrix } from '../scene/geometry'
import { useScene } from '../scene/useScene'
import type { CollaborationSession } from './session'
import './collaboration.css'

export const CollaborationOverlay = memo(function CollaborationOverlay({ session, store, controller }: { session: CollaborationSession; store: SceneStore; controller: ViewportController }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const scene = useScene(store, snapshot => snapshot)
  const root = useRef<HTMLDivElement>(null)
  const positions = useRef(new Map<string, Point>())
  const cursors = useRef(new Map<string, HTMLDivElement>())
  const selections = useRef(new Map<string, HTMLDivElement>())
  const peers = useRef(state.peers)
  const repaint = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    peers.current = state.peers
    for (const id of positions.current.keys()) if (!state.peers.some(peer => peer.id === id && peer.cursor)) positions.current.delete(id)
    repaint.current()
  }, [state.peers, scene])

  useLayoutEffect(() => {
    const viewport = root.current!.closest<HTMLElement>('.canvas-viewport')!
    let frame: number | null = null, previousTime = 0
    let geometryDirty = true
    let pointer: Point | null = null
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const paint = (time: number) => {
      frame = null
      const dt = previousTime ? Math.min(64, time - previousTime) : 16.67
      previousTime = time
      const alpha = motion.matches ? 1 : 1 - Math.exp(-dt / 45)
      const { camera } = controller.getSnapshot(), scene = store.getSnapshot()
      let moving = false
      for (const peer of peers.current) {
        if (peer.cursor) {
          const before = positions.current.get(peer.id) ?? peer.cursor
          const point = { x: before.x + (peer.cursor.x - before.x) * alpha, y: before.y + (peer.cursor.y - before.y) * alpha }
          if (Math.hypot(point.x - peer.cursor.x, point.y - peer.cursor.y) * camera.zoom > .15) moving = true
          else Object.assign(point, peer.cursor)
          positions.current.set(peer.id, point)
          const cursor = cursors.current.get(peer.id)
          if (cursor) { cursor.style.transform = `translate3d(${point.x * camera.zoom + camera.x}px, ${point.y * camera.zoom + camera.y}px, 0)`; cursor.style.visibility = 'visible' }
        }
        if (geometryDirty) for (const id of peer.selection) {
          const node = scene.elements[id]
          if (!node || !store.isVisible(id)) continue
          const box = selections.current.get(`${peer.id}:${id}`)
          if (!box) continue
          const [a, b, c, d, e, f] = getWorldMatrix(scene, id)
          box.style.width = `${node.width * camera.zoom}px`; box.style.height = `${node.height * camera.zoom}px`
          box.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e * camera.zoom + camera.x}, ${f * camera.zoom + camera.y})`
          box.style.visibility = 'visible'
        }
      }
      geometryDirty = false
      if (moving) schedule()
      else previousTime = 0
    }
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(paint) }
    repaint.current = () => { geometryDirty = true; schedule() }
    const unsubscribe = controller.subscribe(() => { geometryDirty = true; schedule(); if (pointer) session.setCursor(controller.screenToWorld(pointer)) })
    const cursor = (event: PointerEvent) => {
      if ((event.target as Element).closest('.viewport-ui, button, input, textarea, select, [contenteditable="true"]')) { pointer = null; session.setCursor(null); return }
      const rect = viewport.getBoundingClientRect(), inset = viewport.dataset.rulers === 'true' ? 20 : 0
      pointer = { x: event.clientX - rect.left - inset, y: event.clientY - rect.top - inset }
      if (pointer.x < 0 || pointer.y < 0 || pointer.x >= rect.width - inset || pointer.y >= rect.height - inset) { pointer = null; session.setCursor(null); return }
      session.setCursor(controller.screenToWorld(pointer))
    }
    const leave = () => { pointer = null; session.setCursor(null) }
    const interrupt = (event: Event) => {
      if (event instanceof KeyboardEvent && !['Escape', ' ', '+', '-', '=', '0', '1'].includes(event.key)) return
      if (event instanceof KeyboardEvent && event.key !== 'Escape' && !pointer && !viewport.contains(document.activeElement)) return
      if (event instanceof KeyboardEvent && event.key !== 'Escape' && (event.target as Element).closest('input, textarea, select, [contenteditable="true"]')) return
      if (session.getSnapshot().following) { session.follow(null); controller.stop() }
    }
    viewport.addEventListener('pointermove', cursor, true)
    viewport.addEventListener('pointerleave', leave)
    viewport.addEventListener('pointerdown', interrupt, true)
    viewport.addEventListener('wheel', interrupt, true)
    document.addEventListener('keydown', interrupt, true)
    window.addEventListener('blur', leave)
    schedule()
    return () => {
      unsubscribe(); if (frame !== null) cancelAnimationFrame(frame)
      repaint.current = () => {}
      viewport.removeEventListener('pointermove', cursor, true); viewport.removeEventListener('pointerleave', leave)
      viewport.removeEventListener('pointerdown', interrupt, true); viewport.removeEventListener('wheel', interrupt, true); document.removeEventListener('keydown', interrupt, true)
      window.removeEventListener('blur', leave)
    }
  }, [session, store, controller])
  const following = state.peers.find(peer => peer.id === state.following)
  return <>
    <div ref={root} className="collaboration-overlay" aria-hidden="true" data-testid="collaboration-overlay">
      {state.peers.filter(peer => peer.status !== 'away').map(peer => <div key={peer.id} style={{ '--presence-color': peer.color } as CSSProperties}>
        {peer.selection.filter(id => scene.elements[id] && store.isVisible(id)).map(id => <div key={id} ref={node => { const key = `${peer.id}:${id}`; if (node) selections.current.set(key, node); else selections.current.delete(key) }} className="remote-selection" data-selection-key={`${peer.id}:${id}`} data-remote-element-id={id}><span>{peer.name}</span></div>)}
        {peer.cursor && <div ref={node => { if (node) cursors.current.set(peer.id, node); else cursors.current.delete(peer.id) }} className="remote-cursor" data-cursor-id={peer.id} data-testid="remote-cursor"><svg width="19" height="24" viewBox="0 0 19 24"><path d="M1.5 1.5v18l4.7-4.1 3.3 7.1 3.4-1.6-3.3-7.1 6.4-.4L1.5 1.5Z" fill={peer.color} stroke="#080808" strokeWidth="1.3" strokeLinejoin="round" /></svg><span>{peer.name}</span></div>}
      </div>)}
    </div>
    {following && <div className="follow-banner viewport-ui" role="status"><span style={{ background: following.color }} /><span>Following <strong>{following.name}</strong></span><button onClick={() => session.follow(null)}>Stop following <kbd>Esc</kbd></button></div>}
  </>
})
