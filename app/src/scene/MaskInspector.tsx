import { useState, useSyncExternalStore } from 'react'
import { Scan, ScanLine } from 'lucide-react'
import type { SceneStore } from './store'
import { useScene } from './useScene'
import { canMask } from './maskGeometry'
import './mask.css'

export function MaskInspector({ store }: { store: SceneStore }) {
  const state = useScene(store, snapshot => snapshot)
  const { active } = useSyncExternalStore(store.subscribe, store.getHistorySnapshot, store.getHistorySnapshot)
  const [error, setError] = useState('')
  const node = state.selection.length === 1 ? state.elements[state.selection[0]] : undefined
  const source = node?.mask ? node : node?.type === 'frame' ? node.children.map(id => state.elements[id]).find(child => child.mask) : undefined
  const reason = state.selection.length > 1 ? store.maskSelectionReason() : null
  if (state.selection.length < 2 && !source && (!node || !canMask(node))) return null
  const run = (work: () => unknown) => { try { work(); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update the mask.') } }
  const disabled = active || !!(source?.component?.kind === 'instance') || !!(source && store.isLocked(source.id))
  return <div className="inspector-section mask-section" data-testid="mask-section">
    <div className="mask-heading"><span className="section-caption">VECTOR MASK</span><Scan size={13} /></div>
    {source ? <>
      <button className="mask-source-select" onClick={() => store.select([source.id])}><ScanLine size={13} /><span>{source.name}</span><span>Source</span></button>
      <div className="setting-row"><span>Clip nested layers</span><button className={`grid-switch ${source.mask!.enabled ? 'on' : ''}`} role="switch" aria-label="Enable vector mask" aria-checked={source.mask!.enabled} disabled={disabled} onClick={() => run(() => store.setMask(source.id, !source.mask!.enabled))}><span /></button></div>
      <div className="setting-row"><span>Show mask outline</span><button className={`grid-switch ${source.mask!.showOutline ? 'on' : ''}`} role="switch" aria-label="Show mask outline" aria-checked={source.mask!.showOutline} disabled={disabled} onClick={() => run(() => store.setMaskOutline(source.id, !source.mask!.showOutline))}><span /></button></div>
      <p className="mask-hint">{source.component?.kind === 'instance' ? 'Detach the instance to change its mask.' : 'Edit the source shape to update the clip. Its geometry stays editable.'}</p>
      <button className="mask-action" disabled={disabled} onClick={() => run(() => store.setMask(source.id, null))}>Release mask</button>
    </> : <>
      <button className="mask-action" disabled={active || !!reason || !!(node && (store.isLocked(node.id) || node.component?.kind === 'instance'))} onClick={() => run(() => state.selection.length > 1 ? store.maskSelection() : node && store.setMask(node.id, true))}><Scan size={13} />{state.selection.length > 1 ? 'Use top layer as mask' : 'Use as mask'}</button>
      <p className="mask-hint">{reason ?? (state.selection.length > 1 ? 'Group selected layers and clip them with the top shape. Preserve every source.' : node?.parentId ? 'Clip sibling layers with this shape or frame.' : 'Assign a mask role, then place this source inside a frame to clip its layers.')}</p>
    </>}
    {error && <p className="mask-error" role="alert">{error}</p>}
  </div>
}
