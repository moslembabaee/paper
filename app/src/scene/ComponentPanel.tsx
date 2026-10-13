import { useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowUpRight, Diamond, Component as Diamonds, Plus, RotateCcw, Search, Unlink } from 'lucide-react'
import type { ViewportController } from '../canvas/ViewportController'
import type { ComponentOverrides, SceneElement } from './types'
import type { SceneStore } from './store'
import { componentRoot, subtree } from './components'
import { getWorldBounds } from './geometry'
import { useScene } from './useScene'
import './components.css'

function overrideCount(overrides: ComponentOverrides): number {
  const stroke = overrides.style?.stroke
  return Object.keys(overrides.properties ?? {}).length + Object.keys(overrides.style ?? {}).length + (stroke ? Math.max(0, Object.keys(stroke).length - 1) : 0) + Object.keys(overrides.tokenBindings ?? {}).length
}
function overrideLabels(node: SceneElement): string[] {
  if (node.component?.kind !== 'instance') return []
  const { properties, style, tokenBindings } = node.component.overrides
  const names: Record<string, string> = { fill: 'Fill', stroke: 'Stroke', opacity: 'Opacity', text: 'Text', name: 'Name', fontFamily: 'Font', fontSize: 'Text size', fontWeight: 'Weight', cornerRadius: 'Radius', tokenBindings: 'Tokens' }
  return [...Object.keys(properties ?? {}), ...Object.keys(style ?? {}), ...(tokenBindings && Object.keys(tokenBindings).length ? ['tokenBindings'] : [])].map(key => names[key] ?? key[0].toUpperCase() + key.slice(1))
}

export function ComponentInspector({ store, controller, node }: { store: SceneStore; controller: ViewportController; node: SceneElement }) {
  const state = useScene(store, snapshot => snapshot)
  const { active } = useSyncExternalStore(store.subscribe, store.getHistorySnapshot)
  const root = componentRoot(state.elements, node.id)
  const reason = store.componentCreationReason(node.id)
  const [error, setError] = useState('')
  const perform = (action: () => void) => { try { action(); setError('') } catch (error) { setError((error as Error).message) } }
  const focus = (id: string) => { store.select([id]); controller.fit(getWorldBounds(store.getSnapshot(), id)) }
  if (!root?.component) return <div className="inspector-section component-section">
    <span className="section-caption">REUSABLE DESIGN</span>
    <button className="component-action" disabled={!!reason} title={reason ?? 'Turn this layer and its children into a reusable master'} onClick={() => perform(() => { store.createComponent(node.id) })}><Diamonds size={14} />Create component<Plus size={12} /></button>
    {!reason && <p>One master. Every detail in sync.</p>}
    {error && <p role="alert" className="component-error">{error}</p>}
  </div>
  const instance = root.component.kind === 'instance'
  const masterId = root.component.kind === 'instance' ? root.component.masterId : root.id
  const master = state.elements[masterId]
  const instances = Object.values(state.elements).filter(layer => layer.component?.kind === 'instance' && layer.component.masterId === masterId && layer.component.instanceId === layer.id).length
  const layers = node.id === root.id ? subtree(state.elements, root.id) : [node]
  const count = layers.reduce((total, layer) => total + (layer.component?.kind === 'instance' ? overrideCount(layer.component.overrides) : 0), 0)
  return <div className="inspector-section component-section" data-testid="component-inspector">
    <div className="component-section-heading"><span className="section-caption">{instance ? 'COMPONENT INSTANCE' : 'MASTER COMPONENT'}</span>{instance ? <Diamond size={13} /> : <Diamonds size={13} />}</div>
    <div className="component-identity"><span className={`component-mark ${instance ? '' : 'is-master'}`}><Diamond size={18} /></span><div><strong>{master?.name}</strong><span>{instance ? count ? `${count} local override${count === 1 ? '' : 's'}` : 'Synced with master' : `${instances} instance${instances === 1 ? '' : 's'} in this document`}</span></div></div>
    {instance ? <>
      <button className="text-action" disabled={active || !store.isVisible(masterId) || store.isLocked(masterId)} onClick={() => focus(masterId)}>Go to master<ArrowUpRight size={12} /></button>
      {count > 0 && <div className="component-override-list" aria-label="Property overrides">{layers.filter(layer => overrideLabels(layer).length).map(layer => <div key={layer.id}><span>{layer.name}</span><div>{overrideLabels(layer).map(label => <span key={label} className="component-override-chip">{label}</span>)}</div></div>)}</div>}
      <div className="component-actions"><button className="component-action" disabled={!count || active} onClick={() => perform(() => store.resetComponentOverrides(node.id))}><RotateCcw size={12} />Reset overrides</button><button className="component-action" disabled={active} onClick={() => perform(() => store.detachComponentInstance(node.id))}><Unlink size={12} />Detach instance</button></div>
      <p>{node.id === root.id ? 'Edit any layer to override it. Reset restores the master’s current values.' : 'Overrides belong to this layer. Detach releases the whole instance.'}</p>
    </> : <><button className="component-action primary" disabled={active} onClick={() => perform(() => { const instance = store.createComponentInstance(masterId); focus(instance.id) })}><Plus size={13} />Insert instance<ArrowUpRight size={12} /></button><p>Changes to this master flow to every linked instance.</p></>}
    {error && <p role="alert" className="component-error">{error}</p>}
  </div>
}

export function ComponentLibrary({ store, controller }: { store: SceneStore; controller: ViewportController }) {
  const state = useScene(store, snapshot => snapshot)
  const { active } = useSyncExternalStore(store.subscribe, store.getHistorySnapshot)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const masters = useMemo(() => Object.values(state.elements).filter(node => node.component?.kind === 'master'), [state.elements])
  const instanceCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of Object.values(state.elements)) if (node.component?.kind === 'instance' && node.component.instanceId === node.id) counts.set(node.component.masterId, (counts.get(node.component.masterId) ?? 0) + 1)
    return counts
  }, [state.elements])
  const filtered = masters.filter(node => node.name.toLowerCase().includes(query.toLowerCase()))
  const selected = state.selection.length === 1 ? state.selection[0] : undefined
  const reason = selected ? store.componentCreationReason(selected) : 'Select one layer or frame to create a component.'
  const perform = (action: () => void) => { try { action(); setError('') } catch (error) { setError((error as Error).message) } }
  const focus = (id: string) => { store.select([id]); controller.fit(getWorldBounds(store.getSnapshot(), id)) }
  return <div className="component-library" data-testid="component-library">
    <div className="component-library-intro"><span className="section-caption">DOCUMENT COMPONENTS</span><h3>Design once. Make it yours.</h3><p>Reusable layers, connected by a master.</p></div>
    <label className="component-search"><Search size={12} /><input aria-label="Search components" placeholder="Find a component…" value={query} onChange={event => setQuery(event.currentTarget.value)} /><span>{masters.length}</span></label>
    <div className="component-library-list">
      {!filtered.length && <div className="component-empty"><div className="component-empty-art" aria-hidden="true"><Diamonds size={30} strokeWidth={1} /></div><strong>{query ? 'No matching components' : 'A place for your building blocks.'}</strong><p>{query ? 'Try a different name.' : 'Select a layer or a frame, then create your first component.'}</p></div>}
      {filtered.map(master => {
        const count = instanceCounts.get(master.id) ?? 0
        const layerCount = subtree(state.elements, master.id).length
        return <div className="component-library-card" key={master.id} data-testid="component-card">
          <button className="component-card-master" aria-label={`Go to master ${master.name}`} disabled={active || !store.isVisible(master.id) || store.isLocked(master.id)} onClick={() => focus(master.id)}><span className="component-card-swatch" style={{ backgroundColor: master.style.fill ?? 'transparent' }}><Diamonds size={20} strokeWidth={1.5} /></span><span><strong>{master.name}</strong><small>{count} instance{count === 1 ? '' : 's'} · {layerCount} layer{layerCount === 1 ? '' : 's'}</small></span></button>
          <button className="component-card-insert" aria-label={`Insert ${master.name} instance`} title="Insert instance" disabled={active} onClick={() => perform(() => { const instance = store.createComponentInstance(master.id); focus(instance.id) })}><Plus size={14} /></button>
        </div>
      })}
    </div>
    <div className="component-library-footer"><button className="component-action" disabled={!!reason} title={reason ?? 'Create a reusable master from the selection'} onClick={() => perform(() => { if (selected) store.createComponent(selected) })}><Diamonds size={13} />Create from selection<Plus size={12} /></button><p>Fill, stroke, opacity and text can be overridden in each instance.</p>{error && <p role="alert" className="component-error">{error}</p>}</div>
  </div>
}
