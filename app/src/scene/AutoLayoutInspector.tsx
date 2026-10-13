import { ArrowDown, ArrowRight, Plus, X } from 'lucide-react'
import { DEFAULT_AUTO_LAYOUT, FIXED_SIZING } from './autoLayout'
import type { SceneStore } from './store'
import type { AutoLayout, LayoutPadding, SceneElement, SizingRule } from './types'
import './autoLayout.css'

function SpacingField({ label, value, min = 0, step = 1, onChange }: { label: string; value: number; min?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="property-number"><span>{label.replace('Padding ', '')}</span><input key={value} aria-label={label} type="number" min={min} step={step} defaultValue={Number(value.toFixed(3))} onBlur={event => {
    const next = event.currentTarget.valueAsNumber
    if (Number.isFinite(next) && next >= min) { if (next !== value) onChange(next) }
    else event.currentTarget.value = String(value)
  }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
}

function ConstraintField({ label, value, min = 0, max, onChange }: { label: string; value?: number; min?: number; max?: number; onChange: (value: number | undefined) => void }) {
  return <label className="property-number"><span>{label.endsWith('width') ? 'W' : 'H'}</span><input key={value ?? 'none'} aria-label={label} type="number" min={min} max={max} step={1} placeholder="—" defaultValue={value === undefined ? '' : Number(value.toFixed(3))} onBlur={event => {
    const field = event.currentTarget
    const next = field.value.trim() === '' ? undefined : field.valueAsNumber
    if (next === undefined || (Number.isFinite(next) && next >= min && (max === undefined || next <= max))) {
      if (next !== value) onChange(next)
    } else field.value = value === undefined ? '' : String(value)
  }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
}

export function AutoLayoutInspector({ node, parent, store }: { node: SceneElement; parent?: SceneElement; store: SceneStore }) {
  const sizing = node.sizing ?? FIXED_SIZING
  const managed = parent?.type === 'frame' && !!parent.layout
  const layout = node.type === 'frame' ? node.layout : null
  const setLayout = (patch: Partial<AutoLayout>) => {
    if (node.type === 'frame') store.update(node.id, 'frame', { layout: { ...(layout ?? DEFAULT_AUTO_LAYOUT), ...patch } })
  }
  const setPadding = (side: keyof LayoutPadding, value: number) => setLayout({ padding: { ...(layout ?? DEFAULT_AUTO_LAYOUT).padding, [side]: value } })
  const setConstraint = (key: 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight', value: number | undefined) => {
    const next = { ...sizing, [key]: value }
    if (value === undefined) delete next[key]
    store.update(node.id, node.type, { sizing: next })
  }
  const mainAxis = parent?.type === 'frame' && parent.layout?.direction === 'vertical' ? 'height' : 'width'
  return <div className="inspector-section auto-layout-section" data-testid="auto-layout-inspector">
    {node.type === 'frame' && <>
      <div className="auto-layout-heading"><span className="section-caption">AUTO LAYOUT</span><button className="quiet-button" aria-label={layout ? 'Remove auto layout' : 'Add auto layout'} aria-pressed={!!layout} onClick={() => store.update(node.id, 'frame', { layout: layout ? null : DEFAULT_AUTO_LAYOUT })}>{layout ? <X size={13} /> : <Plus size={13} />}</button></div>
      {layout ? <>
        <div className="layout-direction" role="group" aria-label="Flow direction">
          <button aria-pressed={layout.direction === 'horizontal'} onClick={() => setLayout({ direction: 'horizontal' })}><ArrowRight size={13} />Horizontal</button>
          <button aria-pressed={layout.direction === 'vertical'} onClick={() => setLayout({ direction: 'vertical' })}><ArrowDown size={13} />Vertical</button>
        </div>
        <label className="property-select layout-wrap"><span>Wrap</span><select aria-label="Wrap mode" value={layout.wrap ?? 'nowrap'} onChange={event => setLayout({ wrap: event.currentTarget.value as AutoLayout['wrap'] })}><option value="nowrap">No wrap</option><option value="wrap">Wrap</option><option value="wrap-reverse">Wrap reverse</option></select></label>
        {layout.wrap && layout.wrap !== 'nowrap' && <label className="property-select layout-wrap"><span>Lines</span><select aria-label="Line alignment" value={layout.alignContent ?? 'start'} onChange={event => setLayout({ alignContent: event.currentTarget.value as AutoLayout['alignContent'] })}><option value="start">Start</option><option value="center">Center</option><option value="end">End</option><option value="space-between">Space between</option><option value="stretch">Stretch</option></select></label>}
        <SpacingField label="Gap" value={layout.gap} onChange={gap => setLayout({ gap })} />
        <div className="layout-alignment-grid">
          <label className="property-label">Main axis<select className="property-input" aria-label="Main axis alignment" value={layout.justify} onChange={event => setLayout({ justify: event.currentTarget.value as AutoLayout['justify'] })}><option value="start">Start</option><option value="center">Center</option><option value="end">End</option><option value="space-between">Space between</option></select></label>
          <label className="property-label">Cross axis<select className="property-input" aria-label="Cross axis alignment" value={layout.align} onChange={event => setLayout({ align: event.currentTarget.value as AutoLayout['align'] })}><option value="start">Start</option><option value="center">Center</option><option value="end">End</option></select></label>
        </div>
        <div className="layout-padding-caption"><span>Padding</span><span>T · R · B · L</span></div>
        <div className="layout-padding-grid">{(['top', 'right', 'bottom', 'left'] as const).map(side => <SpacingField key={side} label={`Padding ${side}`} value={layout.padding[side]} onChange={value => setPadding(side, value)} />)}</div>
        <p className="layout-hint">Drag the blue spacing handles on the canvas. Shift adjusts in 8 px steps; Escape cancels.</p>
      </> : <p className="layout-hint">Give this frame a flow. Children follow as you edit.</p>}
    </>}
    <div className="layout-sizing-heading">{node.type === 'frame' ? 'Frame sizing' : 'RESIZING'}</div>
    {(['width', 'height'] as const).map(axis => <label key={axis} className="property-select layout-sizing"><span>{axis === 'width' ? 'Width' : 'Height'}</span><select aria-label={`${axis === 'width' ? 'Width' : 'Height'} sizing`} value={sizing[axis]} onChange={event => store.update(node.id, node.type, { sizing: { ...sizing, [axis]: event.currentTarget.value as SizingRule } })}><option value="fixed">Fixed</option><option value="hug">Hug contents</option><option value="fill" disabled={!managed}>Fill container</option></select></label>)}
    {managed && sizing[mainAxis] === 'fill' && <>
      <SpacingField label="Flex grow" value={sizing.flexGrow ?? 1} min={.01} step={.25} onChange={flexGrow => store.update(node.id, node.type, { sizing: { ...sizing, flexGrow } })} />
      <p className="layout-hint">Fill layers share available space by this weight.</p>
    </>}
    <details className="layout-constraints">
      <summary>Size constraints</summary>
      <div className="layout-constraints-grid">
        <span>Minimum</span><span>Maximum</span>
        <ConstraintField label="Minimum width" value={sizing.minWidth} max={sizing.maxWidth} onChange={value => setConstraint('minWidth', value)} />
        <ConstraintField label="Maximum width" value={sizing.maxWidth} min={Math.max(.01, sizing.minWidth ?? 0)} onChange={value => setConstraint('maxWidth', value)} />
        <ConstraintField label="Minimum height" value={sizing.minHeight} max={sizing.maxHeight} onChange={value => setConstraint('minHeight', value)} />
        <ConstraintField label="Maximum height" value={sizing.maxHeight} min={Math.max(.01, sizing.minHeight ?? 0)} onChange={value => setConstraint('maxHeight', value)} />
      </div>
      <p className="layout-hint">Bounds apply to every sizing mode. Clear a field to release its limit.</p>
    </details>
    {managed && <p className="layout-hint">Position follows the parent flow. Reorder layers to change their place.</p>}
    {(sizing.width === 'hug' || sizing.height === 'hug') && node.type !== 'text' && node.type !== 'frame' && <p className="layout-hint">Shapes and images hug their current dimensions.</p>}
  </div>
}
