import { useEffect, useRef, useState } from 'react'
import { Download, FolderOpen, Save, X } from 'lucide-react'
import type { SceneStore } from '../scene/store'
import { useScene } from '../scene/useScene'
import { exportBounds } from './svg'
import type { ExportOptions } from './svg'
import { exportPNG, exportSVG, pngDimensions } from './export'
import { downloadFile, fileName } from './project'
import './io.css'

interface Props {
  store: SceneStore
  name: string
  importing: boolean
  onSave: () => void
  onImport: (file: File) => Promise<void>
  onMessage: (message: string) => void
}

export function DocumentActions({ store, name, importing, onSave, onImport, onMessage }: Props) {
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  return <div className="document-actions">
    <input ref={fileRef} type="file" accept=".json,.svg,.html,.htm,application/json,image/svg+xml,text/html" hidden aria-label="Open or import file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void onImport(file) }} />
    <button className="document-action icon-action" aria-label="Open or import file" title="Open Paper JSON / import SVG or HTML. You can also paste SVG from Figma with Copy as SVG." disabled={importing} onClick={() => fileRef.current?.click()}><FolderOpen size={14} /></button>
    <button className="document-action icon-action" aria-label="Save project JSON" title="Save project JSON · ⌘/Ctrl S" onClick={onSave}><Save size={14} /></button>
    <button className="document-action export-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Download size={14} /><span>Export</span></button>
    {open && <ExportDialog store={store} name={name} onSave={onSave} onMessage={onMessage} onClose={() => setOpen(false)} />}
  </div>
}

function ExportDialog({ store, name, onSave, onMessage, onClose }: Omit<Props, 'importing' | 'onImport'> & { onClose: () => void }) {
  const selection = useScene(store, state => state.selection)
  const elements = useScene(store, state => state.elements)
  const [format, setFormat] = useState<'png' | 'svg' | 'json'>('png')
  const [scope, setScope] = useState<ExportOptions['scope']>(selection.length ? 'selection' : 'canvas')
  const [scale, setScale] = useState<ExportOptions['scale']>(2)
  const [background, setBackground] = useState<ExportOptions['background']>('transparent')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const working = useRef(false)
  const options: ExportOptions = { scope, scale, background }
  const state = store.getSnapshot()
  const bounds = exportBounds(state, scope)
  let dimensions = bounds ? `${Math.ceil(bounds.width)} × ${Math.ceil(bounds.height)} px` : 'No visible layers'
  let sizeError = ''
  if (format === 'png' && bounds) {
    try { const size = pngDimensions(state, options); dimensions = `${size.width.toLocaleString()} × ${size.height.toLocaleString()} px` }
    catch (error) { sizeError = error instanceof Error ? error.message : 'PNG is too large.' }
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current!
    dialog.showModal()
    return () => { dialog.close(); previous?.focus() }
  }, [])

  async function runExport() {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    try {
      if (format === 'json') onSave()
      else {
        const snapshot = store.getSnapshot()
        const blob = await (format === 'png' ? exportPNG(snapshot, options) : exportSVG(snapshot, options))
        const selected = snapshot.selection.length === 1 ? snapshot.elements[snapshot.selection[0]] : undefined
        const label = scope === 'selection' ? selected?.name ?? `${name} selection` : name
        downloadFile(blob, fileName(format === 'png' ? `${label}@${scale}x` : label, format))
        onMessage(`${format.toUpperCase()} exported · ${dimensions}.`)
      }
      onClose()
    } catch (error) { setError(error instanceof Error ? error.message : 'Export failed. Please try again.') }
    finally { working.current = false; setBusy(false) }
  }

  return <dialog ref={dialogRef} className="export-dialog" aria-labelledby="export-title" onCancel={event => { if (working.current) event.preventDefault(); else onClose() }} onClick={event => { if (event.target === event.currentTarget && !working.current) onClose() }}>
    <div className="export-heading"><div><span className="export-eyebrow">TAKE YOUR WORK WITH YOU</span><h2 id="export-title">Export artwork</h2></div><button className="quiet-button" aria-label="Close export" disabled={busy} onClick={onClose}><X size={17} /></button></div>
    <div className="export-formats" role="group" aria-label="Export format">{(['png', 'svg', 'json'] as const).map(value => <button key={value} className={format === value ? 'selected' : ''} disabled={busy} aria-pressed={format === value} onClick={() => { setFormat(value); setError('') }}>{value.toUpperCase()}<span>{value === 'png' ? 'High resolution' : value === 'svg' ? 'Scalable vector' : 'Editable project'}</span></button>)}</div>
    <div className="export-fields">
      {format === 'json' ? <p className="export-project-note">Save every layer, shader, and frame in a portable Paper project. Open the JSON file to pick up where you left off.</p> : <>
        <label className="export-field"><span>Include</span><select aria-label="Export scope" value={scope} disabled={busy} onChange={event => { setScope(event.target.value as ExportOptions['scope']); setError('') }}><option value="selection" disabled={!selection.length}>Selection{selection.length ? ` · ${selection.length} ${selection.length === 1 && elements[selection[0]]?.type === 'frame' ? 'frame' : 'layers'}` : ''}</option><option value="canvas">Whole canvas</option></select></label>
        {format === 'png' && <label className="export-field"><span>Resolution</span><select aria-label="PNG resolution" value={scale} disabled={busy} onChange={event => { setScale(Number(event.target.value) as ExportOptions['scale']); setError('') }}>{([1, 2, 3, 4] as const).map(value => <option key={value} value={value}>{value}×{value === 2 ? ' · Retina' : ''}</option>)}</select></label>}
        <label className="export-field"><span>Background</span><select aria-label="Export background" value={background} disabled={busy} onChange={event => setBackground(event.target.value as ExportOptions['background'])}><option value="transparent">Transparent</option><option value="cream">Paper cream</option></select></label>
        <div className="export-dimensions"><span className="export-swatch" /><span>{dimensions}</span><span>{format === 'svg' ? 'VECTOR' : `${scale}×`}</span></div>
        <p className="export-note">{format === 'svg' ? 'Native vectors and text. Images are embedded; shader fills use a static snapshot.' : 'Crisp pixels, independent of canvas zoom. Shader fills use their saved static frame.'}</p>
      </>}
      {(error || sizeError) && <p className="export-error" role="alert">{error || sizeError}</p>}
    </div>
    <div className="export-footer"><span>Yours. In every format.</span><button className="export-submit" disabled={busy || (format !== 'json' && (!bounds || !!sizeError))} onClick={() => void runExport()}><Download size={14} />{busy ? 'Preparing…' : format === 'json' ? 'Save project' : `Export ${format.toUpperCase()}`}</button></div>
  </dialog>
}
