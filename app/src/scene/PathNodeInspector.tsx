import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { getHandleType } from './pathGeometry'
import type { AnchorSelection, HandleType, PathContour } from './pathGeometry'

export type NodeAction = 'corner' | HandleType | 'radius' | 'x' | 'y' | 'insert' | 'delete' | 'toggle-closed'
interface Props { contours: PathContour[]; selection: AnchorSelection[]; onEdit: (action: NodeAction, value?: number) => void }

function NodeNumber({ label, value, disabled, min, onCommit }: { label: string; value: number | undefined; disabled?: boolean; min?: number; onCommit: (value: number) => void }) {
  const format = (n: number | undefined) => n === undefined ? '' : String(Number(n.toFixed(2)))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelled = useRef(false)
  const commit = () => {
    if (!cancelled.current && draft.trim() && Number.isFinite(Number(draft)) && (min === undefined || Number(draft) >= min)) onCommit(Number(draft))
    else setDraft(format(value))
    setEditing(false)
  }
  return <label className="node-number"><span>{label}</span><input type="number" aria-label={`Node ${label}`} value={editing ? draft : format(value)} placeholder="Mixed" disabled={disabled} min={min} step={.5} onFocus={() => { cancelled.current = false; setDraft(format(value)); setEditing(true) }} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => {
    e.stopPropagation()
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') { cancelled.current = true; setDraft(format(value)); e.currentTarget.blur() }
  }} /></label>
}

const modes = [
  { type: 'corner', name: 'Corner', hint: 'Remove handles and keep a sharp or rounded corner' },
  { type: 'mirrored', name: 'Mirrored', hint: 'Handles share a direction and length' },
  { type: 'asymmetric', name: 'Asymmetric', hint: 'Handles share a direction with independent lengths' },
  { type: 'disconnected', name: 'Disconnected', hint: 'Move each handle independently' },
] as const

export function PathNodeInspector({ contours, selection, onEdit }: Props) {
  const anchors = selection.flatMap(p => contours[p.contour]?.anchors[p.anchor] ? [contours[p.contour].anchors[p.anchor]] : [])
  const first = anchors[0]
  const common = (key: 'x' | 'y' | 'cornerRadius') => anchors.length && anchors.every(a => (a[key] ?? 0) === (first[key] ?? 0)) ? first[key] ?? 0 : undefined
  const mode = first ? first.in || first.out ? getHandleType(first) : 'corner' : null
  const sameMode = anchors.every(a => (a.in || a.out ? getHandleType(a) : 'corner') === mode)
  const single = selection.length === 1 ? selection[0] : undefined, contour = single ? contours[single.contour] : undefined
  const selectedContour = selection.length && selection.every(p => p.contour === selection[0].contour) ? contours[selection[0].contour] : undefined
  const canInsert = single && contour && (contour.closed || single.anchor < contour.anchors.length - 1) && !contour.anchors.some(a => a.cornerRadius)
  return <aside className="node-inspector viewport-ui" aria-label="Vector node properties" data-testid="node-inspector">
    <div className="node-inspector-heading"><span className="pen-tool-label">VECTOR NODES</span><span className="node-selection-count">{anchors.length ? `${anchors.length} selected` : `${contours.length} subpath${contours.length === 1 ? '' : 's'}`}</span></div>
    <div className="node-mode-group" role="group" aria-label="Handle type">
      {modes.map(({ type, name, hint }) => <button key={type} type="button" aria-label={name} aria-pressed={sameMode && mode === type} disabled={!anchors.length} title={hint} onClick={() => onEdit(type)}>
        <svg viewBox="0 0 32 24" aria-hidden="true">
          <path d={type === 'corner' ? 'M3 20 16 6 29 20' : type === 'disconnected' ? 'M3 19Q16 12 27 4' : 'M3 20Q16 12 29 4'} fill="none" stroke="currentColor" />
          {type !== 'corner' && <><path d={type === 'disconnected' ? 'M7 5 16 12 27 7' : type === 'asymmetric' ? 'M10 15 16 12 28 6' : 'M4 18 16 12 28 6'} stroke="currentColor" /><circle cx={type === 'asymmetric' ? 10 : type === 'disconnected' ? 7 : 4} cy={type === 'asymmetric' ? 15 : type === 'disconnected' ? 5 : 18} r="2" fill="var(--paper-surface)" stroke="currentColor" /><circle cx={type === 'disconnected' ? 27 : 28} cy={type === 'disconnected' ? 7 : 6} r="2" fill="var(--paper-surface)" stroke="currentColor" /></>}
          <rect x="13.5" y={type === 'corner' ? 3.5 : 9.5} width="5" height="5" fill="currentColor" />
        </svg><span>{name}</span>
      </button>)}
    </div>
    {anchors.length ? <>
      <div className="node-coordinates"><NodeNumber label="X" value={common('x')} onCommit={value => onEdit('x', value)} /><NodeNumber label="Y" value={common('y')} onCommit={value => onEdit('y', value)} /></div>
      <NodeNumber label="Corner radius" value={common('cornerRadius')} min={0} disabled={selection.some(p => { const c = contours[p.contour]; return (!c.closed && (p.anchor === 0 || p.anchor === c.anchors.length - 1)) || !!c.anchors[(p.anchor + c.anchors.length - 1) % c.anchors.length].out || !!c.anchors[(p.anchor + 1) % c.anchors.length].in })} onCommit={value => onEdit('radius', value)} />
      <p className="node-inspector-note">{anchors.some(a => a.in || a.out) ? 'A radius converts the node to a corner.' : 'Radius is clamped to fit adjacent edges.'}</p>
      <div className="node-actions"><button disabled={!canInsert} title="Insert at the midpoint of the next segment" onClick={() => onEdit('insert')}><Plus size={12} />Insert node</button><button onClick={() => onEdit('delete')} title="Delete selected nodes · Backspace"><Trash2 size={12} />Delete</button></div>
      {selectedContour && <button className="node-contour-toggle" disabled={selectedContour.anchors.length < 2} aria-label={selectedContour.closed ? 'Open selected subpath' : 'Close selected subpath'} onClick={() => onEdit('toggle-closed')}><span>{selectedContour.closed ? 'Closed subpath' : 'Open subpath'}</span><span>{selectedContour.closed ? 'Open path ↗' : 'Close path ↩'}</span></button>}
    </> : <p className="node-inspector-empty">Select an anchor to refine its position, handles, and corner radius.</p>}
    <div className="node-inspector-footer"><span>⇧ Multi-select</span><span>↑↓←→ Nudge</span></div>
  </aside>
}
