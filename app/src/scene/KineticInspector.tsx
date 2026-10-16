import { useMemo, useState } from 'react'
import type { SceneStore } from './store'
import type { TextElement } from './types'
import { DEFAULT_KINETIC, glyphOutlines, placeGlyphs } from './kineticGeometry'
import { fontInstance, loadOutlineFont, shapeText } from './fontEngine'
import { useOutlineFont } from './useOutlineFont'
import { resolveTextPathD } from './typography'

export function KineticInspector({ store, node }: { store: SceneStore; node: TextElement }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const loaded = useOutlineFont(node.fontSource)
  const fontError = useMemo(() => {
    if (loaded?.error) return loaded.error
    if (!loaded?.font) return ''
    try { fontInstance(loaded.font, node); return '' }
    catch (reason) { return reason instanceof Error ? reason.message : 'Could not trace this font.' }
  }, [loaded, node])
  const k = node.kinetic ?? { ...DEFAULT_KINETIC, enabled: false }
  const update = (patch: Partial<typeof k>) => store.update(node.id, 'text', { kinetic: { ...k, ...patch } })
  return <div className="typography-tab-pane">
    <div className="kinetic-heading"><span className="axis-tag-badge">KINETIC TYPE</span><span className="typo-hint">GLYPH CASCADE</span></div>
    <div className="path-deformation-toggle"><span>Animate glyphs</span><button type="button" className={`grid-switch ${k.enabled ? 'on' : ''}`} role="switch" aria-label="Animate glyph cascade" aria-checked={k.enabled} disabled={!loaded?.font || !!fontError} onClick={() => update({ enabled: !k.enabled })}><span /></button></div>
    {!node.fontSource && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p className="typo-hint">Load bundled Inter or import a font to enable kinetic animation and vector outlines.</p>
      <button type="button" className="typo-chip" disabled={busy} onClick={async () => {
        setBusy(true); setError('')
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}fonts/InterVariable-latin.ttf`)
          if (!response.ok) throw new Error('Bundled font is unavailable')
          const bytes = new Uint8Array(await response.arrayBuffer())
          let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte)
          const source = `data:font/ttf;base64,${btoa(binary)}`
          const face = new FontFace('PaperInter', `url("${source}")`, { weight: '100 900' })
          await face.load()
          document.fonts?.add(face)
          store.update(node.id, 'text', { fontFamily: 'PaperInter', fontSource: source, fontWeight: 400, variableAxes: { wght: 400 }, kinetic: { ...DEFAULT_KINETIC, enabled: true } })
        } catch { setError('Could not load bundled Inter font.') }
        finally { setBusy(false) }
      }}>Use bundled Inter (Variable)</button>
    </div>}
    {fontError && <p className="typo-hint" role="alert">{fontError}</p>}
    <fieldset className="kinetic-controls" disabled={!node.fontSource || !k.enabled}>
      <div className="kinetic-transport"><button type="button" className="typo-chip" aria-label={k.playing ? 'Pause glyph cascade' : 'Play glyph cascade'} onClick={() => update({ playing: !k.playing })}>{k.playing ? 'Pause' : 'Play'}</button><span className="typo-hint">{k.playing ? 'Live · respects reduced motion' : 'Paused at selected phase'}</span></div>
      {([
        ['amplitude', 'Cascade offset', 0, 120, 1, 'px'],
        ['rotation', 'Glyph rotation', -45, 45, 1, '°'],
        ['duration', 'Cycle duration', .2, 12, .1, 's'],
        ['stagger', 'Glyph delay', 0, 300, 5, 'ms'],
        ['phase', 'Cascade phase', 0, 1, .01, ''],
      ] as const).map(([key, label, min, max, step, unit]) => <label className="axis-slider-row" key={key}>
        <span className="axis-slider-header"><span className="axis-label-name">{label}</span><span className="axis-val-display">{key === 'phase' ? `${Math.round(k.phase * 100)}%` : `${k[key]}${unit}`}</span></span>
        <input type="range" className="axis-slider-input" aria-label={label} min={min} max={max} step={step} value={k[key]} onChange={event => { const value = event.currentTarget.valueAsNumber; if (Number.isFinite(value)) update({ [key]: value, ...(key === 'phase' ? { playing: false } : {}) }) }} />
      </label>)}
    </fieldset>
    <div className="kinetic-outline-card"><span className="section-caption">VECTOR HANDOFF</span><p className="typo-hint">Bake the selected phase and current axes into editable SVG paths. Undo restores live text.</p>
      <button type="button" className="kinetic-outline-button" disabled={busy || !loaded?.font || !!fontError || !!node.component} onClick={async () => {
        setBusy(true); setError('')
        try {
          const original = node
          const font = await loadOutlineFont(node.fontSource!)
          // Async loading must never convert a layer that changed or was deleted meanwhile.
          const current = store.getSnapshot().elements[node.id]
          if (current !== original) throw new Error('The text changed while loading. Try converting again.')
          const glyphs = placeGlyphs(node, shapeText(font, node), font.unitsPerEm, resolveTextPathD(node, store.getSnapshot().elements))
          store.convertTextToOutlines(node.id, glyphOutlines(glyphs, node.kinetic))
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not convert this font.') }
        finally { setBusy(false) }
      }}>{busy ? 'Tracing glyphs…' : 'Convert phase to outlines'}</button>
      {node.component && <p className="typo-hint">Detach this component before converting.</p>}
    </div>
    {error && <p className="typo-hint" role="alert">{error}</p>}
  </div>
}
