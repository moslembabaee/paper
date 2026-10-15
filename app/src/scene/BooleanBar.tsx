import { useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { BooleanOperation, PathElement, VectorElement } from './types'
import { vectorPathData } from './booleanGeometry'
import { parsePath, pathBounds } from './pathGeometry'
import { unionBounds } from '../canvas/math'
import type { SceneStore } from './store'
import { useScene } from './useScene'
import './boolean.css'

const ACTIONS: readonly { operation: BooleanOperation; label: string; hint: string }[] = [
  { operation: 'union', label: 'Union', hint: 'Merge all filled areas' },
  { operation: 'subtract', label: 'Subtract', hint: 'Remove upper shapes from the bottom shape' },
  { operation: 'intersect', label: 'Intersect', hint: 'Keep only the area shared by every shape' },
  { operation: 'exclude', label: 'Exclude', hint: 'Keep areas covered by an odd number of shapes' },
]

function BooleanIcon({ operation }: { operation: BooleanOperation }) {
  const parts: Record<BooleanOperation, string> = {
    union: 'M3 3H13V7H17V17H7V13H3Z',
    subtract: 'M3 3H13V7H7V13H3Z',
    intersect: 'M7 7H13V13H7Z',
    exclude: 'M3 3H13V7H7V13H3Z M13 7H17V17H7V13H13Z',
  }
  return <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 3H13V13H3Z M7 7H17V17H7Z" stroke="currentColor" strokeWidth="1" opacity=".35" /><path d={parts[operation]} fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
}

function CompoundPreview({ compound, highlightedId }: { compound: PathElement; highlightedId: string | null }) {
  const sources = useMemo(() => compound.boolean!.operands.map(source => ({ id: source.id, d: vectorPathData(source) })), [compound.boolean])
  const bounds = useMemo(() => unionBounds(sources.map(source => pathBounds(parsePath(source.d)))), [sources])
  if (!bounds) return null
  const padding = Math.max(bounds.width, bounds.height) * .12
  return <figure className="boolean-preview" aria-label="Live compound preview">
    <svg viewBox={`${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`} role="img" aria-label={`${compound.boolean!.operation} result with editable source outlines`}>
      <path className="boolean-preview-result" data-testid="boolean-preview-result" d={compound.d} fillRule={compound.fillRule} />
      {sources.map(source => <path key={source.id} className={`boolean-preview-source ${source.id === highlightedId ? 'is-highlighted' : ''}`} d={source.d} vectorEffect="non-scaling-stroke" />)}
    </svg>
    <figcaption><span><i />LIVE COMPOUND</span><span>SVG / {compound.boolean!.operands.length} SOURCES</span></figcaption>
  </figure>
}

function SourceEditor({ source, index, count, subtract, disabled, onChange, onMove, onHighlight }: { source: VectorElement; index: number; count: number; subtract: boolean; disabled: boolean; onChange: (patch: Parameters<SceneStore['updateBooleanOperand']>[2]) => boolean; onMove: (direction: -1 | 1) => void; onHighlight: (id: string | null) => void }) {
  const fields = [ ['x', 'X'], ['y', 'Y'], ['width', 'Width'], ['height', 'Height'], ['rotation', 'Rotation'] ] as const
  return <details className="boolean-source" onPointerEnter={() => onHighlight(source.id)} onPointerLeave={() => onHighlight(null)} onFocus={() => onHighlight(source.id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onHighlight(null) }}>
    <summary><span className="boolean-source-mark">{source.type === 'ellipse' ? '○' : source.type === 'rectangle' ? '□' : '◇'}</span><span>{source.name}</span><span className="boolean-source-kind">{subtract ? index === 0 ? 'BASE' : 'CUT' : source.type === 'path' && source.boolean ? 'compound' : source.type}</span></summary>
    <div className="boolean-source-order"><span>Source {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span><button disabled={disabled || index === 0} aria-label={`Move ${source.name} source earlier`} title="Move earlier · First source is the subtraction base" onClick={() => onMove(-1)}><ArrowUp size={12} /></button><button disabled={disabled || index === count - 1} aria-label={`Move ${source.name} source later`} title="Move later in source order" onClick={() => onMove(1)}><ArrowDown size={12} /></button></div>
    <div className="boolean-source-fields">{fields.map(([key, label]) => <label key={key}><span>{label}</span><input key={source[key]} aria-label={`${source.name} source ${label}`} disabled={disabled} type="number" step="any" min={key === 'width' || key === 'height' ? .01 : undefined} defaultValue={Number(source[key].toFixed(4))} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} onBlur={event => {
      const value = event.currentTarget.valueAsNumber
      if (!Number.isFinite(value) || ((key === 'width' || key === 'height') && value <= 0)) event.currentTarget.value = String(source[key])
      else if (value !== source[key] && !onChange({ [key]: value })) event.currentTarget.value = String(source[key])
    }} /></label>)}
    {source.type === 'rectangle' && <label><span>Radius</span><input key={source.cornerRadius} aria-label={`${source.name} source Radius`} disabled={disabled} type="number" min="0" step="any" defaultValue={source.cornerRadius} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} onBlur={event => { const value = event.currentTarget.valueAsNumber; if (!Number.isFinite(value) || value < 0 || !onChange({ cornerRadius: value })) event.currentTarget.value = String(source.cornerRadius) }} /></label>}
    </div>
    {source.type === 'path' && !source.boolean && <textarea key={source.d} aria-label={`${source.name} source SVG path data`} className="property-textarea property-mono" disabled={disabled} spellCheck={false} defaultValue={source.d} onBlur={event => { if (event.currentTarget.value !== source.d && !onChange({ d: event.currentTarget.value })) event.currentTarget.value = source.d }} />}
  </details>
}

export function BooleanBar({ store }: { store: SceneStore }) {
  const state = useScene(store, snapshot => snapshot)
  const { active } = useSyncExternalStore(store.subscribe, store.getHistorySnapshot, store.getHistorySnapshot)
  const [destructive, setDestructive] = useState(false)
  const [error, setError] = useState('')
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const selected = state.selection.length === 1 ? state.elements[state.selection[0]] : undefined
  const compound = selected?.type === 'path' && selected.boolean ? selected : undefined
  if (state.selection.length < 2 && !compound) return null
  const reason = compound ? compound.component?.kind === 'instance' ? 'Detach the instance to edit its boolean sources.' : store.isLocked(compound.id) ? 'Unlock the compound to edit its sources.' : null : store.booleanSelectionReason()
  const disabled = !!reason || active
  const run = (work: () => unknown) => { try { work(); setError(''); return true } catch (cause) { setError(cause instanceof Error ? cause.message : 'The shapes could not be combined.'); return false } }
  return <div className="inspector-section boolean-section" data-testid="boolean-section">
    <div className="boolean-heading"><span className="section-caption">BOOLEAN</span><span>{compound ? `${compound.boolean!.operands.length} sources` : 'Shape operations'}</span></div>
    <div className="boolean-toolbar" role="toolbar" aria-label="Boolean path operations">
      {ACTIONS.map(({ operation, label, hint }) => <button key={operation} aria-label={label} aria-pressed={compound ? compound.boolean!.operation === operation : undefined} title={reason ?? `${label} · ${hint}`} disabled={disabled} onClick={() => run(() => compound ? store.setBooleanOperation(compound.id, operation) : store.booleanSelection(operation, destructive))}><BooleanIcon operation={operation} /><span>{label}</span></button>)}
    </div>
    {compound ? <>
      <CompoundPreview compound={compound} highlightedId={highlightedId} />
      <p className="boolean-hint">{reason ?? `${ACTIONS.find(action => action.operation === compound.boolean!.operation)!.hint}. Sources remain editable.`}</p>
      <div className="boolean-sources" aria-label="Boolean source shapes">{compound.boolean!.operands.map((source, index, sources) => <SourceEditor key={source.id} source={source} index={index} count={sources.length} subtract={compound.boolean!.operation === 'subtract'} disabled={disabled} onHighlight={setHighlightedId} onChange={patch => run(() => store.updateBooleanOperand(compound.id, source.id, patch))} onMove={direction => run(() => {
        const order = sources.map(operand => operand.id), target = index + direction
        if (target < 0 || target >= order.length) return
        ;[order[index], order[target]] = [order[target], order[index]]
        store.reorderBooleanOperands(compound.id, order)
      })} />)}</div>
      <div className="boolean-footer"><button disabled={disabled || !!compound.mask} title={compound.mask ? 'Release the mask before restoring its source layers' : 'Restore editable source layers at the compound’s current transform'} onClick={() => run(() => store.releaseBoolean(compound.id))}>Release sources</button><button disabled={disabled} title="Replace this compound with its merged vector outline" onClick={() => run(() => store.flattenBoolean(compound.id))}>Flatten path</button></div>
      {!compound.d && <p className="boolean-hint">The result is empty. Edit a source or change the operation.</p>}
    </> : <>
      <label className="boolean-mode"><input type="checkbox" aria-label="Flatten result" checked={destructive} onChange={event => setDestructive(event.currentTarget.checked)} /><span>Flatten result</span><span>{destructive ? 'Merged path' : 'Editable compound'}</span></label>
      <p className="boolean-hint">{reason ?? (destructive ? 'Replace selected shapes with a single vector path.' : 'Keep source shapes editable inside a compound.')}</p>
    </>}
    {error && <p className="boolean-error" role="alert">{error}</p>}
  </div>
}

