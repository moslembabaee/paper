import { useEffect, useRef, useState } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { MAX_ZOOM, MIN_ZOOM } from './math'
import type { Bounds } from './types'
import type { ViewportController } from './ViewportController'

interface ZoomControlsProps {
  controller: ViewportController
  contentBounds: Bounds
}

const PRESETS = [10, 25, 50, 75, 100, 150, 200, 400, 800, 1600, 3200]

export function ZoomControls({ controller, contentBounds }: ZoomControlsProps) {
  const [open, setOpen] = useState(false)
  const outputRef = useRef<HTMLSpanElement>(null)
  const minusRef = useRef<HTMLButtonElement>(null)
  const plusRef = useRef<HTMLButtonElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => controller.subscribe(({ camera }) => {
    if (outputRef.current) outputRef.current.textContent = `${Math.round(camera.zoom * 100)}%`
    if (minusRef.current) minusRef.current.disabled = camera.zoom <= MIN_ZOOM
    if (plusRef.current) plusRef.current.disabled = camera.zoom >= MAX_ZOOM
  }), [controller])

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  return (
    <div className="viewport-zoom viewport-ui" ref={rootRef} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}>
      {open && (
        <div className="zoom-menu" aria-label="Zoom presets">
          <button onClick={() => { controller.fit(contentBounds); setOpen(false) }}>Fit canvas <kbd>1</kbd></button>
          <div className="zoom-menu-rule" />
          {PRESETS.map((percent) => (
            <button key={percent} onClick={() => { controller.zoomTo(percent / 100); setOpen(false) }}>{percent}%</button>
          ))}
        </div>
      )}
      <button className="viewport-icon-button" ref={minusRef} aria-label="Zoom out" title="Zoom out (−)" onClick={() => controller.zoomBy(1 / 1.25)}><Minus size={15} /></button>
      <button className="zoom-value" aria-label="Choose zoom level" aria-expanded={open} onClick={() => setOpen(!open)}><span ref={outputRef}>100%</span></button>
      <button className="viewport-icon-button" ref={plusRef} aria-label="Zoom in" title="Zoom in (+)" onClick={() => controller.zoomBy(1.25)}><Plus size={15} /></button>
      <span className="zoom-divider" />
      <button className="viewport-icon-button" aria-label="Fit canvas" title="Fit canvas (1)" onClick={() => controller.fit(contentBounds)}><Maximize size={14} /></button>
    </div>
  )
}
