import { Check, Code2, Copy, Download, Plus, RotateCcw, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { freezeShader, validateShader } from './catalog'
import { clampUnit, createMeshMaterial, defaultMeshAnchor, meshToSurface, surfaceToMesh } from './mesh'
import { MeshAnchorHandle } from './MeshAnchorHandle'
import { ShaderSurface } from './ShaderSurface'
import { exportMeshReact } from './shaderExport'
import type { MeshMaterial, ShaderPaint } from './types'
import { grainBlendModes } from './types'

type MeshPaint = Extract<ShaderPaint, { kind: 'mesh-gradient' }>

export function MeshInspector({ paint, onChange, onGestureStart, onGestureEnd }: { paint: MeshPaint; onChange: (paint: ShaderPaint) => void; onGestureStart?: () => boolean | void; onGestureEnd?: (cancel: boolean) => void }) {
  const [selected, setSelected] = useState(0)
  const [copiedSource, setCopiedSource] = useState('')
  const [copyError, setCopyError] = useState('')
  const preview = useRef<HTMLDivElement>(null)
  const before = useRef<MeshPaint | null>(null)
  const mesh = paint.mesh
  const source = exportMeshReact(paint)
  const commit = (next: MeshPaint) => { validateShader(next); onChange(freezeShader(next)) }
  const update = (changes: Partial<MeshMaterial>) => { if (mesh) commit({ ...paint, mesh: { ...mesh, ...changes } }) }
  const active = Math.min(selected, (mesh?.anchors.length ?? 1) - 1)
  const anchor = mesh?.anchors[active]
  const start = () => {
    if (onGestureStart?.() === false) return false
    before.current = paint
  }
  const end = (cancel: boolean) => {
    if (onGestureEnd) onGestureEnd(cancel)
    else if (cancel && before.current) onChange(before.current)
    before.current = null
  }
  return <div className="mesh-studio">
    <div className="mesh-studio-heading"><span className="section-caption">MESH / COLOR FIELD</span><span className="shader-engine-mark">{paint.params.colors.length} STOPS</span></div>
    {!mesh ? <button className="mesh-enable" onClick={() => commit({ ...paint, mesh: createMeshMaterial(paint.params.colors.length) })}>Open interactive mesh studio</button> : <>
      <div className="mesh-editor-grid"><div ref={preview} className="mesh-editor-preview" aria-label="Interactive mesh material preview">
        <ShaderSurface paint={paint} />
        {mesh.anchors.map((point, index) => {
          const position = meshToSurface(point, paint)
          return <MeshAnchorHandle key={index} index={index} selected={index === active} color={paint.params.colors[index]} anchor={point} style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
            project={(x, y) => { const rect = preview.current!.getBoundingClientRect(); return surfaceToMesh({ x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height }, paint) }}
            onStart={() => { setSelected(index); return start() }} onEnd={end}
            onMove={next => update({ anchors: mesh.anchors.map((value, i) => i === index ? { ...value, ...next } : value) })} />
        })}
      </div></div>
      <p className="mesh-hint">Drag a color into place. Arrow keys for precision.<br />Anchors also appear on the selected canvas layer.</p>
      <div className="mesh-stops" aria-label="Mesh color stops">{paint.params.colors.map((color, index) => <div key={index} className="mesh-stop" data-active={index === active}>
        <button className="mesh-stop-index" aria-label={`Edit mesh stop ${index + 1}`} aria-pressed={index === active} onClick={() => setSelected(index)}>{String(index + 1).padStart(2, '0')}</button>
        <input type="color" aria-label={`Mesh stop ${index + 1} color`} value={color.slice(0, 7)} onFocus={() => setSelected(index)} onChange={event => commit({ ...paint, params: { ...paint.params, colors: paint.params.colors.map((value, i) => i === index ? event.currentTarget.value + color.slice(7) : value) } })} />
        <input className="mesh-stop-hex" key={color} aria-label={`Mesh stop ${index + 1} hex`} defaultValue={color.toUpperCase()} spellCheck={false} maxLength={9} onFocus={() => setSelected(index)} onBlur={event => {
          const hex = event.currentTarget.value.trim()
          if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(hex)) commit({ ...paint, params: { ...paint.params, colors: paint.params.colors.map((value, i) => i === index ? hex : value) } })
          else event.currentTarget.value = color.toUpperCase()
        }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
        <button aria-label={`Remove mesh stop ${index + 1}`} disabled={mesh.anchors.length <= 2} onClick={() => { setSelected(Math.max(0, index - 1)); commit({ ...paint, params: { ...paint.params, colors: paint.params.colors.filter((_, i) => i !== index) }, mesh: { ...mesh, anchors: mesh.anchors.filter((_, i) => i !== index) } }) }}><X size={11} /></button>
      </div>)}</div>
      <div className="mesh-stop-actions"><button disabled={mesh.anchors.length >= 10} onClick={() => { setSelected(mesh.anchors.length); commit({ ...paint, params: { ...paint.params, colors: [...paint.params.colors, '#81adec'] }, mesh: { ...mesh, anchors: [...mesh.anchors, defaultMeshAnchor(mesh.anchors.length)] } }) }}><Plus size={11} />Add stop</button><button title="Reset anchor positions" aria-label="Reset mesh anchors" onClick={() => update({ anchors: mesh.anchors.map((_, i) => defaultMeshAnchor(i)) })}><RotateCcw size={11} /></button></div>
      {anchor && <><span className="section-caption">ANCHOR {String(active + 1).padStart(2, '0')}</span><div className="mesh-position-fields">{(['x', 'y'] as const).map(axis => <label key={axis}>{axis.toUpperCase()}<input aria-label={`Mesh anchor ${axis.toUpperCase()} percent`} type="number" min={0} max={100} step={1} value={Number((anchor[axis] * 100).toFixed(1))} onChange={event => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n)) update({ anchors: mesh.anchors.map((value, i) => i === active ? { ...value, [axis]: clampUnit(n / 100) } : value) }) }} /><span>%</span></label>)}</div>
        <MeshRange label="Anchor influence" min={.1} max={2} value={anchor.radius} onChange={radius => update({ anchors: mesh.anchors.map((value, i) => i === active ? { ...value, radius } : value) })} /></>}
      <div className="shader-divider" /><span className="section-caption">PROCEDURAL FINISH</span>
      <MeshRange label="Turbulence" value={mesh.turbulence} onChange={turbulence => update({ turbulence })} />
      <MeshRange label="Noise frequency" min={1} max={12} step={.1} value={mesh.frequency} onChange={frequency => update({ frequency })} />
      <MeshRange label="Chromatic aberration" value={mesh.chromaticAberration} onChange={chromaticAberration => update({ chromaticAberration })} />
      <MeshRange label="Grain mixer" value={paint.params.grainMixer} onChange={grainMixer => commit({ ...paint, params: { ...paint.params, grainMixer } })} />
      <MeshRange label="Grain overlay" value={paint.params.grainOverlay} onChange={grainOverlay => commit({ ...paint, params: { ...paint.params, grainOverlay } })} />
      <label className="property-select">Grain blending<select aria-label="Mesh grain blending" value={mesh.grainBlend} onChange={event => update({ grainBlend: event.currentTarget.value as MeshMaterial['grainBlend'] })}>{grainBlendModes.map(mode => <option key={mode} value={mode}>{mode.replace('-', ' ')}</option>)}</select></label>
    </>}
    <details className="mesh-code"><summary><Code2 size={12} />React shader code<span>JSX</span></summary><p>Ready to paste. Set a height on the parent.</p><pre tabIndex={0} aria-label="React shader source"><code>{source}</code></pre><div className="mesh-code-actions"><button onClick={async () => { try { await navigator.clipboard.writeText(source); setCopiedSource(source); setCopyError('') } catch { setCopyError('Clipboard unavailable. Download the source instead.') } }}>{copiedSource === source ? <Check size={12} /> : <Copy size={12} />}{copiedSource === source ? 'Copied' : 'Copy React'}</button><button aria-label="Download React shader" onClick={() => { const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' })); const link = document.createElement('a'); link.href = url; link.download = 'PaperMaterial.tsx'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}><Download size={12} />.tsx</button></div><span role="status" className="mesh-copy-status">{copyError || (copiedSource === source ? 'React source copied.' : '')}</span></details>
  </div>
}

function MeshRange({ label, value, onChange, min = 0, max = 1, step = .01 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  const id = useId()
  return <div className="shader-slider"><label htmlFor={id}>{label}</label><output htmlFor={id}>{value.toFixed(2)}</output><input id={id} type="range" aria-label={`Mesh ${label}`} min={min} max={max} step={step} value={value} onChange={event => onChange(event.currentTarget.valueAsNumber)} /></div>
}
