import { useId, useRef, useState } from 'react'
import { Grid, Minus, Plus, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import { ShaderSurface } from './ShaderSurface'
import { freezeShader, validateShader } from './catalog'
import {
  clampUnit,
  createMeshGrid,
  createMeshMaterial,
  gridVertexPosition,
  meshHarmonyModes,
  synthesizeProceduralColorField,
} from './mesh'
import type { MeshHarmonyMode } from './mesh'
import type { MeshGridConfig, MeshMaterial, ShaderPaint } from './types'

type MeshPaint = Extract<ShaderPaint, { kind: 'mesh-gradient' }>

export function MeshGradientEngine({
  paint,
  onChange,
  onGestureStart,
  onGestureEnd,
}: {
  paint: MeshPaint
  onChange: (paint: ShaderPaint) => void
  onGestureStart?: () => boolean | void
  onGestureEnd?: (cancel: boolean) => void
}) {
  const mesh = paint.mesh ?? createMeshMaterial(paint.params.colors.length)
  const grid = mesh.grid
  const preview = useRef<HTMLDivElement>(null)
  const before = useRef<MeshPaint | null>(null)
  const [activeVertex, setActiveVertex] = useState(0)
  const [synthHarmony, setSynthHarmony] = useState<MeshHarmonyMode>('harmonic')

  const start = () => {
    if (onGestureStart?.() === false) return false
    before.current = paint
    return true
  }

  const end = (cancel: boolean = false) => {
    if (onGestureEnd) onGestureEnd(cancel)
    else if (cancel && before.current) onChange(before.current)
    before.current = null
  }

  const commit = (next: MeshPaint) => {
    validateShader(next)
    onChange(freezeShader(next))
  }

  const updateMesh = (changes: Partial<MeshMaterial>) => {
    commit({ ...paint, mesh: { ...mesh, ...changes } })
  }

  const updateGrid = (gridChanges: Partial<MeshGridConfig>) => {
    if (!grid) return
    updateMesh({ grid: { ...grid, ...gridChanges } })
  }

  const enableGrid = () => {
    const newGrid = createMeshGrid(3, 3, paint.params.colors)
    updateMesh({ grid: newGrid })
  }

  const resizeGrid = (rows: number, cols: number) => {
    if (!grid) return
    const newGrid = createMeshGrid(rows, cols, grid.vertices.map(v => v.color))
    updateMesh({ grid: newGrid })
  }

  const updateVertexColor = (index: number, color: string) => {
    if (!grid) return
    const vertices = grid.vertices.map((v, i) =>
      i === index ? { ...v, color } : v
    )
    updateGrid({ vertices })
  }

  const updateVertexTangent = (index: number, tx: number, ty: number) => {
    if (!grid) return
    const vertices = grid.vertices.map((v, i) =>
      i === index ? { ...v, tx: clampUnit((tx + 1) / 2) * 2 - 1, ty: clampUnit((ty + 1) / 2) * 2 - 1 } : v
    )
    updateGrid({ vertices })
  }

  const synthesizeGridField = (harmony: MeshHarmonyMode = synthHarmony) => {
    if (!grid) return
    const baseColor = grid.vertices[activeVertex]?.color ?? '#81adec'
    const synthesized = synthesizeProceduralColorField(baseColor, grid.vertices.length, harmony)
    const vertices = grid.vertices.map((v, i) => ({
      ...v,
      color: synthesized[i] ?? v.color,
    }))
    updateGrid({ vertices })
  }

  const resetTangents = () => {
    if (!grid) return
    const vertices = grid.vertices.map(v => ({ ...v, tx: 0, ty: 0 }))
    updateGrid({ vertices })
  }

  if (!grid) {
    return (
      <div className="mesh-grid-engine">
        <div className="mesh-grid-engine-heading">
          <span className="section-caption">GRID MESH TOPOLOGY</span>
          <span className="shader-engine-mark">BICUBIC PATCH</span>
        </div>
        <button className="mesh-enable" onClick={enableGrid}>
          Enable grid mesh topology
        </button>
      </div>
    )
  }

  const { rows, cols, vertices } = grid
  const active = Math.min(activeVertex, vertices.length - 1)
  const activeV = vertices[active]

  return (
    <div className="mesh-grid-engine">
      <div className="mesh-grid-engine-heading">
        <span className="section-caption">GRID MESH TOPOLOGY</span>
        <span className="shader-engine-mark">{rows}×{cols} PATCH</span>
      </div>

      {/* Live Preview with Grid Vertices */}
      <div
        ref={preview}
        className="mesh-grid-preview"
        aria-label="Interactive grid mesh preview"
      >
        <ShaderSurface paint={paint} />
        <svg className="mesh-grid-overlay" viewBox="0 0 1 1" preserveAspectRatio="none">
          {/* Grid lines */}
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols - 1 }, (_, c) => {
              const p1 = gridVertexPosition(r, c, rows, cols)
              const p2 = gridVertexPosition(r, c + 1, rows, cols)
              return <line key={`h${r}-${c}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#81adec44" strokeWidth="0.003" />
            })
          )}
          {Array.from({ length: cols }, (_, c) =>
            Array.from({ length: rows - 1 }, (_, r) => {
              const p1 = gridVertexPosition(r, c, rows, cols)
              const p2 = gridVertexPosition(r + 1, c, rows, cols)
              return <line key={`v${r}-${c}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#81adec44" strokeWidth="0.003" />
            })
          )}
        </svg>
        {/* Vertex Handles */}
        {vertices.map((vertex, index) => {
          const r = Math.floor(index / cols)
          const c = index % cols
          const pos = gridVertexPosition(r, c, rows, cols)
          return (
            <button
              key={index}
              type="button"
              className={`mesh-grid-vertex ${index === active ? 'active' : ''}`}
              style={{
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                background: vertex.color,
              }}
              aria-pressed={index === active}
              aria-label={`Grid vertex ${r + 1},${c + 1}`}
              onClick={e => { e.stopPropagation(); setActiveVertex(index) }}
              onPointerDown={e => {
                if (e.button !== 0) return
                e.preventDefault()
                e.stopPropagation()
                start()
                setActiveVertex(index)
              }}
              onPointerUp={() => end(false)}
            >
              <span>{index + 1}</span>
            </button>
          )
        })}
      </div>

      <p className="mesh-hint">
        Click a vertex to select it. Adjust color and tangent handles below.
      </p>

      {/* Grid Dimensions */}
      <div className="mesh-grid-dimension-bar">
        <span className="mesh-tool-label">Size</span>
        <div className="mesh-grid-dim-group">
          <span className="mesh-grid-dim-label">Rows</span>
          <button
            type="button"
            className="mesh-grid-dim-btn"
            disabled={rows <= 2}
            onClick={() => resizeGrid(rows - 1, cols)}
            aria-label="Decrease rows"
          >
            <Minus size={10} />
          </button>
          <span className="mesh-grid-dim-value">{rows}</span>
          <button
            type="button"
            className="mesh-grid-dim-btn"
            disabled={rows >= 8}
            onClick={() => resizeGrid(rows + 1, cols)}
            aria-label="Increase rows"
          >
            <Plus size={10} />
          </button>
        </div>
        <div className="mesh-grid-dim-group">
          <span className="mesh-grid-dim-label">Cols</span>
          <button
            type="button"
            className="mesh-grid-dim-btn"
            disabled={cols <= 2}
            onClick={() => resizeGrid(rows, cols - 1)}
            aria-label="Decrease columns"
          >
            <Minus size={10} />
          </button>
          <span className="mesh-grid-dim-value">{cols}</span>
          <button
            type="button"
            className="mesh-grid-dim-btn"
            disabled={cols >= 8}
            onClick={() => resizeGrid(rows, cols + 1)}
            aria-label="Increase columns"
          >
            <Plus size={10} />
          </button>
        </div>
      </div>

      {/* Active Vertex Properties */}
      {activeV && (
        <div className="mesh-grid-vertex-props">
          <div className="mesh-anchor-details-header">
            <span className="section-caption">
              VERTEX {Math.floor(active / cols) + 1},{(active % cols) + 1}
            </span>
          </div>

          <div className="mesh-grid-color-row">
            <input
              type="color"
              value={activeV.color.slice(0, 7)}
              aria-label={`Color for grid vertex ${active + 1}`}
              onChange={e => updateVertexColor(active, e.currentTarget.value + activeV.color.slice(7))}
            />
            <input
              className="mesh-stop-hex"
              key={activeV.color}
              defaultValue={activeV.color.toUpperCase()}
              spellCheck={false}
              maxLength={9}
              aria-label={`Hex color for grid vertex ${active + 1}`}
              onBlur={e => {
                const hex = e.currentTarget.value.trim()
                if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(hex)) updateVertexColor(active, hex)
                else e.currentTarget.value = activeV.color.toUpperCase()
              }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            />
          </div>

          <MeshGridRange
            label="Tangent X"
            min={-1}
            max={1}
            step={0.05}
            value={activeV.tx}
            onChange={tx => updateVertexTangent(active, tx, activeV.ty)}
          />
          <MeshGridRange
            label="Tangent Y"
            min={-1}
            max={1}
            step={0.05}
            value={activeV.ty}
            onChange={ty => updateVertexTangent(active, activeV.tx, ty)}
          />
        </div>
      )}

      {/* Smoothing Control */}
      <div className="shader-divider" />
      <span className="section-caption">PATCH SMOOTHING</span>
      <MeshGridRange
        label="Bicubic smoothing"
        value={grid.smoothing}
        onChange={smoothing => updateGrid({ smoothing })}
      />

      {/* Grid Tools */}
      <div className="mesh-tool-bar" role="toolbar" aria-label="Grid mesh tools">
        <div className="mesh-tool-group">
          <span className="mesh-tool-label">Tools</span>
          <button
            type="button"
            className="mesh-tool-btn"
            title="Reset all tangent handles"
            aria-label="Reset tangent handles"
            onClick={resetTangents}
          >
            <RotateCcw size={11} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            className="mesh-tool-btn"
            title="Synthesize procedural color field"
            aria-label="Synthesize color field"
            onClick={() => synthesizeGridField(synthHarmony)}
          >
            <Wand2 size={11} />
            <span>Synthesize</span>
          </button>
          <button
            type="button"
            className="mesh-tool-btn"
            title="Disable grid topology"
            onClick={() => updateMesh({ grid: undefined })}
          >
            <Grid size={11} />
            <span>Freeform</span>
          </button>
        </div>
      </div>

      {/* Color Field Synthesizer */}
      <div className="mesh-synthesizer-section" role="region" aria-label="Grid Color Field Synthesizer">
        <div className="mesh-synthesizer-header">
          <span className="section-caption">GRID FIELD SYNTHESIZER</span>
          <span className="shader-engine-mark">GPU BICUBIC</span>
        </div>
        <div className="mesh-synthesizer-base-row">
          <span className="mesh-synthesizer-base-label">Seed vertex {Math.floor(active / cols) + 1},{(active % cols) + 1}:</span>
          <span className="mesh-synthesizer-base-swatch" style={{ background: activeV?.color ?? '#81adec' }} />
          <span className="mesh-synthesizer-base-hex">{(activeV?.color ?? '#81adec').toUpperCase()}</span>
        </div>
        <div className="mesh-harmony-chips" role="group" aria-label="Color harmony modes">
          {meshHarmonyModes.map(mode => (
            <button
              key={mode}
              type="button"
              className={`mesh-harmony-chip ${synthHarmony === mode ? 'active' : ''}`}
              onClick={() => setSynthHarmony(mode)}
            >
              {mode.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mesh-synthesize-btn"
          title={`Synthesize ${synthHarmony} color field across grid`}
          aria-label={`Synthesize ${synthHarmony} color field`}
          onClick={() => synthesizeGridField(synthHarmony)}
        >
          <Sparkles size={11} />
          <span>Synthesize {synthHarmony.toUpperCase()} field</span>
        </button>
      </div>

      {/* All Grid Vertices (compact list) */}
      <div className="mesh-grid-vertex-list">
        <span className="section-caption">ALL VERTICES</span>
        <div className="mesh-grid-vertex-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {vertices.map((vertex, index) => (
            <button
              key={index}
              type="button"
              className={`mesh-grid-vertex-chip ${index === active ? 'active' : ''}`}
              style={{ background: vertex.color }}
              aria-pressed={index === active}
              title={`Vertex ${Math.floor(index / cols) + 1},${(index % cols) + 1}: ${vertex.color}`}
              onClick={() => setActiveVertex(index)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function MeshGridRange({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}) {
  const id = useId()
  return (
    <div className="shader-slider">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{value.toFixed(2)}</output>
      <input
        id={id}
        type="range"
        aria-label={`Grid mesh ${label}`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(event.currentTarget.valueAsNumber)}
      />
    </div>
  )
}
