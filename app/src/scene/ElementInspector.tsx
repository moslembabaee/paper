import type { ReactNode } from 'react'
import { TokenSelector } from '../tokens/TokenSelector'
import type { TokenProperty } from '../tokens/types'
import { ArrowDown, ArrowUp, ChevronRight, Circle, LockKeyhole, Trash2, X } from 'lucide-react'
import type { ViewportController } from '../canvas/ViewportController'
import { getWorldBounds } from './geometry'
import type { SceneStore } from './store'
import type { ElementPatch, ElementType, SceneElement } from './types'
import { useScene } from './useScene'
import { useRangeHistory } from './useRangeHistory'
import { ShaderInspector } from '../shaders/ShaderInspector'
import { ArrangeBar } from './ArrangeBar'
import { BooleanBar } from './BooleanBar'
import { AutoLayoutInspector } from './AutoLayoutInspector'

function NumberField({ label, value, onChange, min, max, step = 1, binding, disabled = false }: { disabled?: boolean; binding?: ReactNode; label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <div className="token-number-field"><label className="property-number"><span>{label}</span><input key={value} aria-label={label} disabled={disabled} type="number" defaultValue={Number(value.toFixed(3))} min={min} max={max} step={step} onBlur={(event) => {
    const next = event.currentTarget.valueAsNumber
    if (Number.isFinite(next) && (min === undefined || next >= min) && (max === undefined || next <= max)) { if (next !== value) onChange(next) }
    else event.currentTarget.value = String(value)
  }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>{binding}</div>
}

function ColorField({ label, value, onChange, binding }: { binding?: ReactNode; label: string; value: string; onChange: (value: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#080808'
  return <div className="token-color-field"><label className="property-color"><input type="color" aria-label={`${label} color picker`} value={hex} onChange={event => onChange(event.currentTarget.value)} /><input key={value} aria-label={`${label} color`} defaultValue={value} spellCheck={false} onBlur={event => { const next = event.currentTarget.value.trim(); if (CSS.supports('color', next)) { if (next !== value) onChange(next) } else event.currentTarget.value = value }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>{binding}</div>
}

export function ElementInspector({ store, controller, grid, onGridChange, onOpenShaders }: { store: SceneStore; controller: ViewportController; grid: boolean; onGridChange: () => void; onOpenShaders?: () => void }) {
  const onRangePointerDown = useRangeHistory(store)
  const state = useScene(store, snapshot => snapshot)
  const node = state.selection.length === 1 ? state.elements[state.selection[0]] : undefined
  const parent = node?.parentId ? state.elements[node.parentId] : undefined
  const managed = parent?.type === 'frame' && !!parent.layout
  const binding = (property: TokenProperty, label: string, color = false) => node ? <TokenSelector key={`${node.id}-${property}`} store={store} node={node} property={property} label={label} tokens={state.tokens} color={color} /> : null
  const patch = (changes: ElementPatch<ElementType>) => { if (node) store.update(node.id, node.type, changes) }
  const style = (changes: Partial<SceneElement['style']>) => patch({ style: changes })
  const parentOptions = Object.values(state.elements).filter(candidate => {
    if (candidate.type !== 'frame' || candidate.id === node?.id) return false
    let parent: SceneElement | undefined = candidate
    while (parent) { if (parent.id === node?.id) return false; parent = parent.parentId === null ? undefined : state.elements[parent.parentId] }
    return !store.isLocked(candidate.id)
  })
  return <aside className="inspector-panel" data-testid="inspector-panel" aria-label="Canvas properties" onPointerDownCapture={onRangePointerDown}>
    <div className="panel-heading"><span>{node ? node.type === 'frame' ? 'Frame' : node.type[0].toUpperCase() + node.type.slice(1) : state.selection.length > 1 ? `${state.selection.length} layers` : 'Canvas'}</span>{state.selection.length ? <button className="quiet-button" aria-label="Deselect elements" onClick={() => store.select([])}><X size={14} /></button> : <Circle size={11} />}</div>
    <ArrangeBar store={store} controller={controller} />
    <BooleanBar key={state.selection.join(':')} store={store} />
    {node ? <>
      <div className="inspector-section">
        <span className="section-caption">SELECTION</span>
        <input className="property-name" key={node.id + node.name} aria-label="Layer name" defaultValue={node.name} onBlur={event => { const name = event.currentTarget.value.trim(); if (name) patch({ name }); else event.currentTarget.value = node.name }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
        <div className="property-pair"><NumberField disabled={managed} binding={managed ? null : binding('x', 'X')} label="X" value={node.x} onChange={x => patch({ x })} /><NumberField disabled={managed} binding={managed ? null : binding('y', 'Y')} label="Y" value={node.y} onChange={y => patch({ y })} /></div>
        <div className="property-pair"><NumberField binding={binding('width', 'Width')} label="Width" value={node.width} min={.01} onChange={width => patch({ width })} /><NumberField binding={binding('height', 'Height')} label="Height" value={node.height} min={.01} onChange={height => patch({ height })} /></div>
        <div className="property-pair"><NumberField label="Rotation" value={node.rotation} onChange={rotation => patch({ rotation })} /><NumberField label="Opacity %" value={node.style.opacity * 100} min={0} max={100} onChange={opacity => style({ opacity: opacity / 100 })} /></div>
        {'cornerRadius' in node && <NumberField binding={binding('cornerRadius', 'Radius')} label="Radius" value={node.cornerRadius} min={0} onChange={cornerRadius => patch({ cornerRadius })} />}
        <button className="text-action" onClick={() => controller.fit(getWorldBounds(state, node.id))}>Focus element <ChevronRight size={12} /></button>
      </div>
      <AutoLayoutInspector key={node.id} node={node} parent={parent} store={store} />
      <div className="inspector-section">
        <span className="section-caption">APPEARANCE</span>
        <div className="property-heading"><span>Fill</span><button className="quiet-button paint-toggle" aria-label="Toggle fill" aria-pressed={node.style.fill !== null} onClick={() => style({ fill: node.style.fill === null ? '#81adec' : null })}>{node.style.fill === null ? '+' : '−'}</button></div>
        {node.style.fill !== null && <ColorField binding={binding('fill', 'Fill', true)} label="Fill" value={node.style.fill} onChange={fill => style({ fill })} />}
        <div className="property-heading"><span>Stroke</span><button className="quiet-button paint-toggle" aria-label="Toggle stroke" aria-pressed={node.style.stroke !== null} onClick={() => style({ stroke: node.style.stroke ? null : { color: '#080808', width: 1, dash: [] } })}>{node.style.stroke ? '−' : '+'}</button></div>
        {node.style.stroke && <><ColorField binding={binding('stroke', 'Stroke', true)} label="Stroke" value={node.style.stroke.color} onChange={color => style({ stroke: { ...node.style.stroke!, color } })} /><NumberField label="Stroke width" value={node.style.stroke.width} min={0} step={.5} onChange={width => style({ stroke: { ...node.style.stroke!, width } })} /></>}
        <div className="property-heading"><span>Shadow</span><button className="quiet-button paint-toggle" aria-label="Toggle shadow" aria-pressed={node.style.shadow !== null} onClick={() => style({ shadow: node.style.shadow ? null : { color: '#08080833', x: 0, y: 4, blur: 16 } })}>{node.style.shadow ? '−' : '+'}</button></div>
        {node.style.shadow && <><ColorField label="Shadow" value={node.style.shadow.color} onChange={color => style({ shadow: { ...node.style.shadow!, color } })} /><div className="property-pair"><NumberField label="Shadow X" value={node.style.shadow.x} onChange={x => style({ shadow: { ...node.style.shadow!, x } })} /><NumberField label="Shadow Y" value={node.style.shadow.y} onChange={y => style({ shadow: { ...node.style.shadow!, y } })} /></div><NumberField label="Blur" value={node.style.shadow.blur} min={0} onChange={blur => style({ shadow: { ...node.style.shadow!, blur } })} /></>}
      </div>
      <ShaderInspector key={node.id} paint={node.style.shader ?? null} onChange={shader => style({ shader })} target={node.type === 'image' ? 'Image effect' : 'Layer fill'} image={node.type === 'image' ? node.src : undefined} onBrowse={onOpenShaders} />
      {node.type === 'text' && <div className="inspector-section"><span className="section-caption">TYPOGRAPHY</span>
        <textarea className="property-textarea" key={node.id + node.text} aria-label="Text content" defaultValue={node.text} onBlur={event => store.update(node.id, 'text', { text: event.currentTarget.value })} />
        <label className="property-label">Font family<input className="property-input" key={node.id + node.fontFamily} aria-label="Font family" defaultValue={node.fontFamily} onBlur={event => { const fontFamily = event.currentTarget.value.trim(); if (fontFamily && fontFamily !== node.fontFamily) store.update(node.id, 'text', { fontFamily }); else event.currentTarget.value = node.fontFamily }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>{binding('fontFamily', 'Font family')}
        <div className="property-pair"><NumberField binding={binding('fontSize', 'Font size')} label="Font size" value={node.fontSize} min={1} onChange={fontSize => store.update(node.id, 'text', { fontSize })} /><NumberField binding={binding('fontWeight', 'Weight')} label="Weight" value={node.fontWeight} min={1} max={1000} step={100} onChange={fontWeight => store.update(node.id, 'text', { fontWeight })} /></div>
        <div className="property-pair"><NumberField binding={binding('lineHeight', 'Line height')} label="Line height" value={node.lineHeight} min={.1} step={.1} onChange={lineHeight => store.update(node.id, 'text', { lineHeight })} /><NumberField binding={binding('letterSpacing', 'Tracking')} label="Tracking" value={node.letterSpacing} step={.1} onChange={letterSpacing => store.update(node.id, 'text', { letterSpacing })} /></div>
        <label className="property-select">Align<select aria-label="Text alignment" value={node.textAlign} onChange={event => store.update(node.id, 'text', { textAlign: event.currentTarget.value as typeof node.textAlign })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      </div>}
      {node.type === 'path' && <div className="inspector-section"><span className="section-caption">VECTOR PATH</span><textarea className="property-textarea property-mono" key={node.id + node.d} aria-label="SVG path data" readOnly={!!node.boolean} defaultValue={node.d} onBlur={event => { if (!node.boolean && event.currentTarget.value !== node.d) store.update(node.id, 'path', { d: event.currentTarget.value }) }} />{node.boolean && <p>Flatten the compound to edit its merged outline with the pen tool.</p>}</div>}
      {node.type === 'image' && <div className="inspector-section"><span className="section-caption">IMAGE</span><label className="property-label">Source<input className="property-input" key={node.id + node.src} aria-label="Image source" defaultValue={node.src} onBlur={event => store.update(node.id, 'image', { src: event.currentTarget.value })} /></label><label className="property-label">Alt text<input className="property-input" key={node.id + node.alt} aria-label="Image alt text" defaultValue={node.alt} onBlur={event => store.update(node.id, 'image', { alt: event.currentTarget.value })} /></label><label className="property-select">Fit<select aria-label="Image fit" value={node.fit} onChange={event => store.update(node.id, 'image', { fit: event.currentTarget.value as typeof node.fit })}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Fill</option></select></label></div>}
      <div className="inspector-section"><span className="section-caption">HIERARCHY</span>
        <label className="property-select">Parent<select aria-label="Parent frame" value={node.parentId ?? ''} onChange={event => store.reparent(node.id, event.currentTarget.value || null)}><option value="">Canvas</option>{parentOptions.map(frame => <option key={frame.id} value={frame.id}>{frame.name}</option>)}</select></label>
        {node.type === 'frame' && <div className="setting-row"><span>Clip content</span><button className={`grid-switch ${node.clipContent ? 'on' : ''}`} role="switch" aria-checked={node.clipContent} aria-label="Clip frame content" onClick={() => store.update(node.id, 'frame', { clipContent: !node.clipContent })}><span /></button></div>}
        <div className="element-actions"><button aria-label="Send backward" disabled={node.zIndex === 0} onClick={() => store.reorder(node.id, node.zIndex - 1)}><ArrowDown size={13} /></button><button aria-label="Bring forward" disabled={node.zIndex === store.getChildren(node.parentId).length - 1} onClick={() => store.reorder(node.id, node.zIndex + 1)}><ArrowUp size={13} /></button><button aria-label="Lock selected element" onClick={() => store.setLocked(node.id, true)}><LockKeyhole size={13} /></button><button aria-label="Delete selected element" onClick={() => store.remove(node.id)}><Trash2 size={13} /></button></div>
      </div>
    </> : <div className="inspector-section"><span className="section-caption">WORKING SPACE</span><h3>{state.selection.length > 1 ? 'Ideas, together.' : 'Beyond the edges.'}</h3><p>{state.selection.length > 1 ? 'Select a single layer to edit its properties.' : <>Select a layer to shape it.<br />Add something. Make it yours.</>}</p></div>}
    {state.selection.length === 0 && <ShaderInspector paint={state.backgroundShader ?? null} onChange={paint => store.setBackgroundShader(paint)} target="Canvas background" onBrowse={onOpenShaders} />}
    <div className="inspector-section"><span className="section-caption">ENGINEERING GRID</span><div className="setting-row"><span>Show grid</span><button className={`grid-switch ${grid ? 'on' : ''}`} role="switch" aria-checked={grid} aria-label="Show engineering grid" onClick={onGridChange}><span /></button></div><div className="setting-row"><span>Major interval</span><code>120 px</code></div><div className="setting-row"><span>Subdivisions</span><code>24 px</code></div></div>
    {!node && <div className="inspector-section navigation-guide"><span className="section-caption">FIND YOUR WAY</span><div><span>Pan</span><kbd>Space + drag</kbd></div><div><span>Zoom</span><kbd>Scroll / pinch</kbd></div><div><span>Actual size</span><kbd>0</kbd></div><div><span>Fit canvas</span><kbd>1</kbd></div><div><span>Multi-select</span><kbd>Shift + click</kbd></div></div>}
    <div className="inspector-bottom"><p>Your ideas.<br />Your tools. Your space.</p><span>OPEN SOURCE · SELF HOSTED</span></div>
  </aside>
}
