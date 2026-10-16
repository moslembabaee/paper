import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { Trash2, X } from 'lucide-react'
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
  onSelect?: (index: number) => void
  onColorChange?: (color: string) => void
  onRadiusChange?: (radius: number) => void
  onRadiusStart?: () => void
  onRadiusEnd?: () => void
  onDelete?: () => void
  showCanvasControls?: boolean
}

/** Capture survives leaving the material; pointer edits publish at most once per frame. */
export function MeshAnchorHandle(props: Props) {
  const latest = useRef(props)
  const gesture = useRef<{ pointer: number; frame: number; point: { x: number; y: number } | null } | null>(null)
  const colorPickerRef = useRef<HTMLInputElement>(null)
  const [showPopover, setShowPopover] = useState(true)
  const [hexInput, setHexInput] = useState(props.color.toUpperCase())
  const radiusId = useId()

  useLayoutEffect(() => {
    latest.current = props
  })

  useLayoutEffect(() => {
    setHexInput(props.color.toUpperCase())
  }, [props.color])

  useLayoutEffect(() => {
    if (props.selected) {
      setShowPopover(true)
    }
  }, [props.selected])

  const flush = () => {
    const drag = gesture.current
    if (!drag) return
    cancelAnimationFrame(drag.frame)
    drag.frame = 0
    if (drag.point) {
      latest.current.onMove(drag.point)
      drag.point = null
    }
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
    return () => {
      window.removeEventListener('blur', blur)
      finish(true)
    }
  }, [])

  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = gesture.current
    if (!drag || drag.pointer !== event.pointerId) return
    event.stopPropagation()
    drag.point = latest.current.project(event.clientX, event.clientY)
    if (!drag.frame) drag.frame = requestAnimationFrame(flush)
  }

  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' && gesture.current) {
      event.preventDefault()
      event.stopPropagation()
      finish(true)
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !gesture.current) {
      if (latest.current.onDelete) {
        event.preventDefault()
        event.stopPropagation()
        latest.current.onDelete()
        return
      }
    }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (!delta || gesture.current) return
    event.preventDefault()
    event.stopPropagation()
    const { anchor, onStart, onMove, onEnd } = latest.current
    if (onStart?.() === false) return
    const step = event.shiftKey ? 0.1 : 0.01
    onMove({ x: clampUnit(anchor.x + delta[0] * step), y: clampUnit(anchor.y + delta[1] * step) })
    onEnd?.(false)
  }

  const isSelected = !!props.selected
  const canShowControls = isSelected && props.showCanvasControls && showPopover
  const isNearTop = typeof props.style.top === 'number' && props.style.top < 100

  return (
    <div
      className="mesh-anchor-container viewport-ui"
      style={{
        position: 'absolute',
        left: props.style.left,
        top: props.style.top,
        zIndex: isSelected ? 20 : 2,
      }}
    >
      <button
        type="button"
        className={`mesh-anchor ${isSelected ? 'selected' : ''}`}
        style={{ background: props.color }}
        aria-pressed={props.selected}
        aria-label={`Mesh anchor ${props.index + 1}`}
        title={`Vertex ${props.index + 1} (${props.color}) · Click to select, drag to reposition, double-click to pick color`}
        onKeyDown={key}
        onClick={event => {
          event.stopPropagation()
          latest.current.onSelect?.(latest.current.index)
        }}
        onDoubleClick={event => {
          event.stopPropagation()
          colorPickerRef.current?.click()
        }}
        onPointerDown={event => {
          if (event.button !== 0 || gesture.current) return
          event.preventDefault()
          event.stopPropagation()
          latest.current.onSelect?.(latest.current.index)
          if (latest.current.onStart?.() === false) return
          event.currentTarget.focus({ preventScroll: true })
          event.currentTarget.setPointerCapture(event.pointerId)
          gesture.current = { pointer: event.pointerId, frame: 0, point: null }
        }}
        onPointerMove={move}
        onPointerUp={event => {
          if (gesture.current?.pointer !== event.pointerId) return
          move(event)
          finish(false)
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => finish(true)}
        onLostPointerCapture={() => finish(true)}
      >
        <span>{props.index + 1}</span>
      </button>

      <input
        ref={colorPickerRef}
        type="color"
        aria-label={`Pick color for vertex ${props.index + 1}`}
        value={props.color.slice(0, 7)}
        style={{ display: 'none' }}
        onChange={event => latest.current.onColorChange?.(event.currentTarget.value + latest.current.color.slice(7))}
      />

      {canShowControls && (
        <div
          className={`mesh-handle-popover viewport-ui ${isNearTop ? 'flip-below' : ''}`}
          role="dialog"
          aria-label={`Vertex ${props.index + 1} color controls`}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
        >
          <div className="mesh-handle-popover-header">
            <span className="mesh-handle-popover-title">
              V{String(props.index + 1).padStart(2, '0')}
            </span>
            <div className="mesh-handle-popover-color-row">
              <label className="mesh-popover-swatch" style={{ background: props.color }} title="Click to pick color">
                <input
                  type="color"
                  value={props.color.slice(0, 7)}
                  aria-label={`Color for vertex ${props.index + 1}`}
                  onChange={event => latest.current.onColorChange?.(event.currentTarget.value + latest.current.color.slice(7))}
                />
              </label>
              <input
                className="mesh-popover-hex"
                value={hexInput}
                spellCheck={false}
                maxLength={9}
                aria-label={`Hex color for vertex ${props.index + 1}`}
                onChange={event => setHexInput(event.currentTarget.value.toUpperCase())}
                onBlur={event => {
                  const hex = event.currentTarget.value.trim()
                  if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(hex)) {
                    latest.current.onColorChange?.(hex)
                  } else {
                    setHexInput(latest.current.color.toUpperCase())
                  }
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') setShowPopover(false)
                }}
              />
            </div>
            {props.onDelete && (
              <button
                type="button"
                className="mesh-popover-delete"
                title="Delete vertex"
                aria-label={`Delete vertex ${props.index + 1}`}
                onClick={props.onDelete}
              >
                <Trash2 size={11} />
              </button>
            )}
            <button
              type="button"
              className="mesh-popover-close"
              title="Close controls"
              aria-label={`Close vertex ${props.index + 1} controls`}
              onClick={() => setShowPopover(false)}
            >
              <X size={11} />
            </button>
          </div>
          {props.onRadiusChange && (
            <div className="mesh-handle-popover-radius">
              <label htmlFor={radiusId}>Spread</label>
              <input
                id={radiusId}
                type="range"
                min={0.1}
                max={2.0}
                step={0.05}
                value={props.anchor.radius}
                aria-label={`Spread influence for vertex ${props.index + 1}`}
                onPointerDown={() => latest.current.onRadiusStart?.()}
                onPointerUp={() => latest.current.onRadiusEnd?.()}
                onBlur={() => latest.current.onRadiusEnd?.()}
                onChange={event => latest.current.onRadiusChange?.(event.currentTarget.valueAsNumber)}
              />
              <output htmlFor={radiusId}>{props.anchor.radius.toFixed(2)}</output>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

