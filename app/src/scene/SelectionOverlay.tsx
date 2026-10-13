import { memo, useLayoutEffect, useRef, useState } from 'react'
import type { ViewportController } from '../canvas'
import type { Bounds, Point } from '../canvas/types'
import { getWorldBounds } from './geometry'
import { captureOrigins, moveGeometry, resizedBox, resizeGeometry, rotateGeometry, selectionBounds, selectionBox, selectionRoots } from './selectionGeometry'
import type { ResizeHandle, SelectionBox, TransformOrigin } from './selectionGeometry'
import { computeSnap } from './snapEngine'
import type { SnapGuide } from './snapEngine'
import { SnapGuides } from './SnapGuides'
import type { SceneStore } from './store'
import type { ElementGeometry } from './types'
import { useScene } from './useScene'
import './selection.css'
import { MeasurementHUD } from './MeasurementHUD'

type HandleId = ResizeHandle | 'rotate'
const HANDLES: readonly { id: ResizeHandle; x: number; y: number; angle: number }[] = [
  { id: 'nw', x: 0, y: 0, angle: 45 }, { id: 'n', x: .5, y: 0, angle: 90 },
  { id: 'ne', x: 1, y: 0, angle: 135 }, { id: 'e', x: 1, y: .5, angle: 0 },
  { id: 'se', x: 1, y: 1, angle: 45 }, { id: 's', x: .5, y: 1, angle: 90 },
  { id: 'sw', x: 0, y: 1, angle: 135 }, { id: 'w', x: 0, y: .5, angle: 0 },
]
const resizeCursor = (angle: number) => ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][((Math.round(angle / 45) % 4) + 4) % 4]
interface Gesture {
  pointerId: number
  start: Point
  screenStart: Point
  origins: TransformOrigin[]
  initialSelection: readonly string[]
  targets: Bounds[]
  moved: boolean
  cursor: string
}
type Drag = Gesture & (
  | { type: 'marquee'; additive: boolean; candidates: { id: string; bounds: Bounds }[] }
  | { type: 'move'; bounds: Bounds }
  | { type: 'resize'; box: SelectionBox; handle: ResizeHandle }
  | { type: 'rotate'; box: SelectionBox; startAngle: number }
)
interface Props { store: SceneStore; controller: ViewportController; panMode: boolean }

/** Screen-space affordances; scene hits and viewport navigation remain unobstructed. */
export const SelectionOverlay = memo(function SelectionOverlay({ store, controller, panMode }: Props) {
  const state = useScene(store, snapshot => snapshot)
  const [camera, setCamera] = useState(() => controller.getSnapshot().camera)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [marquee, setMarquee] = useState<Bounds | null>(null)
  const [activeCursor, setActiveCursor] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const box = selectionBox(state, state.selection)

  useLayoutEffect(() => controller.subscribe(snapshot => setCamera(snapshot.camera)), [controller])

  useLayoutEffect(() => {
    const overlay = overlayRef.current!
    const viewport = overlay.closest<HTMLElement>('.canvas-viewport')!
    let drag: Drag | null = null
    let frame: number | null = null
    let pending: PointerEvent | null = null
    const worldPoint = (event: PointerEvent): Point => {
      const rect = overlay.getBoundingClientRect()
      return controller.screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    const update = (origins: TransformOrigin[], geometry: (origin: TransformOrigin) => ElementGeometry) => store.batch(() => {
      for (const origin of origins) {
        const node = store.getSnapshot().elements[origin.id]
        if (node && store.isVisible(node.id) && !store.isLocked(node.id)) store.update(node.id, node.type, geometry(origin))
      }
    })
    const reset = (restore = false) => {
      const previous = drag
      drag = null
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      pending = null
      if (previous) {
        if (previous.type !== 'marquee') {
          if (restore) store.cancelTransaction()
          else store.endTransaction()
        }
        if (restore) store.select(previous.initialSelection)
      }
      if (previous && overlay.hasPointerCapture(previous.pointerId)) overlay.releasePointerCapture(previous.pointerId)
      setGuides([])
      setMarquee(null)
      setActiveCursor(null)
    }
    const applyPointer = (event: PointerEvent) => {
      if (!drag) return
      // Preserve click selection, and avoid rounding/snapping before a real drag.
      if (!drag.moved && Math.hypot(event.clientX - drag.screenStart.x, event.clientY - drag.screenStart.y) < 2) return
      drag.moved = true
      const point = worldPoint(event)
      const delta = { x: point.x - drag.start.x, y: point.y - drag.start.y }
      const zoom = controller.getSnapshot().camera.zoom
      if (drag.type === 'marquee') {
        const bounds = { x: Math.min(drag.start.x, point.x), y: Math.min(drag.start.y, point.y), width: Math.abs(delta.x), height: Math.abs(delta.y) }
        setMarquee(bounds)
        const hits = drag.candidates.filter(({ bounds: b }) => b.x < bounds.x + bounds.width && b.x + b.width > bounds.x && b.y < bounds.y + bounds.height && b.y + b.height > bounds.y).map(candidate => candidate.id)
        const snapshot = store.getSnapshot()
        store.select(selectionRoots(snapshot, [...(drag.additive ? drag.initialSelection : []), ...hits]))
      } else if (drag.type === 'move') {
        if (event.shiftKey) {
          if (Math.abs(delta.x) > Math.abs(delta.y)) delta.y = 0
          else delta.x = 0
        }
        if (!event.altKey) {
          const snap = computeSnap({ ...drag.bounds, x: drag.bounds.x + delta.x, y: drag.bounds.y + delta.y }, drag.targets, 8 / zoom, {
            xAnchors: event.shiftKey && delta.x === 0 ? [] : undefined,
            yAnchors: event.shiftKey && delta.y === 0 ? [] : undefined,
            distances: !event.shiftKey,
          })
          delta.x += snap.dx
          delta.y += snap.dy
          setGuides(snap.guides)
        } else setGuides([])
        update(drag.origins, origin => moveGeometry(origin, delta))
      } else if (drag.type === 'resize') {
        let after = resizedBox(drag.box, drag.handle, delta, event.shiftKey)
        // Edge snapping uses the moving handle only, preserving its fixed anchor.
        if (!event.altKey && !event.shiftKey && Math.abs(drag.box.rotation % 360) < 1e-6) {
          const snap = computeSnap(after, drag.targets, 8 / zoom, {
            xAnchors: drag.handle.includes('e') ? [1] : drag.handle.includes('w') ? [0] : [],
            yAnchors: drag.handle.includes('s') ? [1] : drag.handle.includes('n') ? [0] : [], distances: false,
          })
          after = resizedBox(drag.box, drag.handle, { x: delta.x + snap.dx, y: delta.y + snap.dy }, false)
          setGuides(snap.guides)
        } else setGuides([])
        const before = drag.box
        update(drag.origins, origin => resizeGeometry(origin, before, after))
      } else {
        const center = { x: drag.box.x + drag.box.width / 2, y: drag.box.y + drag.box.height / 2 }
        let degrees = (Math.atan2(point.y - center.y, point.x - center.x) - drag.startAngle) * 180 / Math.PI
        if (event.shiftKey) degrees = Math.round(degrees / 15) * 15
        update(drag.origins, origin => rotateGeometry(origin, center, degrees))
      }
    }
    const down = (event: PointerEvent) => {
      if (panMode || event.button !== 0 || event.pointerType === 'touch' || drag || viewport.dataset.space === 'true' || viewport.dataset.panning === 'true') return
      const target = event.target
      if (!(target instanceof Element) || target.closest('.viewport-ui, input, textarea, select, button, a, [contenteditable="true"]')) return
      const rect = overlay.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientY < rect.top) return
      const initial = store.getSnapshot()
      const initialSelection = initial.selection
      const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as HandleId | undefined
      // The box can sit above another selectable layer, especially inside frames.
      const sceneHit = target.closest<HTMLElement>('[data-element-id]') ?? (target.closest('.sel-box') && !handle
        ? document.elementsFromPoint(event.clientX, event.clientY).map(element => element.closest<HTMLElement>('[data-element-id]')).find(element => element !== null)
        : null)
      const nodeId = sceneHit?.dataset.elementId
      const point = worldPoint(event)
      const gesture: Gesture = { pointerId: event.pointerId, start: point, screenStart: { x: event.clientX, y: event.clientY }, initialSelection, targets: [], origins: [], moved: false, cursor: 'move' }
      if (handle) {
        const bounds = selectionBox(initial, initial.selection)
        if (!bounds) return
        if (handle === 'rotate') drag = { ...gesture, type: 'rotate', box: bounds, cursor: 'crosshair', startAngle: Math.atan2(point.y - bounds.y - bounds.height / 2, point.x - bounds.x - bounds.width / 2) }
        else drag = { ...gesture, type: 'resize', box: bounds, handle, cursor: resizeCursor(bounds.rotation + HANDLES.find(h => h.id === handle)!.angle) }
      } else if (nodeId) {
        if (!store.isVisible(nodeId) || store.isLocked(nodeId)) return
        if (event.shiftKey) {
          store.select(initialSelection.includes(nodeId) ? initialSelection.filter(id => id !== nodeId) : [...initialSelection, nodeId])
          return
        }
        if (!initialSelection.includes(nodeId)) store.select([nodeId])
        const bounds = selectionBounds(store.getSnapshot(), store.getSnapshot().selection)!
        drag = { ...gesture, type: 'move', bounds }
      } else if (target.closest('.sel-box')) {
        const bounds = selectionBounds(initial, initial.selection)
        if (!bounds) return
        drag = { ...gesture, type: 'move', bounds }
      } else {
        if (!event.shiftKey) store.select([])
        drag = { ...gesture, type: 'marquee', additive: event.shiftKey, cursor: 'crosshair', candidates: Object.keys(initial.elements).filter(id => store.isVisible(id) && !store.isLocked(id)).map(id => ({ id, bounds: getWorldBounds(initial, id) })) }
      }
      if (drag.type !== 'marquee') {
        const snapshot = store.getSnapshot()
        store.beginTransaction(drag.type === 'move' ? 'Move elements' : drag.type === 'resize' ? 'Resize elements' : 'Rotate elements')
        drag.origins = captureOrigins(snapshot, snapshot.selection)
        const selected = new Set(drag.origins.map(origin => origin.id))
        drag.targets = Object.values(snapshot.elements).filter(node => {
          if (!store.isVisible(node.id)) return false
          let current: typeof node | undefined = node
          while (current) {
            if (selected.has(current.id)) return false
            current = current.parentId === null ? undefined : snapshot.elements[current.parentId]
          }
          return true
        }).map(node => getWorldBounds(snapshot, node.id))
      }
      controller.stop()
      viewport.focus({ preventScroll: true })
      event.preventDefault()
      overlay.setPointerCapture(event.pointerId)
      setActiveCursor(drag.cursor)
    }
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      pending = event
      if (frame === null) frame = requestAnimationFrame(() => {
        frame = null
        const latest = pending
        pending = null
        if (latest) applyPointer(latest)
      })
    }
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      if (event.type === 'pointerup') applyPointer(event)
      reset(event.type === 'pointercancel')
    }
    const lostCapture = () => reset(true)
    const keydown = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return
      if (event.key === 'Escape' && (drag || viewport.contains(document.activeElement))) {
        event.preventDefault()
        if (drag) reset(true)
        else store.select([])
      }
    }
    const blur = () => reset(true)
    viewport.addEventListener('pointerdown', down)
    viewport.addEventListener('pointermove', move)
    viewport.addEventListener('pointerup', up)
    viewport.addEventListener('pointercancel', up)
    overlay.addEventListener('lostpointercapture', lostCapture)
    document.addEventListener('keydown', keydown)
    window.addEventListener('blur', blur)
    return () => {
      viewport.removeEventListener('pointerdown', down)
      viewport.removeEventListener('pointermove', move)
      viewport.removeEventListener('pointerup', up)
      viewport.removeEventListener('pointercancel', up)
      overlay.removeEventListener('lostpointercapture', lostCapture)
      document.removeEventListener('keydown', keydown)
      window.removeEventListener('blur', blur)
      reset(true)
    }
  }, [store, controller, panMode])

  return <div ref={overlayRef} className="selection-overlay" data-testid="selection-overlay" style={{ cursor: activeCursor ?? undefined }} data-transforming={activeCursor !== null}>
    <SnapGuides guides={guides} camera={camera} />
    {marquee && <div className="marquee-rect" data-testid="marquee-rect" style={{ left: marquee.x * camera.zoom + camera.x, top: marquee.y * camera.zoom + camera.y, width: marquee.width * camera.zoom, height: marquee.height * camera.zoom }} />}
    {!panMode && box && <div className="sel-box" data-testid="selection-box" aria-label="Selection bounds" style={{ left: box.x * camera.zoom + camera.x, top: box.y * camera.zoom + camera.y, width: box.width * camera.zoom, height: box.height * camera.zoom, transform: `rotate(${box.rotation}deg)` }}>
      {HANDLES.map(handle => <div key={handle.id} data-handle={handle.id} className="sel-handle" title={`Resize ${handle.id.toUpperCase()} · Shift for proportions`} style={{ left: `${handle.x * 100}%`, top: `${handle.y * 100}%`, cursor: resizeCursor(box.rotation + handle.angle) }} />)}
      <div data-handle="rotate" className="sel-rotate-handle" title="Rotate · Shift for 15° increments" />
    </div>}
    <MeasurementHUD store={store} controller={controller} suppressed={panMode || activeCursor !== null} />
  </div>
})
