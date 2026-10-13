import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { drawGrid } from './grid'
import { Minimap } from './Minimap'
import { unionBounds } from './math'
import { drawHorizontalRuler, drawVerticalRuler } from './rulers'
import { ViewportController } from './ViewportController'
import { ZoomControls } from './ZoomControls'
import type { Bounds, Camera, MinimapItem, Point, ViewportSnapshot } from './types'
import './viewport.css'
import { subscribeTheme } from '../design-system/theme'

const EMPTY_ITEMS: readonly MinimapItem[] = []
const isControl = (target: EventTarget | null) => target instanceof Element && !!target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"], .viewport-ui')
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export interface CanvasViewportProps {
  children?: ReactNode
  /** Screen-space tools share the viewport's event routing and ruler origin. */
  overlay?: ReactNode
  /** Screen-space paint below the engineering grid and scene. */
  background?: ReactNode
  /** Supply a controller to access the camera from selection, tools, or handoff. */
  controller?: ViewportController
  initialCamera?: Camera
  contentBounds?: Bounds
  minimapItems?: readonly MinimapItem[]
  gridVisible?: boolean
  rulersVisible?: boolean
  panMode?: boolean
  showMinimap?: boolean
  className?: string
  onViewportChange?: (snapshot: ViewportSnapshot) => void
}

export function CanvasViewport({ children, overlay, background, controller: provided, initialCamera, contentBounds, minimapItems = EMPTY_ITEMS, gridVisible = true, rulersVisible = true, panMode = false, showMinimap = true, className = '', onViewportChange }: CanvasViewportProps) {
  const [owned] = useState(() => new ViewportController(initialCamera))
  const controller = provided ?? owned
  const rootRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLCanvasElement>(null)
  const hRulerRef = useRef<HTMLCanvasElement>(null)
  const vRulerRef = useRef<HTMLCanvasElement>(null)
  const coordinatesRef = useRef<HTMLSpanElement>(null)
  const callbackRef = useRef(onViewportChange)
  const panModeRef = useRef(panMode)
  const gridVisibleRef = useRef(gridVisible)
  const rulersVisibleRef = useRef(rulersVisible)
  const fittedRef = useRef(false)
  const bounds = contentBounds ?? unionBounds(minimapItems)
  const boundsRef = useRef(bounds)

  useLayoutEffect(() => {
    callbackRef.current = onViewportChange
    panModeRef.current = panMode
    boundsRef.current = bounds
    if (gridVisibleRef.current !== gridVisible) {
      gridVisibleRef.current = gridVisible
      controller.resize(controller.getSnapshot().size)
    }
    if (rulersVisibleRef.current !== rulersVisible) {
      rulersVisibleRef.current = rulersVisible
      controller.resize(controller.getSnapshot().size)
    }
  })

  useLayoutEffect(() => {
    const root = rootRef.current!
    const world = worldRef.current!
    const grid = gridRef.current!
    const hRuler = hRulerRef.current!
    const vRuler = vRulerRef.current!
    let hovered = false
    let space = false
    let suppressClick = false
    let pointer: { id: number; point: Point } | null = null
    const touches = new Map<number, Point>()
    let pinch: { center: Point; distance: number; camera: Camera; world: Point } | null = null
    let rect = root.getBoundingClientRect()
    const rulerOffset = (): number => rulersVisibleRef.current ? 20 : 0
    const local = (event: { clientX: number; clientY: number }): Point => {
      const rs = rulerOffset()
      return { x: event.clientX - rect.left - rs, y: event.clientY - rect.top - rs }
    }
    const setCursor = () => {
      root.dataset.panning = String(pointer !== null || touches.size > 0)
      root.dataset.space = String(space)
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => controller.setReducedMotion(media.matches)
    updateMotion()
    media.addEventListener('change', updateMotion)

    const paint = (snapshot: ViewportSnapshot) => {
      const { x, y, zoom } = snapshot.camera
      world.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${zoom})`
      root.dataset.zoom = String(zoom)
      const rs = rulerOffset()
      const insetSnapshot = rs > 0
        ? { ...snapshot, size: { width: snapshot.size.width - rs, height: snapshot.size.height - rs } }
        : snapshot
      if (gridVisibleRef.current) drawGrid(grid, insetSnapshot)
      if (rulersVisibleRef.current) {
        // Rulers get the full width/height minus the opposite ruler only
        drawHorizontalRuler(hRuler, { ...snapshot, size: { width: snapshot.size.width - rs, height: snapshot.size.height } })
        drawVerticalRuler(vRuler, { ...snapshot, size: { width: snapshot.size.width, height: snapshot.size.height - rs } })
      }
      const center = controller.screenToWorld({ x: (snapshot.size.width - rs) / 2, y: (snapshot.size.height - rs) / 2 })
      if (coordinatesRef.current) coordinatesRef.current.textContent = `${Math.round(center.x)}, ${Math.round(center.y)}`
      callbackRef.current?.(snapshot)
    }
    const unsubscribe = controller.subscribe(paint)
    // Redraw raster UI immediately without refitting or moving the document camera.
    const unsubscribeTheme = subscribeTheme(() => paint(controller.getSnapshot()))

    const resize = () => {
      rect = root.getBoundingClientRect()
      const rs = rulerOffset()
      controller.resize({ width: rect.width - rs, height: rect.height - rs })
      if (!fittedRef.current && rect.width > 0 && rect.height > 0) {
        fittedRef.current = true
        if (!initialCamera && (contentBounds || minimapItems.length)) controller.fit(boundsRef.current, rect.width < 600 ? 32 : 100, false)
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(root)
    resize()
    const wheel = (event: WheelEvent) => {
      if (isControl(event.target)) return
      event.preventDefault()
      rect = root.getBoundingClientRect()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1
      const dx = event.deltaX * unit
      const dy = event.deltaY * unit
      if (event.shiftKey || (!event.ctrlKey && !event.metaKey && Math.abs(dx) > Math.abs(dy) * 0.5)) {
        controller.panBy({ x: event.shiftKey && dx === 0 ? -dy : -dx, y: event.shiftKey ? 0 : -dy })
      } else {
        controller.zoomBy(Math.exp(-Math.max(-240, Math.min(240, dy)) * (event.ctrlKey ? 0.01 : 0.002)), local(event))
      }
    }
    const beginPinch = () => {
      const [a, b] = [...touches.values()]
      if (!a || !b) { pinch = null; return }
      const center = midpoint(a, b)
      pinch = { center, distance: Math.max(1, distance(a, b)), camera: { ...controller.getSnapshot().camera }, world: controller.screenToWorld(center) }
    }
    const down = (event: PointerEvent) => {
      if (isControl(event.target)) return
      rect = root.getBoundingClientRect()
      if (event.pointerType === 'touch') {
        event.preventDefault()
        controller.stop()
        root.setPointerCapture(event.pointerId)
        touches.set(event.pointerId, local(event))
        beginPinch()
        setCursor()
        return
      }
      if (pointer || !(event.button === 1 || (event.button === 0 && (space || panModeRef.current)))) return
      event.preventDefault()
      event.stopPropagation()
      root.focus({ preventScroll: true })
      controller.stop()
      pointer = { id: event.pointerId, point: local(event) }
      suppressClick = true
      root.setPointerCapture(event.pointerId)
      setCursor()
    }
    const move = (event: PointerEvent) => {
      const point = local(event)
      if (touches.has(event.pointerId)) {
        const previous = touches.get(event.pointerId)!
        touches.set(event.pointerId, point)
        if (touches.size >= 2 && pinch) {
          const [a, b] = [...touches.values()]
          const center = midpoint(a, b)
          controller.zoomTo(pinch.camera.zoom * distance(a, b) / pinch.distance, pinch.center, false)
          const zoom = controller.getSnapshot().camera.zoom
          controller.setCamera({ x: center.x - pinch.world.x * zoom, y: center.y - pinch.world.y * zoom, zoom }, false)
        } else controller.panBy({ x: point.x - previous.x, y: point.y - previous.y })
        return
      }
      if (pointer?.id !== event.pointerId) return
      controller.panBy({ x: point.x - pointer.point.x, y: point.y - pointer.point.y })
      pointer.point = point
    }
    const up = (event: PointerEvent) => {
      touches.delete(event.pointerId)
      beginPinch()
      if (pointer?.id === event.pointerId) pointer = null
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId)
      setCursor()
    }
    const reset = () => {
      if (pointer && root.hasPointerCapture(pointer.id)) root.releasePointerCapture(pointer.id)
      for (const id of touches.keys()) if (root.hasPointerCapture(id)) root.releasePointerCapture(id)
      pointer = null
      pinch = null
      touches.clear()
      space = false
      setCursor()
    }
    const keydown = (event: KeyboardEvent) => {
      if (isControl(event.target) || (!hovered && !root.contains(document.activeElement))) return
      if (event.code === 'Space') { event.preventDefault(); space = true; setCursor(); return }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === '+' || event.key === '=') { event.preventDefault(); controller.zoomBy(1.25) }
      if (event.key === '-') { event.preventDefault(); controller.zoomBy(1 / 1.25) }
      if (event.key === '0') { event.preventDefault(); controller.zoomTo(1) }
      if (event.key === '1') { event.preventDefault(); controller.fit(boundsRef.current) }
      if (event.key === 'Escape') reset()
    }
    const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') { space = false; setCursor() } }
    const enter = () => { hovered = true }
    const leave = () => { hovered = false }
    const click = (event: MouseEvent) => {
      if (suppressClick && !isControl(event.target)) { event.preventDefault(); event.stopPropagation() }
      suppressClick = false
    }
    const auxiliaryClick = (event: MouseEvent) => { if (event.button === 1 && !isControl(event.target)) event.preventDefault() }
    root.addEventListener('wheel', wheel, { passive: false })
    root.addEventListener('pointerdown', down, true)
    root.addEventListener('pointermove', move)
    root.addEventListener('pointerup', up)
    root.addEventListener('pointercancel', up)
    root.addEventListener('lostpointercapture', up)
    root.addEventListener('pointerenter', enter)
    root.addEventListener('pointerleave', leave)
    root.addEventListener('click', click, true)
    root.addEventListener('auxclick', auxiliaryClick)
    document.addEventListener('keydown', keydown)
    document.addEventListener('keyup', keyup)
    window.addEventListener('blur', reset)
    return () => {
      observer.disconnect()
      unsubscribe()
      unsubscribeTheme()
      media.removeEventListener('change', updateMotion)
      root.removeEventListener('wheel', wheel)
      root.removeEventListener('pointerdown', down, true)
      root.removeEventListener('pointermove', move)
      root.removeEventListener('pointerup', up)
      root.removeEventListener('pointercancel', up)
      root.removeEventListener('lostpointercapture', up)
      root.removeEventListener('pointerenter', enter)
      root.removeEventListener('pointerleave', leave)
      root.removeEventListener('click', click, true)
      root.removeEventListener('auxclick', auxiliaryClick)
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', reset)
      reset()
      controller.dispose()
    }
  }, [controller])

  return (
    <div ref={rootRef} className={`canvas-viewport ${className}`} data-testid="canvas-viewport" tabIndex={0} role="region" aria-label="Infinite design canvas" aria-describedby="canvas-instructions" data-pan-mode={panMode} data-rulers={rulersVisible}>
      {background && <div className="viewport-background" data-testid="viewport-background">{background}</div>}
      <canvas ref={gridRef} className="viewport-grid" data-testid="viewport-grid" aria-hidden="true" hidden={!gridVisible} />
      {rulersVisible && <>
        <canvas ref={hRulerRef} className="viewport-ruler-h" data-testid="viewport-ruler-h" aria-hidden="true" />
        <canvas ref={vRulerRef} className="viewport-ruler-v" data-testid="viewport-ruler-v" aria-hidden="true" />
        <div className="viewport-ruler-corner" data-testid="viewport-ruler-corner" aria-hidden="true" />
      </>}
      <div ref={worldRef} className="viewport-world" data-testid="viewport-world">{children}</div>
      {overlay}
      <div className="viewport-origin" data-testid="viewport-origin" aria-hidden="true">WORLD <span ref={coordinatesRef}>0, 0</span></div>
      <div className="viewport-hint" data-testid="canvas-instructions" id="canvas-instructions">Scroll to zoom <span>·</span> Space + drag to pan <span>·</span> Shift + scroll to pan</div>
      {showMinimap && <Minimap controller={controller} items={minimapItems} />}
      <ZoomControls controller={controller} contentBounds={bounds} />
    </div>
  )
}
