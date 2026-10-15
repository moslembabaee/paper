import { memo, useMemo, useRef } from 'react'
import type { BezierCurve } from '../prototype/types'
import { CURVES } from '../prototype/model'
import { SPRING_LIMITS, SPRING_PRESETS, springDuration } from '../prototype/spring'
import { easingProgress } from './model'
import type { MotionEasing } from './types'

export const EasingEditor = memo(function EasingEditor({ value, onChange, onBegin, onEnd }: { value: MotionEasing; onChange: (easing: MotionEasing) => void; onBegin: () => void; onEnd: () => void }) {
  const svg = useRef<SVGSVGElement>(null), drag = useRef<number | null>(null)
  const curve: BezierCurve = value.kind === 'bezier' ? value.curve : CURVES['ease-out']
  const path = useMemo(() => Array.from({ length: 181 }, (_, i) => `${i ? 'L' : 'M'}${24 + i / 180 * 192} ${140 - easingProgress(i / 180, value) * 96}`).join(' '), [value])
  const setCoordinate = (index: number, number: number) => {
    const next = [...curve] as [number, number, number, number]
    next[index] = Number(Math.max(index % 2 ? -2 : 0, Math.min(index % 2 ? 3 : 1, number)).toFixed(3))
    onChange({ kind: 'bezier', curve: next })
  }
  return <div className="motion-easing-editor">
    <div className="motion-easing-tabs" role="group" aria-label="Segment easing type">
      <button aria-pressed={value.kind === 'spring'} onClick={() => onChange({ kind: 'spring', spring: SPRING_PRESETS.bouncy.spring })}>Spring physics</button>
      <button aria-pressed={value.kind === 'bezier'} onClick={() => onChange({ kind: 'bezier', curve })}>Cubic Bézier</button>
    </div>
    <svg ref={svg} className="motion-curve" viewBox="0 0 240 184" aria-label={value.kind === 'spring' ? 'Motion spring response' : 'Interactive cubic Bézier graph'} role="group" onPointerMove={event => {
      if (drag.current === null || !svg.current) return
      const matrix = svg.current.getScreenCTM()?.inverse()
      if (!matrix) return
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
      const next = [...curve] as [number, number, number, number]
      next[drag.current * 2] = Number(Math.max(0, Math.min(1, (point.x - 24) / 192)).toFixed(3))
      next[drag.current * 2 + 1] = Number(Math.max(-2, Math.min(3, (140 - point.y) / 96)).toFixed(3))
      onChange({ kind: 'bezier', curve: next })
    }} onPointerUp={() => { if (drag.current !== null) { drag.current = null; onEnd() } }} onPointerCancel={() => { if (drag.current !== null) { drag.current = null; onEnd() } }} onLostPointerCapture={() => { if (drag.current !== null) { drag.current = null; onEnd() } }}>
      <defs><pattern id="motion-curve-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="currentColor" strokeWidth=".6" /></pattern><clipPath id="motion-curve-clip"><rect x="8" y="4" width="224" height="172" /></clipPath></defs>
      <rect x="24" y="20" width="192" height="144" fill="url(#motion-curve-grid)" className="motion-graph-grid" />
      <path d="M24 44H216M24 140H216M24 140L216 44" className="motion-graph-guide" />
      <path d={path} className="motion-graph-line" clipPath="url(#motion-curve-clip)" />
      {value.kind === 'bezier' && <>
        <path d={`M24 140L${24 + curve[0] * 192} ${140 - curve[1] * 96}M216 44L${24 + curve[2] * 192} ${140 - curve[3] * 96}`} className="motion-graph-handle-line" />
        {[0, 1].map(index => <circle key={index} cx={24 + curve[index * 2] * 192} cy={140 - curve[index * 2 + 1] * 96} r="6" className="motion-graph-handle" tabIndex={0} role="button" aria-label={`Bézier control point ${index + 1}; arrow keys adjust, Shift for fine adjustment`} onPointerDown={event => { event.preventDefault(); svg.current?.setPointerCapture(event.pointerId); drag.current = index; onBegin() }} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
          event.preventDefault(); const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown', coordinate = index * 2 + (vertical ? 1 : 0)
          setCoordinate(coordinate, curve[coordinate] + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1) * (event.shiftKey ? .01 : .05))
        }} />)}
      </>}
      <circle cx="24" cy="140" r="3" className="motion-graph-end" /><circle cx="216" cy="44" r="3" className="motion-graph-end" />
      <text x="24" y="180">0</text><text x="194" y="180">TIME →</text>
    </svg>
    {value.kind === 'spring' ? <>
      <label className="motion-field">Feel<select aria-label="Motion spring preset" value={Object.entries(SPRING_PRESETS).find(([, preset]) => Object.keys(SPRING_LIMITS).every(key => preset.spring[key as keyof typeof preset.spring] === value.spring[key as keyof typeof value.spring]))?.[0] ?? 'custom'} onChange={event => { const preset = SPRING_PRESETS[event.target.value as keyof typeof SPRING_PRESETS]; if (preset) onChange({ kind: 'spring', spring: preset.spring }) }}><option value="custom" disabled>Custom</option>{Object.entries(SPRING_PRESETS).map(([key, preset]) => <option value={key} key={key}>{preset.label}</option>)}</select></label>
      <div className="motion-physics-fields">{(Object.keys(SPRING_LIMITS) as (keyof typeof value.spring)[]).map(key => <label className="motion-field" key={key}>{key}<input type="number" aria-label={`Motion spring ${key}`} min={SPRING_LIMITS[key][0]} max={SPRING_LIMITS[key][1]} step={key === 'mass' ? .1 : 1} value={value.spring[key]} onChange={event => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n) && n >= SPRING_LIMITS[key][0] && n <= SPRING_LIMITS[key][1]) onChange({ kind: 'spring', spring: { ...value.spring, [key]: n } }) }} /></label>)}</div>
      <p className="motion-hint">{springDuration(value.spring)} ms natural settle · fitted to segment</p>
    </> : <>
      <label className="motion-field">Preset<select aria-label="Motion Bézier preset" value={Object.entries(CURVES).find(([, preset]) => preset.every((v, i) => v === curve[i]))?.[0] ?? 'custom'} onChange={event => { const next = CURVES[event.target.value as keyof typeof CURVES]; if (next) onChange({ kind: 'bezier', curve: next }) }}><option value="custom" disabled>Custom</option>{Object.keys(CURVES).map(key => <option key={key}>{key}</option>)}</select></label>
      <div className="motion-bezier-fields">{['x1', 'y1', 'x2', 'y2'].map((label, i) => <label className="motion-field" key={label}>{label}<input type="number" aria-label={`Motion Bézier ${label}`} min={i % 2 ? -2 : 0} max={i % 2 ? 3 : 1} step="0.01" value={curve[i]} onChange={event => { if (Number.isFinite(event.currentTarget.valueAsNumber)) setCoordinate(i, event.currentTarget.valueAsNumber) }} /></label>)}</div>
      <p className="motion-hint">Drag handles or use arrow keys. Y can overshoot.</p>
    </>}
  </div>
})
