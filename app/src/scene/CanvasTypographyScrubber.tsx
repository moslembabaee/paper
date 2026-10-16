import { memo, useRef, useState } from 'react'
import type { SceneStore } from './store'
import type { TextElement, VariableFontAxes } from './types'
import type { SelectionBox } from './selectionGeometry'
import { Sliders, Sparkles, Spline, ChevronDown, ChevronUp } from 'lucide-react'
import { VARIABLE_AXIS_PRESETS } from './typography'
import { DEFAULT_KINETIC } from './kineticGeometry'

interface CanvasTypographyScrubberProps {
  readonly node: TextElement
  readonly store: SceneStore
  readonly camera: { readonly x: number; readonly y: number; readonly zoom: number }
  readonly box: SelectionBox
}

type AxisKey = 'wght' | 'wdth' | 'slnt' | 'opsz' | 'offset' | 'phase' | 'ampl'

interface DragState {
  readonly pointerId: number
  readonly axis: AxisKey
  readonly startX: number
  readonly initialVal: number
}

const AXIS_CONFIG: Record<
  AxisKey,
  {
    label: string
    min: number
    max: number
    step: number
    defaultVal: number
    unit: string
    sensitivity: number
  }
> = {
  wght: { label: 'WGHT', min: 1, max: 1000, step: 1, defaultVal: 400, unit: '', sensitivity: 1.5 },
  wdth: { label: 'WDTH', min: 25, max: 200, step: 1, defaultVal: 100, unit: '%', sensitivity: 0.5 },
  slnt: { label: 'SLNT', min: -20, max: 20, step: 0.5, defaultVal: 0, unit: '°', sensitivity: 0.2 },
  opsz: { label: 'OPSZ', min: 6, max: 144, step: 1, defaultVal: 16, unit: 'pt', sensitivity: 0.3 },
  offset: { label: 'PATH', min: 0, max: 100, step: 1, defaultVal: 0, unit: '%', sensitivity: 0.4 },
  phase: { label: 'PHASE', min: 0, max: 100, step: 1, defaultVal: 0, unit: '%', sensitivity: 0.4 },
  ampl: { label: 'AMPL', min: 0, max: 120, step: 1, defaultVal: 18, unit: 'px', sensitivity: 0.5 },
}

export const CanvasTypographyScrubber = memo(function CanvasTypographyScrubber({
  node,
  store,
  camera,
  box,
}: CanvasTypographyScrubberProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeAxis, setActiveAxis] = useState<AxisKey | null>(null)
  const [dragDelta, setDragDelta] = useState<number>(0)
  const dragRef = useRef<DragState | null>(null)

  const axes: VariableFontAxes = {
    wght: node.fontWeight,
    wdth: 100,
    slnt: 0,
    opsz: node.fontSize,
    ...(node.variableAxes ?? {}),
  }

  const getVal = (axis: AxisKey): number => {
    if (axis === 'offset') return node.textOnPath?.offset ?? 0
    if (axis === 'phase') return Math.round((node.kinetic?.phase ?? 0) * 100)
    if (axis === 'ampl') return Math.round(node.kinetic?.amplitude ?? 18)
    return axes[axis] ?? AXIS_CONFIG[axis].defaultVal
  }

  const applyVal = (axis: AxisKey, val: number) => {
    const cfg = AXIS_CONFIG[axis]
    const clamped = Math.max(cfg.min, Math.min(cfg.max, val))

    if (axis === 'offset') {
      if (node.textOnPath) {
        store.update(node.id, 'text', {
          textOnPath: { ...node.textOnPath, offset: Math.round(clamped) },
        })
      }
    } else if (axis === 'phase') {
      if (node.kinetic) {
        store.update(node.id, 'text', {
          kinetic: { ...node.kinetic, phase: Number((clamped / 100).toFixed(3)), playing: false },
        })
      }
    } else if (axis === 'ampl') {
      if (node.kinetic) {
        store.update(node.id, 'text', {
          kinetic: { ...node.kinetic, amplitude: Math.round(clamped) },
        })
      }
    } else {
      const nextAxes = { ...node.variableAxes, [axis]: clamped }
      store.update(node.id, 'text', {
        variableAxes: nextAxes,
        ...(axis === 'wght' ? { fontWeight: Math.round(clamped) } : {}),
      })
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, axis: AxisKey) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const initialVal = getVal(axis)

    dragRef.current = {
      pointerId: event.pointerId,
      axis,
      startX: event.clientX,
      initialVal,
    }
    setActiveAxis(axis)
    setDragDelta(0)
    store.beginTransaction(`Scrub variable font ${axis.toUpperCase()}`)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    event.preventDefault()
    event.stopPropagation()

    const deltaX = event.clientX - drag.startX
    const speed = event.shiftKey ? 0.2 : event.altKey ? 3.5 : 1
    const cfg = AXIS_CONFIG[drag.axis]
    const change = deltaX * cfg.sensitivity * speed
    const nextVal = drag.initialVal + change

    setDragDelta(Math.round(change))
    applyVal(drag.axis, nextVal)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    event.preventDefault()
    event.stopPropagation()

    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Ignore if capture was lost
    }
    dragRef.current = null
    setActiveAxis(null)
    setDragDelta(0)
    store.endTransaction()
  }

  // Position HUD below the selection box in screen coordinates
  const rad = ((box.rotation ?? 0) * Math.PI) / 180
  const halfH =
    !box.rotation
      ? box.height / 2
      : (Math.abs(Math.sin(rad)) * box.width + Math.abs(Math.cos(rad)) * box.height) / 2
  const screenLeft = (box.x + box.width / 2) * camera.zoom + camera.x
  const screenTop = (box.y + box.height / 2 + halfH) * camera.zoom + camera.y + 14

  const visibleAxes: AxisKey[] = ['wght', 'wdth', 'slnt', 'opsz']
  if (node.textOnPath?.enabled) visibleAxes.push('offset')
  if (node.kinetic?.enabled) visibleAxes.push('phase', 'ampl')

  return (
    <div
      className="canvas-typo-scrubber-hud"
      data-testid="canvas-typography-scrubber"
      style={{
        left: screenLeft,
        top: screenTop,
        transform: 'translateX(-50%)',
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="canvas-typo-scrubber-header">
        <div className="canvas-typo-badge">
          <Sliders size={10} color="#81adec" />
          <span>VARIABLE DYNAMICS</span>
          <button
            type="button"
            className={`canvas-typo-toggle-pill ${node.textOnPath?.enabled ? 'active' : ''}`}
            onClick={() => {
              store.update(node.id, 'text', {
                textOnPath: {
                  enabled: !node.textOnPath?.enabled,
                  preset: node.textOnPath?.preset ?? 'wave',
                  offset: node.textOnPath?.offset ?? 0,
                },
              })
            }}
            title={node.textOnPath?.enabled ? 'Disable text on path' : 'Enable text on Bézier path'}
            aria-label="Toggle text on path"
          >
            <Spline size={9} />
            <span>PATH</span>
          </button>
          <button
            type="button"
            className={`canvas-typo-toggle-pill ${node.kinetic?.enabled ? 'active' : ''}`}
            onClick={() => {
              store.update(node.id, 'text', {
                kinetic: {
                  ...DEFAULT_KINETIC,
                  ...(node.kinetic ?? {}),
                  enabled: !node.kinetic?.enabled,
                },
              })
            }}
            title={node.kinetic?.enabled ? 'Disable kinetic typography' : 'Enable kinetic glyph cascade'}
            aria-label="Toggle kinetic typography"
          >
            <Sparkles size={9} />
            <span>KINETIC</span>
          </button>
        </div>
        <button
          type="button"
          className="canvas-typo-collapse-btn"
          onClick={() => setCollapsed(prev => !prev)}
          title={collapsed ? 'Expand variable axes scrubber' : 'Collapse scrubber'}
          aria-label={collapsed ? 'Expand scrubber' : 'Collapse scrubber'}
        >
          {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Quick presets row */}
          <div className="canvas-typo-presets-row" role="toolbar" aria-label="Quick typography presets">
            {VARIABLE_AXIS_PRESETS.slice(0, 5).map(preset => {
              const isMatch =
                preset.axes.wght === axes.wght &&
                preset.axes.wdth === axes.wdth &&
                preset.axes.slnt === axes.slnt
              return (
                <button
                  key={preset.name}
                  type="button"
                  className={`canvas-typo-preset-chip ${isMatch ? 'active' : ''}`}
                  onClick={() => {
                    store.batch(() => {
                      store.update(node.id, 'text', {
                        variableAxes: { ...preset.axes },
                        fontWeight: preset.axes.wght ?? node.fontWeight,
                      })
                    }, `Apply ${preset.name} preset`)
                  }}
                  title={preset.description}
                >
                  {preset.name}
                </button>
              )
            })}
          </div>

          {/* Interactive Scrub Pills */}
          <div className="canvas-typo-axes-row">
            {visibleAxes.map(axis => {
              const cfg = AXIS_CONFIG[axis]
              const val = getVal(axis)
              const isActive = activeAxis === axis
              const percent = Math.max(0, Math.min(100, ((val - cfg.min) / (cfg.max - cfg.min)) * 100))

              return (
                <div
                  key={axis}
                  className={`canvas-typo-axis-pill ${isActive ? 'is-scrubbing' : ''}`}
                  onPointerDown={e => handlePointerDown(e, axis)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onDoubleClick={() => applyVal(axis, AXIS_CONFIG[axis].defaultVal)}
                  title={`Drag horizontally to scrub ${cfg.label} (${cfg.min}..${cfg.max}${cfg.unit}). Shift for fine, Alt for coarse. Double-click to reset.`}
                  aria-label={`Scrub ${cfg.label}`}
                  role="slider"
                  aria-valuemin={cfg.min}
                  aria-valuemax={cfg.max}
                  aria-valuenow={val}
                >
                  <div className="canvas-typo-pill-gauge" style={{ width: `${percent}%` }} />
                  <div className="canvas-typo-pill-content">
                    <span className="canvas-typo-pill-label">{cfg.label}</span>
                    <span className="canvas-typo-pill-val">
                      {axis === 'slnt' ? `${Number(val.toFixed(1))}°` : `${Math.round(val)}${cfg.unit}`}
                    </span>
                    {isActive && dragDelta !== 0 && (
                      <span className="canvas-typo-pill-delta">
                        {dragDelta > 0 ? `+${dragDelta}` : dragDelta}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
})
