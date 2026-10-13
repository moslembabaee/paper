import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ViewportController } from '../canvas/ViewportController'
import type { Point } from '../canvas/types'
import { getWorldMatrix } from './geometry'
import { moveAnchor, parsePath, pathBounds, serializePath, snapPathPoint } from './pathGeometry'
import type { PathAnchor, PathContour } from './pathGeometry'
import { getPixelSnap, subscribePixelSnap, togglePixelSnap } from './pixelSnap'
import type { SceneStore } from './store'
import type { PathElement } from './types'
import { useScene } from './useScene'
import './pen.css'

interface Session { contours: PathContour[]; id: string | null; parentId: string | null }
interface Gesture { pointerId: number; contour: number; anchor: number; handle?: 'in' | 'out'; start: Point; original: PathAnchor; moved: boolean; creating: boolean }
interface Props { store: SceneStore; controller: ViewportController; editingId: string | null; penMode: boolean; onFinish: () => void }
const copyContours = (contours: PathContour[]) => contours.map(c => ({ ...c, anchors: c.anchors.map(a => ({ ...a, in: a.in && { ...a.in }, out: a.out && { ...a.out } })) }))
const mapPoint = (matrix: readonly number[], p: Point): Point => ({ x: matrix[0] * p.x + matrix[2] * p.y + matrix[4], y: matrix[1] * p.x + matrix[3] * p.y + matrix[5] })
const inversePoint = (matrix: readonly number[], p: Point): Point => {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2], x = p.x - matrix[4], y = p.y - matrix[5]
  return { x: (matrix[3] * x - matrix[2] * y) / determinant, y: (-matrix[1] * x + matrix[0] * y) / determinant }
}

/** Draft geometry is transient. Pointer updates are coalesced to one animation frame. */
export function PenOverlay({ store, controller, editingId, penMode, onFinish }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [initial] = useState(() => {
    const node = editingId ? store.getSnapshot().elements[editingId] : undefined
    const session: Session = { contours: [], id: null, parentId: null }
    if (node?.type !== 'path' || store.isLocked(node.id) || !store.isVisible(node.id)) return { session, error: '' }
    try { return { session: { contours: parsePath(node.d), id: node.id, parentId: node.parentId }, error: '' } }
    catch (error) { return { session, error: (error as Error).message } }
  })
  const [session, setSession] = useState(initial.session)
  const sessionRef = useRef<Session>(initial.session)
  const finishRef = useRef<() => void>(() => {})
  const callbackRef = useRef(onFinish)
  useLayoutEffect(() => { callbackRef.current = onFinish }, [onFinish])
  const [hover, setHover] = useState<Point | null>(null)
  const [selected, setSelected] = useState<{ contour: number; anchor: number } | null>(null)
  const selectedRef = useRef(selected)
  const [snapping, setSnapping] = useState(getPixelSnap)
  const snappingRef = useRef(snapping)
  useLayoutEffect(() => { snappingRef.current = snapping }, [snapping])
  useEffect(() => subscribePixelSnap(setSnapping), [])
  const [error, setError] = useState(initial.error)
  const redraw = () => { const session = sessionRef.current; setSession({ ...session, contours: copyContours(session.contours) }) }
  const state = useScene(store, value => value)
  const [camera, setCamera] = useState(() => controller.getSnapshot().camera)
  const node = session.id ? state.elements[session.id] as PathElement | undefined : undefined
  const toWorld = (p: Point): Point => {
    if (node?.type === 'path') return mapPoint(getWorldMatrix(state, node.id), { x: (p.x - node.viewBox[0]) * node.width / node.viewBox[2], y: (p.y - node.viewBox[1]) * node.height / node.viewBox[3] })
    return session.parentId ? mapPoint(getWorldMatrix(state, session.parentId), p) : p
  }
  const screen = (p: Point): Point => ({ x: toWorld(p).x * camera.zoom + camera.x, y: toWorld(p).y * camera.zoom + camera.y })
  const screenContours = session.contours.map(c => ({ ...c, anchors: c.anchors.map(a => ({ ...screen(a), ...(a.in ? { in: screen(a.in) } : {}), ...(a.out ? { out: screen(a.out) } : {}) })) }))

  useLayoutEffect(() => {
    const root = rootRef.current!, viewport = root.closest<HTMLElement>('.canvas-viewport')!
    let gesture: Gesture | null = null, frame = 0, pending: PointerEvent | null = null
    let dragBefore: PathContour[] | null = null
    const localPoint = (event: PointerEvent): Point => {
      const rect = root.getBoundingClientRect(), world = controller.screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top })
      const s = sessionRef.current, state = store.getSnapshot(), node = s.id ? state.elements[s.id] : undefined
      if (node?.type === 'path') {
        const p = inversePoint(getWorldMatrix(state, node.id), world)
        return { x: p.x / node.width * node.viewBox[2] + node.viewBox[0], y: p.y / node.height * node.viewBox[3] + node.viewBox[1] }
      }
      return s.parentId ? inversePoint(getWorldMatrix(state, s.parentId), world) : world
    }
    const publish = () => {
      const s = sessionRef.current, node = s.id ? store.getSnapshot().elements[s.id] : undefined
      if (node?.type === 'path' && !store.isLocked(node.id) && store.isVisible(node.id)) store.update(node.id, 'path', { d: serializePath(s.contours) })
      redraw()
    }
    const choose = (contour: number, anchor: number) => { selectedRef.current = { contour, anchor }; setSelected({ contour, anchor }) }
    const normalize = () => {
      const s = sessionRef.current, node = s.id ? store.getSnapshot().elements[s.id] : undefined
      if (node?.type !== 'path' || !s.contours.some(c => c.anchors.length > 1)) return
      const bounds = pathBounds(s.contours, (node.style.stroke?.width ?? 0) / 2)
      const sx = node.width / node.viewBox[2], sy = node.height / node.viewBox[3]
      const width = bounds.width * sx, height = bounds.height * sy
      const dx = (bounds.x - node.viewBox[0]) * sx + (width - node.width) / 2
      const dy = (bounds.y - node.viewBox[1]) * sy + (height - node.height) / 2
      const angle = node.rotation * Math.PI / 180
      store.update(node.id, 'path', { x: node.x + Math.cos(angle) * dx - Math.sin(angle) * dy - (width - node.width) / 2, y: node.y + Math.sin(angle) * dx + Math.cos(angle) * dy - (height - node.height) / 2, width, height, viewBox: [bounds.x, bounds.y, bounds.width, bounds.height] })
    }
    const stopGesture = (cancel = false) => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0; pending = null
      const previous = gesture; gesture = null
      if (previous && dragBefore && cancel) sessionRef.current.contours = dragBefore
      dragBefore = null
      if (previous && !previous.creating) { if (cancel) store.cancelTransaction(); else { normalize(); store.endTransaction() } }
      if (previous && root.hasPointerCapture(previous.pointerId)) root.releasePointerCapture(previous.pointerId)
      redraw()
    }
    const commit = () => {
      const s = sessionRef.current
      if (s.id || s.contours.every(c => c.anchors.length < 2)) return
      const contours = s.contours.filter(c => c.anchors.length > 1), bounds = pathBounds(contours)
      store.batch(() => {
        let parentId = s.parentId
        if (parentId && !store.getSnapshot().elements[parentId]) parentId = null
        const container = parentId ? null : store.add('frame', { name: 'Vector', ...bounds, clipContent: false, style: { fill: null } })
        const path = store.add('path', { name: 'Pen path', parentId: parentId ?? container!.id, x: container ? 0 : bounds.x, y: container ? 0 : bounds.y, width: bounds.width, height: bounds.height, d: serializePath(contours), viewBox: [bounds.x, bounds.y, bounds.width, bounds.height], style: { fill: contours.some(c => c.closed) ? '#81adec' : null, stroke: { color: '#080808', width: 2, dash: [] } } })
        store.select([path.id])
        s.id = path.id
      }, 'Draw vector path')
    }
    const finish = () => { stopGesture(); commit(); callbackRef.current() }
    finishRef.current = finish
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === 'touch' || viewport.dataset.space === 'true' || viewport.dataset.panning === 'true' || gesture || event.detail > 1) return
      const target = event.target as Element
      if (target.closest('.viewport-ui')) return
      const s = sessionRef.current
      if (editingId && !s.contours.length) return
      event.preventDefault(); viewport.focus({ preventScroll: true }); controller.stop()
      let contourIndex: number, anchorIndex: number, handle: 'in' | 'out' | undefined
      const control = target.closest<SVGElement>('[data-anchor]')
      if (control) {
        contourIndex = Number(control.dataset.contour); anchorIndex = Number(control.dataset.anchor); handle = control.dataset.control as typeof handle
        const contour = s.contours[contourIndex]
        if (penMode && anchorIndex === 0 && !contour.closed && s.contours[contourIndex].anchors.length > 1) { contour.closed = true; publish(); finish(); return }
        if (s.id && penMode && event.altKey && !handle) {
          const anchor = contour.anchors[anchorIndex]
          const changed = { x: anchor.x, y: anchor.y }
          contour.anchors[anchorIndex] = changed; publish(); choose(contourIndex, anchorIndex); return
        }
      } else {
        if (!penMode) { choose(-1, -1); return }
        if (!s.contours.length) {
          // Hit-test under the drawing surface so paths stay inside the clicked frame.
          const hit = document.elementsFromPoint(event.clientX, event.clientY).map(e => e.closest<HTMLElement>('[data-element-id]')).find(Boolean)
          let candidate = hit?.dataset.elementId ? store.getSnapshot().elements[hit.dataset.elementId] : undefined
          if (candidate && candidate.type !== 'frame') candidate = candidate.parentId ? store.getSnapshot().elements[candidate.parentId] : undefined
          if (candidate?.type === 'frame' && !store.isLocked(candidate.id)) s.parentId = candidate.id
        }
        let contour = s.contours.at(-1)
        if (!contour || contour.closed) { contour = { anchors: [], closed: false }; s.contours.push(contour) }
        contourIndex = s.contours.length - 1
        let p = snapPathPoint(localPoint(event), snappingRef.current && !event.altKey)
        const last = contour.anchors.at(-1)
        if (event.shiftKey && last) {
          const angle = Math.round(Math.atan2(p.y - last.y, p.x - last.x) / (Math.PI / 4)) * Math.PI / 4, length = Math.hypot(p.x - last.x, p.y - last.y)
          p = { x: last.x + Math.cos(angle) * length, y: last.y + Math.sin(angle) * length }
        }
        if (s.id) store.beginTransaction('Extend vector path')
        dragBefore = copyContours(s.contours)
        contour.anchors.push({ ...p }); anchorIndex = contour.anchors.length - 1
      }
      if (control) {
        if (s.id) store.beginTransaction('Edit path points')
        dragBefore = copyContours(s.contours)
      }
      const anchor = s.contours[contourIndex].anchors[anchorIndex]
      gesture = { pointerId: event.pointerId, contour: contourIndex, anchor: anchorIndex, handle, start: localPoint(event), original: { ...anchor }, moved: false, creating: !s.id }
      choose(contourIndex, anchorIndex); publish(); setHover(null); root.setPointerCapture(event.pointerId)
    }
    const applyMove = (event: PointerEvent) => {
      let p = snapPathPoint(localPoint(event), snappingRef.current && !event.altKey)
      if (!gesture) { setHover(penMode ? p : null); return }
      const g = gesture, s = sessionRef.current, anchor = s.contours[g.contour]?.anchors[g.anchor]
      if (!anchor) return
      const scale = controller.getSnapshot().camera.zoom
      if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) * scale < 2) return
      g.moved = true
      if (event.shiftKey && (g.handle || g.creating || penMode)) {
        const angle = Math.round(Math.atan2(p.y - anchor.y, p.x - anchor.x) / (Math.PI / 4)) * Math.PI / 4, length = Math.hypot(p.x - anchor.x, p.y - anchor.y)
        p = { x: anchor.x + Math.cos(angle) * length, y: anchor.y + Math.sin(angle) * length }
      }
      if (g.handle) {
        anchor[g.handle] = p
        if (!event.altKey) {
          const other = g.handle === 'in' ? 'out' : 'in', originalOther = g.original[other]
          if (originalOther) {
            const length = Math.hypot(originalOther.x - g.original.x, originalOther.y - g.original.y), distance = Math.hypot(p.x - anchor.x, p.y - anchor.y)
            if (distance) anchor[other] = { x: anchor.x - (p.x - anchor.x) * length / distance, y: anchor.y - (p.y - anchor.y) * length / distance }
          }
        }
      } else if (g.creating || penMode) {
        anchor.out = p; anchor.in = event.altKey ? undefined : { x: 2 * anchor.x - p.x, y: 2 * anchor.y - p.y }
      } else s.contours[g.contour].anchors[g.anchor] = moveAnchor(g.original, { x: g.original.x + p.x - g.start.x, y: g.original.y + p.y - g.start.y })
      publish()
    }
    const move = (event: PointerEvent) => {
      if (gesture && gesture.pointerId !== event.pointerId) return
      if ((event.target as Element).closest('.viewport-ui') || viewport.dataset.space === 'true' || viewport.dataset.panning === 'true') return
      pending = event
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (pending) applyMove(pending); pending = null })
    }
    const up = (event: PointerEvent) => { if (gesture?.pointerId === event.pointerId) { if (event.type === 'pointerup') applyMove(event); stopGesture(event.type === 'pointercancel') } }
    const keydown = (event: KeyboardEvent) => {
      if ((event.target as Element).closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (gesture) stopGesture(true); else finish() }
      if (event.key === 'Enter') { event.preventDefault(); event.stopImmediatePropagation(); finish() }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === "'" || event.key === '"' || event.code === 'Quote')) { event.preventDefault(); togglePixelSnap(); return }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); event.stopImmediatePropagation(); stopGesture()
        const s = sessionRef.current, chosen = selectedRef.current
        if (chosen) {
          s.contours[chosen.contour]?.anchors.splice(chosen.anchor, 1)
          s.contours = s.contours.filter(c => c.anchors.length)
          if (s.id && !s.contours.some(c => c.anchors.length > 1)) { store.remove(s.id); callbackRef.current() }
          else store.batch(() => { publish(); normalize() }, 'Delete path point')
          selectedRef.current = null; setSelected(null)
        }
      }
    }
    const doubleClick = (event: MouseEvent) => { if (!(event.target as Element).closest('.viewport-ui')) finish() }
    const blur = () => stopGesture(true)
    const lostCapture = () => { if (gesture) stopGesture(true) }
    root.addEventListener('pointerdown', down); viewport.addEventListener('pointermove', move)
    root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up); root.addEventListener('lostpointercapture', lostCapture)
    root.addEventListener('dblclick', doubleClick); document.addEventListener('keydown', keydown, true); window.addEventListener('blur', blur)
    const unsubscribeCamera = controller.subscribe(snapshot => setCamera(snapshot.camera))
    const unsubscribeStore = store.subscribe(() => {
      const s = sessionRef.current, node = s.id ? store.getSnapshot().elements[s.id] : undefined
      if (!gesture && node?.type === 'path' && node.d !== serializePath(s.contours)) {
        try { s.contours = parsePath(node.d); setError('') } catch (e) { setError((e as Error).message) }
      }
      redraw()
    })
    return () => {
      root.removeEventListener('pointerdown', down); viewport.removeEventListener('pointermove', move)
      root.removeEventListener('pointerup', up); root.removeEventListener('pointercancel', up); root.removeEventListener('lostpointercapture', lostCapture)
      root.removeEventListener('dblclick', doubleClick); document.removeEventListener('keydown', keydown, true); window.removeEventListener('blur', blur)
      unsubscribeCamera(); unsubscribeStore(); stopGesture(); commit()
    }
  }, [store, controller, editingId, penMode])

  let preview = serializePath(screenContours)
  const lastContour = screenContours.at(-1), last = lastContour?.anchors.at(-1)
  if (penMode && hover && last && !lastContour!.closed) {
    const next = screen(hover)
    preview += last.out ? ` C ${last.out.x} ${last.out.y} ${next.x} ${next.y} ${next.x} ${next.y}` : ` L ${next.x} ${next.y}`
  }
  return <div ref={rootRef} className={`pen-overlay ${penMode ? 'is-pen' : 'is-path-edit'}`} data-testid="pen-overlay">
    <svg className="pen-geometry" aria-label="Path anchors and Bézier handles">
      <path className="pen-preview" data-testid="pen-preview" d={preview} />
      {screenContours.map((c, ci) => c.anchors.map((a, ai) => <g key={`${ci}-${ai}`}>
        {(['in', 'out'] as const).map(handle => a[handle] ? <g key={handle}><line x1={a.x} y1={a.y} x2={a[handle].x} y2={a[handle].y} className="pen-handle-line" /><circle cx={a[handle].x} cy={a[handle].y} r={4} className="pen-control" data-contour={ci} data-anchor={ai} data-control={handle} aria-label={`${handle === 'in' ? 'Incoming' : 'Outgoing'} handle ${ai + 1}`} /></g> : null)}
        <rect x={a.x - 4} y={a.y - 4} width={8} height={8} className={`pen-anchor ${selected?.contour === ci && selected.anchor === ai ? 'is-active' : ''}`} data-contour={ci} data-anchor={ai} aria-label={`Anchor ${ai + 1}`} />
      </g>))}
    </svg>
    <div className="pen-help viewport-ui" role="status"><span className="pen-tool-label">{editingId ? 'EDIT PATH' : 'PEN'}</span><span>{error || (penMode ? 'Click for a corner · Drag for a curve · Click first point to close' : 'Drag points or handles · Alt to break a handle · P to extend')}</span><button aria-pressed={snapping} onClick={() => togglePixelSnap()} title="Snap to half pixels · ⌘⇧'">Pixel snap</button><button onClick={() => finishRef.current()}>Done <kbd>↵</kbd></button></div>
  </div>
}
