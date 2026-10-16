import { useState } from 'react'
import { Plus, RotateCcw, Trash2 } from 'lucide-react'
import type { SceneStore } from './store'
import type { ComponentOverrides, ComponentProperty, SceneElement } from './types'
import { subtree } from './components'
import { ComponentStateMachineEditor } from './ComponentStateMachineEditor'
import { getEffectiveStateMachine, DEFAULT_INTERACTIVE_STATES } from './stateMachine'

/** Capture visual channels, preserving token/style links for future theme changes. */
function capture(node: SceneElement): ComponentOverrides {
  return {
    style: { ...node.style },
    properties: {
      width: node.width, height: node.height,
      ...('cornerRadius' in node ? { cornerRadius: node.cornerRadius } : {}),
      ...(node.type === 'text' ? { text: node.text, fontFamily: node.fontFamily, fontSize: node.fontSize, fontWeight: node.fontWeight, lineHeight: node.lineHeight, letterSpacing: node.letterSpacing, textAlign: node.textAlign } : {}),
    },
    ...(node.tokenBindings ? { tokenBindings: node.tokenBindings } : {}),
    ...(node.sharedStyleBindings ? { sharedStyleBindings: node.sharedStyleBindings } : {}),
  }
}

export function ComponentPropertiesPanel({ store, master, root, disabled }: { store: SceneStore; master: SceneElement; root: SceneElement; disabled: boolean }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ComponentProperty['kind']>('variant')
  const [options, setOptions] = useState('Default, Accent')
  const [target, setTarget] = useState(master.id)
  const [error, setError] = useState('')
  if (master.component?.kind !== 'master') return null
  const properties = master.component.properties ?? []
  const instance = root.component?.kind === 'instance' ? root.component : undefined
  const machine = getEffectiveStateMachine(master)
  const variantProp = properties.find(p => p.kind === 'variant')
  const availableStates = machine?.states ?? (variantProp && variantProp.kind === 'variant' ? variantProp.options.map(o => o.value) : DEFAULT_INTERACTIVE_STATES)
  const layers = subtree(store.getSnapshot().elements, master.id)
  const perform = (action: () => void) => { try { action(); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to edit property') } }
  const replace = (next: ComponentProperty) => store.setComponentProperties(master.id, properties.map(property => property.id === next.id ? next : property))
  const add = () => perform(() => {
    const source = layers.find(layer => layer.id === target)
    const common = { id: crypto.randomUUID(), name: name.trim() }
    let property: ComponentProperty
    if (kind === 'variant') {
      const values = options.split(',').map(value => value.trim()).filter(Boolean)
      property = { ...common, kind, defaultValue: values[0], options: values.map(value => ({ value, layers: {} })) }
    } else {
      if (!source || (kind === 'text' && source.type !== 'text')) throw new Error('Choose a text layer for a text slot')
      property = kind === 'text' ? { ...common, kind, sourceId: source.id, defaultValue: source.type === 'text' ? source.text : '' } : { ...common, kind, sourceId: source.id, defaultValue: source.visible }
    }
    store.setComponentProperties(master.id, [...properties, property]); setAdding(false); setName('')
  })
  return <div className="component-properties" data-testid="component-properties">
    <div className="component-section-heading"><span className="section-caption">PROPERTIES</span>{!instance && <button className="quiet-button" title="Add component property" aria-label="Add component property" disabled={disabled} onClick={() => setAdding(value => !value)}><Plus size={13} /></button>}</div>
    {!properties.length && <p>{instance ? 'This master has no configurable properties.' : 'Expose variants, visibility switches and text slots.'}</p>}
    {instance && (machine || (variantProp && variantProp.options.length > 1)) && <div className={`component-property ${instance.activeState ? 'is-local' : ''}`}>
      <div className="component-property-heading"><span>Interactive State<small>Micro-interaction</small></span>{instance.activeState && <button className="quiet-button" disabled={disabled} aria-label="Reset interactive state" title="Use default state" onClick={() => perform(() => store.setComponentActiveState(root.id, null))}><RotateCcw size={11} /></button>}</div>
      <select className="property-input" aria-label="Interactive State" disabled={disabled} value={instance.activeState ?? 'default'} onChange={event => perform(() => store.setComponentActiveState(root.id, event.currentTarget.value === 'default' ? null : event.currentTarget.value))}>
        {availableStates.map(stateName => <option key={stateName} value={stateName}>{stateName} {stateName === (machine?.initial ?? 'default') ? '(Default)' : ''}</option>)}
      </select>
    </div>}
    {properties.map(property => {
      const value = instance?.propertyValues?.[property.id] ?? property.defaultValue
      const local = instance && Object.hasOwn(instance.propertyValues ?? {}, property.id)
      const change = (next: string | boolean) => perform(() => instance ? store.setComponentProperty(root.id, property.id, next) : replace({ ...property, defaultValue: next } as ComponentProperty))
      return <div key={property.id} className={`component-property ${local ? 'is-local' : ''}`}>
        <div className="component-property-heading"><span>{property.name}<small>{property.kind === 'boolean' ? 'Visibility' : property.kind === 'text' ? 'Text slot' : 'Variant'}</small></span>{instance ? <button className="quiet-button" disabled={!local || disabled} aria-label={`Reset ${property.name}`} title="Use master default" onClick={() => perform(() => store.setComponentProperty(root.id, property.id, null))}><RotateCcw size={11} /></button> : <button className="quiet-button" disabled={disabled} aria-label={`Remove ${property.name}`} onClick={() => perform(() => store.setComponentProperties(master.id, properties.filter(item => item.id !== property.id)))}><Trash2 size={11} /></button>}</div>
        {property.kind === 'variant' ? <select className="property-input" aria-label={property.name} disabled={disabled} value={String(value)} onChange={event => change(event.currentTarget.value)}>{property.options.map(option => <option key={option.value} value={option.value}>{option.value}</option>)}</select> : property.kind === 'boolean' ? <label className="component-property-switch"><input type="checkbox" aria-label={property.name} disabled={disabled} checked={Boolean(value)} onChange={event => change(event.currentTarget.checked)} /><span>{value ? 'Visible' : 'Hidden'}</span></label> : <input className="property-input" aria-label={property.name} disabled={disabled} value={String(value)} onChange={event => change(event.currentTarget.value)} />}
        {!instance && property.kind === 'variant' && <div className="component-variant-capture">{property.options.map(option => <div key={option.value}><span>{option.value}<small>{Object.keys(option.layers).length ? `${Object.keys(option.layers).length} captured layers` : 'Inherits master'}</small></span><button className="text-action" disabled={disabled} title="Save the current master’s appearance for this option" aria-label={`Capture ${property.name} ${option.value}`} onClick={() => perform(() => replace({ ...property, options: property.options.map(item => item.value === option.value ? { ...item, layers: Object.fromEntries(layers.map(layer => [layer.id, capture(layer)])) } : item) }))}>Capture</button>{Object.keys(option.layers).length > 0 && <button className="quiet-button" disabled={disabled} title="Restore inheritance" aria-label={`Clear ${property.name} ${option.value}`} onClick={() => perform(() => replace({ ...property, options: property.options.map(item => item.value === option.value ? { ...item, layers: {} } : item) }))}><RotateCcw size={11} /></button>}</div>)}</div>}
      </div>
    })}
    {!instance && properties.some(property => property.kind === 'variant') && <p>Edit the master, then capture an option. Captured tokens stay linked; uncaptured options inherit the master.</p>}
    {!instance && <ComponentStateMachineEditor store={store} master={master} disabled={disabled} />}
    {adding && !instance && <form className="component-property-form" onSubmit={event => { event.preventDefault(); add() }}>
      <input className="property-input" autoFocus aria-label="Property name" placeholder="Property name" required maxLength={100} value={name} onChange={event => setName(event.currentTarget.value)} />
      <select className="property-input" aria-label="Property kind" value={kind} onChange={event => { const next = event.currentTarget.value as ComponentProperty['kind']; setKind(next); if (next === 'text') setTarget(layers.find(layer => layer.type === 'text')?.id ?? master.id) }}><option value="variant">Variant switch</option><option value="boolean">Visibility switch</option><option value="text">Text slot</option></select>
      {kind === 'variant' ? <input className="property-input" aria-label="Variant options" placeholder="Default, Accent" required value={options} onChange={event => setOptions(event.currentTarget.value)} /> : <select className="property-input" aria-label="Property layer" value={target} onChange={event => setTarget(event.currentTarget.value)}>{layers.filter(layer => kind !== 'text' || layer.type === 'text').map(layer => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select>}
      <button className="component-action primary" disabled={disabled} type="submit"><Plus size={12} />Add property</button>
    </form>}
    {error && <p className="component-error" role="alert">{error}</p>}
  </div>
}
