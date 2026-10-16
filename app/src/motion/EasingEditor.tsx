import { memo, useMemo, useRef } from 'react'
import type { BezierCurve } from '../prototype/types'
import { SPRING_LIMITS, SPRING_PRESETS, springDuration } from '../prototype/spring'
import { easingProgress, MOTION_BEZIER_PRESETS } from './model'
import type { MotionEasing } from './types'

export const EasingEditor = memo(function EasingEditor({
  value,
  onChange,
  onBegin,
  onEnd,
}: {
  value: MotionEasing
  onChange: (easing: MotionEasing) => void
  onBegin: () => void
  onEnd: () => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<number | null>(null)
  const curve: BezierCurve = value.kind === 'bezier' ? value.curve : MOTION_BEZIER_PRESETS['ease-out'].curve

  const path = useMemo(() => {
    return Array.from({ length: 181 }, (_, i) => {
      const p = i / 180
      const e = easingProgress(p, value)
      const x = 24 + p * 192
      const y = 140 - e * 96
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
  }, [value])

  const setCoordinate = (index: number, num: number) => {
    const next = [...curve] as [number, number, number, number]
    const min = index % 2 ? -2 : 0
    const max = index % 2 ? 3 : 1
    next[index] = Number(Math.max(min, Math.min(max, num)).toFixed(3))
    onChange({ kind: 'bezier', curve: next })
  }

  const flipCurve = () => {
    // Invert the bezier curve: (1 - x2, 1 - y2, 1 - x1, 1 - y1)
    const next: BezierCurve = [
      Number((1 - curve[2]).toFixed(3)),
      Number((1 - curve[3]).toFixed(3)),
      Number((1 - curve[0]).toFixed(3)),
      Number((1 - curve[1]).toFixed(3)),
    ]
    onChange({ kind: 'bezier', curve: next })
  }

  return (
    <div className="motion-easing-editor">
      <div className="motion-easing-tabs" role="group" aria-label="Segment easing type">
        <button
          type="button"
          aria-pressed={value.kind === 'bezier'}
          onClick={() => onChange({ kind: 'bezier', curve })}
        >
          Cubic Bézier
        </button>
        <button
          type="button"
          aria-pressed={value.kind === 'spring'}
          onClick={() => onChange({ kind: 'spring', spring: SPRING_PRESETS.bouncy.spring })}
        >
          Spring Physics
        </button>
      </div>

      <svg
        ref={svg}
        className="motion-curve"
        viewBox="0 0 240 184"
        aria-label={value.kind === 'spring' ? 'Motion spring response' : 'Interactive cubic Bézier graph'}
        role="group"
        onPointerMove={event => {
          if (drag.current === null || !svg.current) return
          const matrix = svg.current.getScreenCTM()?.inverse()
          if (!matrix) return
          const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
          const next = [...curve] as [number, number, number, number]
          next[drag.current * 2] = Number(Math.max(0, Math.min(1, (point.x - 24) / 192)).toFixed(3))
          next[drag.current * 2 + 1] = Number(Math.max(-2, Math.min(3, (140 - point.y) / 96)).toFixed(3))
          onChange({ kind: 'bezier', curve: next })
        }}
        onPointerUp={() => {
          if (drag.current !== null) {
            drag.current = null
            onEnd()
          }
        }}
        onPointerCancel={() => {
          if (drag.current !== null) {
            drag.current = null
            onEnd()
          }
        }}
        onLostPointerCapture={() => {
          if (drag.current !== null) {
            drag.current = null
            onEnd()
          }
        }}
      >
        <defs>
          <pattern id="motion-curve-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="currentColor" strokeWidth=".6" />
          </pattern>
          <clipPath id="motion-curve-clip">
            <rect x="8" y="4" width="224" height="172" />
          </clipPath>
        </defs>

        <rect x="24" y="20" width="192" height="144" fill="url(#motion-curve-grid)" className="motion-graph-grid" />
        <path d="M24 44H216M24 140H216M24 140L216 44" className="motion-graph-guide" />
        <path d={path} className="motion-graph-line" clipPath="url(#motion-curve-clip)" />

        {value.kind === 'bezier' && (
          <>
            <path
              d={`M24 140L${(24 + curve[0] * 192).toFixed(1)} ${(140 - curve[1] * 96).toFixed(1)}M216 44L${(24 + curve[2] * 192).toFixed(1)} ${(140 - curve[3] * 96).toFixed(1)}`}
              className="motion-graph-handle-line"
            />
            {[0, 1].map(index => (
              <circle
                key={index}
                cx={(24 + curve[index * 2] * 192).toFixed(1)}
                cy={(140 - curve[index * 2 + 1] * 96).toFixed(1)}
                r="6"
                className="motion-graph-handle"
                tabIndex={0}
                role="button"
                aria-label={`Bézier control point ${index + 1}; arrow keys adjust, Shift for fine adjustment`}
                onPointerDown={event => {
                  event.preventDefault()
                  svg.current?.setPointerCapture(event.pointerId)
                  drag.current = index
                  onBegin()
                }}
                onKeyDown={event => {
                  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
                  event.preventDefault()
                  const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
                  const coord = index * 2 + (vertical ? 1 : 0)
                  const step = (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1) * (event.shiftKey ? 0.01 : 0.05)
                  setCoordinate(coord, curve[coord] + step)
                }}
              />
            ))}
          </>
        )}

        <circle cx="24" cy="140" r="3" className="motion-graph-end" />
        <circle cx="216" cy="44" r="3" className="motion-graph-end" />
        <text x="24" y="180">0%</text>
        <text x="184" y="180">TIME → 100%</text>
      </svg>

      {value.kind === 'bezier' ? (
        <>
          <div className="motion-field-row">
            <label className="motion-field">
              Preset
              <select
                aria-label="Motion Bézier preset"
                value={
                  Object.entries(MOTION_BEZIER_PRESETS).find(([, p]) =>
                    p.curve.every((v, i) => Math.abs(v - curve[i]) < 0.001)
                  )?.[0] ?? 'custom'
                }
                onChange={event => {
                  const preset = MOTION_BEZIER_PRESETS[event.target.value]
                  if (preset) onChange({ kind: 'bezier', curve: [...preset.curve] as BezierCurve })
                }}
              >
                <option value="custom">Custom Curve</option>
                {Object.entries(MOTION_BEZIER_PRESETS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="motion-button-secondary"
              title="Invert curve direction"
              onClick={flipCurve}
            >
              Flip
            </button>
          </div>

          <div className="motion-bezier-fields">
            {(['x1', 'y1', 'x2', 'y2'] as const).map((label, i) => (
              <label className="motion-field" key={label}>
                {label}
                <input
                  type="number"
                  aria-label={`Motion Bézier ${label}`}
                  min={i % 2 ? -2 : 0}
                  max={i % 2 ? 3 : 1}
                  step="0.01"
                  value={curve[i]}
                  onChange={event => {
                    if (Number.isFinite(event.currentTarget.valueAsNumber)) {
                      setCoordinate(i, event.currentTarget.valueAsNumber)
                    }
                  }}
                />
              </label>
            ))}
          </div>
          <p className="motion-hint">Drag handles or use arrow keys · Y values overshoot for springy feel</p>
        </>
      ) : (
        <>
          <label className="motion-field">
            Feel
            <select
              aria-label="Motion spring preset"
              value={
                Object.entries(SPRING_PRESETS).find(([, preset]) =>
                  Object.keys(SPRING_LIMITS).every(
                    key => preset.spring[key as keyof typeof preset.spring] === value.spring[key as keyof typeof value.spring]
                  )
                )?.[0] ?? 'custom'
              }
              onChange={event => {
                const preset = SPRING_PRESETS[event.target.value as keyof typeof SPRING_PRESETS]
                if (preset) onChange({ kind: 'spring', spring: preset.spring })
              }}
            >
              <option value="custom" disabled>
                Custom Feel
              </option>
              {Object.entries(SPRING_PRESETS).map(([key, preset]) => (
                <option value={key} key={key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <div className="motion-physics-fields">
            {(Object.keys(SPRING_LIMITS) as (keyof typeof value.spring)[]).map(key => (
              <label className="motion-field" key={key}>
                {key}
                <input
                  type="number"
                  aria-label={`Motion spring ${key}`}
                  min={SPRING_LIMITS[key][0]}
                  max={SPRING_LIMITS[key][1]}
                  step={key === 'mass' ? 0.1 : 1}
                  value={value.spring[key]}
                  onChange={event => {
                    const n = event.currentTarget.valueAsNumber
                    if (Number.isFinite(n) && n >= SPRING_LIMITS[key][0] && n <= SPRING_LIMITS[key][1]) {
                      onChange({ kind: 'spring', spring: { ...value.spring, [key]: n } })
                    }
                  }}
                />
              </label>
            ))}
          </div>
          <p className="motion-hint">{springDuration(value.spring)} ms natural settle · fitted to segment</p>
        </>
      )}
    </div>
  )
})
