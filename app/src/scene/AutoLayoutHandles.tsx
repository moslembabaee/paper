import type { KeyboardEvent } from 'react'
import { adjustSpacing, layoutHandleCursor, layoutHandles, spacingValue } from './layoutHandles'
import type { SpacingProperty } from './layoutHandles'
import type { SceneStore } from './store'
import type { FrameElement, SceneSnapshot } from './types'
import './autoLayout.css'

export function AutoLayoutHandles({ frame, state, store, zoom, rotation, active }: { frame: FrameElement; state: SceneSnapshot; store: SceneStore; zoom: number; rotation: number; active: SpacingProperty | null }) {
  if (!frame.layout || store.isLocked(frame.id) || !store.isVisible(frame.id)) return null
  const padding = frame.layout.padding
  const keydown = (event: KeyboardEvent, property: SpacingProperty) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault()
    event.stopPropagation()
    const current = store.getSnapshot().elements[frame.id]
    if (current?.type !== 'frame' || !current.layout || store.isLocked(current.id)) return
    const value = spacingValue(current.layout, property)
    const step = event.shiftKey ? 8 : 1
    const next = event.key === 'Home' ? 0 : value + (event.key === 'ArrowRight' || event.key === 'ArrowUp' ? step : -step)
    if (Math.max(0, next) === value) return
    store.update(current.id, 'frame', { layout: adjustSpacing(current.layout, property, next) })
  }
  const layout = frame.layout
  return <div className="layout-affordances" data-adjusting={active !== null} data-testid="auto-layout-handles">
    <div className="layout-content-outline" style={{ left: padding.left * zoom, top: padding.top * zoom, width: Math.max(0, frame.width - padding.left - padding.right) * zoom, height: Math.max(0, frame.height - padding.top - padding.bottom) * zoom }} />
    {layoutHandles(frame, state.elements).map(handle => {
      const value = spacingValue(layout, handle.property)
      const label = handle.property === 'gap' ? 'Gap' : `Padding ${handle.property}`
      return <div key={handle.id} className={`layout-spacing-handle is-${handle.axis}`} data-layout-handle={handle.id} data-property={handle.property} data-axis={handle.axis} data-sign={handle.sign} data-active={active === handle.property} data-value={`${label} ${Number(value.toFixed(2))}`} data-testid={`layout-handle-${handle.id}`} role="slider" aria-label={label} aria-valuemin={0} aria-valuenow={value} aria-valuetext={`${value} pixels`} aria-orientation={handle.axis === 'x' ? 'horizontal' : 'vertical'} tabIndex={0} title={`${label}: ${value} px · Drag to adjust · Shift: 8px · Alt: symmetric · Double-click: 0px`} style={{ left: handle.x * zoom, top: handle.y * zoom, cursor: layoutHandleCursor(handle.axis, rotation) }} onKeyDown={event => keydown(event, handle.property)} onDoubleClick={event => {
        event.stopPropagation()
        const current = store.getSnapshot().elements[frame.id]
        if (current?.type !== 'frame' || !current.layout || store.isLocked(current.id)) return
        if (event.altKey && handle.property !== 'gap') {
          const p = current.layout.padding
          const patch = handle.property === 'top' || handle.property === 'bottom'
            ? { top: 0, bottom: 0 }
            : { left: 0, right: 0 }
          store.update(current.id, 'frame', { layout: { ...current.layout, padding: { ...p, ...patch } } })
        } else {
          store.update(current.id, 'frame', { layout: adjustSpacing(current.layout, handle.property, 0) })
        }
      }} />
    })}
  </div>
}
