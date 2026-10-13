import { Pause, Play, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { createShader, motionControls, shaderCatalog, shaderKinds, updateShaderParameter } from './catalog'
import type { ShaderControl, ShaderDefinition, ShaderKind, ShaderMotion, ShaderPaint, ShaderValue } from './types'
import './shaders.css'

function Slider({ control, value, onChange }: { control: Extract<ShaderControl, { type: 'number' }>; value: number; onChange: (value: number) => void }) {
  const change = (next: number) => { if (Number.isFinite(next)) onChange(Math.max(control.min, Math.min(control.max, next))) }
  return <div className="shader-slider"><label htmlFor={`shader-${control.key}`}>{control.label}</label>
    <input id={`shader-${control.key}`} type="number" aria-label={`Shader ${control.label}`} value={Number(value.toFixed(3))} min={control.min} max={control.max} step={control.step} onChange={event => change(event.currentTarget.valueAsNumber)} />
    <input type="range" aria-label={`Shader ${control.label} slider`} value={value} min={control.min} max={control.max} step={control.step} onChange={event => change(event.currentTarget.valueAsNumber)} />
  </div>
}

function ImageSource({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [error, setError] = useState('')
  return <label className="property-label">Source image<input className="property-input" key={value} aria-label="Shader source image" defaultValue={value} spellCheck={false} onBlur={event => {
    try { onChange(event.currentTarget.value.trim()); setError('') } catch { setError('Use a local path, image data URL, or an HTTP image URL.') }
  }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />{error && <span className="shader-image-error" role="alert">{error}</span>}</label>
}

export function ShaderInspector({ paint, onChange, target, image, showPicker = true, allowRemove = true, onBrowse }: { paint: ShaderPaint | null; onChange: (paint: ShaderPaint | null) => void; target: string; image?: string; showPicker?: boolean; allowRemove?: boolean; onBrowse?: () => void }) {
  const definition: ShaderDefinition | undefined = paint ? shaderCatalog[paint.kind] : undefined
  const params = paint?.params as Readonly<Record<string, ShaderValue>> | undefined
  const parameter = (key: string, value: ShaderValue) => { if (paint) onChange(updateShaderParameter(paint, key, value)) }
  const motion = (changes: Partial<ShaderMotion>) => { if (paint) onChange({ ...paint, ...changes }) }
  return <div className="inspector-section shader-section">
    <div className="shader-heading"><span className="section-caption">PAPER SHADERS</span>{onBrowse ? <button type="button" className="quiet-button" aria-label="Browse shader library" title="Browse shader library (S)" onClick={onBrowse} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--paper-accent-text)', padding: 0 }}><Sparkles size={11} />Catalog</button> : <span className="shader-engine-mark">FX / 07</span>}</div>
    {showPicker && <label className="property-select">Effect<select aria-label="Paper shader effect" value={paint?.kind ?? ''} onChange={event => onChange(event.currentTarget.value ? createShader(event.currentTarget.value as ShaderKind, image) : null)}>
      <option value="">None</option>{shaderKinds.map(kind => <option key={kind} value={kind}>{shaderCatalog[kind].label}</option>)}
    </select></label>}
    {paint && definition && params ? <>
      <div className="shader-target"><i />{target}</div><p className="shader-description">{definition.description}</p>
      {definition.controls.map(control => {
        const value = params[control.key]
        if (control.type === 'number') return <Slider key={control.key} control={control} value={value as number} onChange={next => parameter(control.key, next)} />
        if (control.type === 'select') return <label key={control.key} className="property-select">{control.label}<select aria-label={`Shader ${control.label}`} value={value as string} onChange={event => parameter(control.key, event.currentTarget.value)}>{control.options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
        if (control.type === 'image') return <ImageSource key={control.key} value={value as string} onChange={next => parameter(control.key, next)} />
        if (control.type === 'color') return <div key={control.key}><div className="property-heading"><span>{control.label}</span></div><label className="property-color"><input type="color" aria-label={`Shader ${control.label} color`} value={(value as string).slice(0, 7)} onChange={event => parameter(control.key, event.currentTarget.value)} /><input key={value as string} aria-label={`Shader ${control.label} hex`} defaultValue={value as string} spellCheck={false} onBlur={event => { const hex = event.currentTarget.value.trim(); if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(hex)) parameter(control.key, hex); else event.currentTarget.value = value as string }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label></div>
        const colors = value as readonly string[]
        return <div key={control.key}><div className="property-heading"><span>Palette</span><span className="shader-engine-mark">{colors.length} / {control.max}</span></div><div className="shader-palette">{colors.map((hex, index) => <div className="shader-swatch" key={index}>
          <input type="color" aria-label={`Shader palette color ${index + 1}`} value={hex.slice(0, 7)} onChange={event => parameter(control.key, colors.map((color, i) => i === index ? event.currentTarget.value : color))} />
          {colors.length > 2 && <button aria-label={`Remove shader color ${index + 1}`} onClick={() => parameter(control.key, colors.filter((_, i) => i !== index))}>×</button>}
        </div>)}{colors.length < control.max && <button className="shader-add-color" aria-label="Add shader palette color" onClick={() => parameter(control.key, [...colors, '#81adec'])}>+</button>}</div></div>
      })}
      <div className="shader-divider" /><span className="section-caption">MOTION & POSITION</span>
      <div className="shader-mode" role="group" aria-label="Shader playback"><button aria-pressed={paint.animated} onClick={() => motion({ animated: true })}><Play size={10} />Animated</button><button aria-pressed={!paint.animated} onClick={() => motion({ animated: false })}><Pause size={10} />Static</button></div>
      {motionControls.filter(control => control.key !== 'speed' || paint.animated).map(control => <Slider key={control.key} control={control as Extract<ShaderControl, { type: 'number' }>} value={paint[control.key as keyof Omit<ShaderMotion, 'animated'>]} onChange={value => motion({ [control.key]: value })} />)}
      <div className="shader-actions"><button onClick={() => onChange(createShader(paint.kind, image))}>Reset parameters</button>{allowRemove && <button onClick={() => onChange(null)}>Remove effect</button>}</div>
    </> : <p className="shader-description"><Sparkles size={11} aria-hidden="true" /> Add texture, color and a little motion.</p>}
  </div>
}
