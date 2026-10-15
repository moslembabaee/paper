import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'
import { Check, Copy, Download, Eye, EyeOff, Pause, Play, Plus, Repeat2, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react'
import type { SceneStore } from '../scene/store'
import { useScene } from '../scene/useScene'
import { downloadFile } from '../io/project'
import { EasingEditor } from './EasingEditor'
import { createTrack, DEFAULT_EASING, EMPTY_MOTION, patchKeyframe, PROPERTY_META, trackValue } from './model'
import { exportMotion } from './export'
import { useMotionPlayback } from './useMotionPlayback'
import type { MotionEasing, MotionKeyframe, MotionProperty, MotionTrack } from './types'
import './motion.css'

export function MotionDrawer({ store, stage, onClose }: { store: SceneStore; stage: RefObject<HTMLElement | null>; onClose: () => void }) {
  const motion = useScene(store, state => state.motion) ?? EMPTY_MOTION
  const elements = useScene(store, state => state.elements), selection = useScene(store, state => state.selection)
  const [active, setActive] = useState<{ trackId: string; keyId: string } | null>(null)
  const [property, setProperty] = useState<MotionProperty>('x'), [loop, setLoop] = useState(false)
  const [format, setFormat] = useState<'framer' | 'css'>('framer'), [exportOpen, setExportOpen] = useState(false), [notice, setNotice] = useState('')
  const playback = useMotionPlayback(motion, elements, stage)
  const gesture = useRef(false), keyDrag = useRef<{ trackId: string; keyId: string; lane: HTMLElement } | null>(null)
  const begin = useCallback(() => { if (!gesture.current && !store.getHistorySnapshot().active) { store.beginTransaction('Edit motion curve'); gesture.current = true } }, [store])
  const end = useCallback(() => { if (gesture.current) { gesture.current = false; store.endTransaction() } }, [store])
  useEffect(() => () => { if (gesture.current) store.endTransaction() }, [store])
  const track = motion.tracks.find(item => item.id === active?.trackId)
  const key = track?.keyframes.find(item => item.id === active?.keyId)
  const activeIndex = track?.keyframes.findIndex(item => item.id === key?.id) ?? -1
  const available = selection.filter(id => elements[id] && !store.isLocked(id) && store.isVisible(id))
  const canAdd = available.some(id => !motion.tracks.some(item => item.elementId === id && item.property === property)) && motion.tracks.length < 200
  const updateTrack = (next: MotionTrack) => store.setMotion({ ...motion, tracks: motion.tracks.map(item => item.id === next.id ? next : item) })
  const updateKey = (patch: Partial<MotionKeyframe>) => { if (track && key) updateTrack(patchKeyframe(track, key.id, patch)) }
  const updateEasing = useCallback((easing: MotionEasing) => {
    const current = store.getSnapshot().motion
    if (!current || !active) return
    store.setMotion({ ...current, tracks: current.tracks.map(item => item.id === active.trackId ? patchKeyframe(item, active.keyId, { easing }) : item) })
  }, [store, active])
  const code = exportOpen ? exportMotion(motion, elements, format) : ''
  const addKey = () => {
    if (!track || track.keyframes.length >= 200) return
    const time = Math.round(playback.time.current)
    if (track.keyframes.some(item => Math.abs(item.time - time) < 1)) { setNotice('Move the playhead to an empty time to add a keyframe.'); return }
    const next = { id: crypto.randomUUID(), time, value: trackValue(track, time), easing: key?.easing ?? DEFAULT_EASING }
    updateTrack({ ...track, keyframes: [...track.keyframes, next].sort((a, b) => a.time - b.time) })
    setActive({ trackId: track.id, keyId: next.id }); setNotice('')
  }
  const dragKey = (event: PointerEvent) => {
    const drag = keyDrag.current
    if (!drag) return
    const current = store.getSnapshot().motion!, item = current.tracks.find(item => item.id === drag.trackId)!
    const index = item.keyframes.findIndex(item => item.id === drag.keyId), rect = drag.lane.getBoundingClientRect()
    const min = index > 0 ? item.keyframes[index - 1].time + 1 : 0
    const max = index < item.keyframes.length - 1 ? item.keyframes[index + 1].time - 1 : current.duration
    const time = Math.max(min, Math.min(max, Math.round((event.clientX - rect.left) / rect.width * current.duration / (event.shiftKey ? 1 : 10)) * (event.shiftKey ? 1 : 10)))
    store.setMotion({ ...current, tracks: current.tracks.map(t => t.id === item.id ? patchKeyframe(t, drag.keyId, { time }) : t) })
    playback.seek(time)
  }
  return <section ref={playback.root} className="motion-drawer viewport-ui" aria-label="Motion timeline" data-testid="motion-drawer" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { end(); onClose() } }}>
    <header className="motion-header">
      <span className="motion-title"><SlidersHorizontal size={14} />Motion<span className="motion-badge">TIMELINE</span></span>
      <div className="motion-transport"><button aria-label="Rewind motion" title="Rewind" onClick={() => playback.seek(0)}><RotateCcw size={13} /></button><button className="motion-play" aria-label={playback.playing ? 'Pause motion' : 'Play motion'} disabled={!motion.tracks.some(track => track.enabled)} onClick={playback.toggle}>{playback.playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button><output ref={playback.readout} aria-label="Motion current time">0.00 s</output><button aria-label="Loop motion" aria-pressed={loop} onClick={() => { playback.looping.current = !loop; setLoop(!loop) }}><Repeat2 size={14} /></button></div>
      <label className="motion-duration">Duration<input aria-label="Motion duration milliseconds" type="number" min={Math.max(100, ...motion.tracks.flatMap(track => track.keyframes.map(key => key.time)))} max="30000" step="100" value={motion.duration} onChange={event => { const duration = event.currentTarget.valueAsNumber; if (Number.isFinite(duration) && duration >= 100 && duration <= 30000 && motion.tracks.every(track => track.keyframes.every(key => key.time <= duration))) store.setMotion({ ...motion, duration }) }} /><span>ms</span></label>
      {playback.preview && <button className="motion-restore" onClick={playback.restore} title="Restore design geometry"><RotateCcw size={12} />Restore design</button>}
      <button className="motion-export-button" aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)}><Download size={13} />Export code</button><button aria-label="Close motion timeline" onClick={() => { end(); onClose() }}><X size={15} /></button>
    </header>
    <div className="motion-body">
      <div className="motion-tracks-panel">
        <div className="motion-track-tools"><span>{motion.tracks.length.toString().padStart(2, '0')} TRACKS</span><select aria-label="Motion property to add" value={property} onChange={event => setProperty(event.target.value as MotionProperty)}>{Object.entries(PROPERTY_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}</select><button disabled={!canAdd} onClick={() => {
          const tracks = available.filter(id => !motion.tracks.some(track => track.elementId === id && track.property === property)).slice(0, 200 - motion.tracks.length).map(id => createTrack(id, property, motion.duration))
          store.setMotion({ ...motion, tracks: [...motion.tracks, ...tracks] }, 'Add motion tracks')
          if (tracks[0]) setActive({ trackId: tracks[0].id, keyId: tracks[0].keyframes[0].id })
        }} title="Add a property track for each selected layer"><Plus size={12} />Add selection</button><button disabled={!track || track.keyframes.length >= 200} onClick={addKey}><Plus size={12} />Keyframe</button></div>
        <div className="motion-track-scroll">
          <div className="motion-timeline-table">
            <div className="motion-ruler-row"><div className="motion-layer-heading">LAYER / PROPERTY</div><div className="motion-ruler">{Array.from({ length: 9 }, (_, i) => <span key={i} style={{ left: `${i * 12.5}%` }}>{(motion.duration * i / 8000).toFixed(2)}</span>)}<div className="motion-playhead" /><input ref={playback.scrubber} type="range" min="0" max={motion.duration} step="1" defaultValue="0" aria-label="Motion playback scrubber" onChange={event => playback.seek(event.currentTarget.valueAsNumber)} /></div></div>
            {motion.tracks.map(item => <div className={`motion-track-row ${track?.id === item.id ? 'is-active' : ''}`} key={item.id}>
              <div className="motion-track-label"><button aria-label={`${item.enabled ? 'Mute' : 'Enable'} ${elements[item.elementId]?.name} ${PROPERTY_META[item.property].label}`} onClick={() => updateTrack({ ...item, enabled: !item.enabled })}>{item.enabled ? <Eye size={12} /> : <EyeOff size={12} />}</button><button className="motion-track-name" onClick={() => { setActive({ trackId: item.id, keyId: item.keyframes[0].id }); if (!store.isLocked(item.elementId)) store.select([item.elementId]) }}><strong>{elements[item.elementId]?.name}</strong><span>{PROPERTY_META[item.property].label}</span></button><button aria-label={`Remove ${elements[item.elementId]?.name} ${PROPERTY_META[item.property].label} track`} onClick={() => store.setMotion({ ...motion, tracks: motion.tracks.filter(track => track.id !== item.id) }, 'Remove motion track')}><X size={11} /></button></div>
              <div className={`motion-keyframe-lane ${!item.enabled ? 'is-muted' : ''}`} onPointerDown={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); playback.seek((event.clientX - rect.left) / rect.width * motion.duration) } }}>
                <div className="motion-segment" style={{ left: `${item.keyframes[0].time / motion.duration * 100}%`, width: `${(item.keyframes.at(-1)!.time - item.keyframes[0].time) / motion.duration * 100}%` }} />
                {item.keyframes.map((frame, index) => <button key={frame.id} className={`motion-diamond ${key?.id === frame.id && track?.id === item.id ? 'is-selected' : ''}`} style={{ left: `${frame.time / motion.duration * 100}%` }} aria-label={`${elements[item.elementId]?.name} ${PROPERTY_META[item.property].label} keyframe ${index + 1}`} title={`${frame.time} ms · ${frame.value}${PROPERTY_META[item.property].unit} · Drag to retime`} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); keyDrag.current = { trackId: item.id, keyId: frame.id, lane: event.currentTarget.parentElement! }; setActive({ trackId: item.id, keyId: frame.id }); playback.seek(frame.time); begin() }} onPointerMove={dragKey} onPointerUp={() => { keyDrag.current = null; end() }} onPointerCancel={() => { keyDrag.current = null; end() }} onLostPointerCapture={() => { keyDrag.current = null; end() }} onClick={() => { setActive({ trackId: item.id, keyId: frame.id }); playback.seek(frame.time) }} onKeyDown={event => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                  event.preventDefault(); const time = frame.time + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 10)
                  if (time >= 0 && time <= motion.duration && time > (item.keyframes[index - 1]?.time ?? -1) && time < (item.keyframes[index + 1]?.time ?? Infinity)) { updateTrack(patchKeyframe(item, frame.id, { time })); playback.seek(time) }
                }} />)}
                <div className="motion-playhead" />
              </div>
            </div>)}
            {!motion.tracks.length && <div className="motion-empty"><SlidersHorizontal size={22} /><strong>A little motion. A lot of character.</strong><span>Select canvas layers, choose a property, then add your first track.</span></div>}
          </div>
        </div>
        <footer className="motion-timeline-footer"><span>{notice || (playback.preview ? 'Previewing · Restore design to return to editing' : 'Drag diamonds to retime · Shift for 1 ms precision')}</span><span>120 Hz easing · {motion.duration / 1000}s</span></footer>
      </div>
      <aside className="motion-inspector" aria-label="Motion keyframe editor">
        {track && key ? <>
          <div className="motion-inspector-heading"><span>KEYFRAME {activeIndex + 1}<small>{PROPERTY_META[track.property].label}</small></span><button disabled={track.keyframes.length <= 2} aria-label="Delete motion keyframe" onClick={() => { updateTrack({ ...track, keyframes: track.keyframes.filter(item => item.id !== key.id) }); setActive({ trackId: track.id, keyId: track.keyframes.find(item => item.id !== key.id)!.id }) }}><Trash2 size={12} /></button></div>
          <div className="motion-key-fields"><label className="motion-field">Time · ms<input aria-label="Keyframe time milliseconds" type="number" min={track.keyframes[activeIndex - 1]?.time + 1 || 0} max={track.keyframes[activeIndex + 1] ? track.keyframes[activeIndex + 1].time - 1 : motion.duration} value={key.time} onChange={event => { const time = event.currentTarget.valueAsNumber; if (Number.isFinite(time) && time >= 0 && time <= motion.duration && time > (track.keyframes[activeIndex - 1]?.time ?? -1) && time < (track.keyframes[activeIndex + 1]?.time ?? Infinity)) updateKey({ time }) }} /></label><label className="motion-field">Value {PROPERTY_META[track.property].unit}<input aria-label="Keyframe value" type="number" step={track.property === 'opacity' || track.property === 'scale' ? '.01' : '1'} min={PROPERTY_META[track.property].min} max={PROPERTY_META[track.property].max} value={key.value} onChange={event => { const value = event.currentTarget.valueAsNumber, meta = PROPERTY_META[track.property]; if (Number.isFinite(value) && value >= meta.min && value <= meta.max) updateKey({ value }) }} /></label></div>
          {activeIndex < track.keyframes.length - 1 ? <EasingEditor value={key.easing} onChange={updateEasing} onBegin={begin} onEnd={end} /> : <p className="motion-hint motion-end-hint">End keyframe. Select an earlier diamond to edit its outgoing easing.</p>}
        </> : <div className="motion-inspector-empty"><SlidersHorizontal size={18} /><span>Select a keyframe to shape its motion.</span></div>}
      </aside>
    </div>
    {exportOpen && <div className="motion-export" role="dialog" aria-label="Export motion code"><div className="motion-export-header"><strong>Motion → code</strong><select aria-label="Motion export format" value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="framer">Framer Motion</option><option value="css">CSS keyframes</option></select><button onClick={async () => { try { await navigator.clipboard.writeText(code); setNotice('Code copied to clipboard.') } catch { setNotice('Clipboard unavailable. Select the code or download it.') } }}>{notice === 'Code copied to clipboard.' ? <Check size={13} /> : <Copy size={13} />}Copy</button><button onClick={() => downloadFile(new Blob([code], { type: 'text/plain' }), format === 'framer' ? 'paper-motion.tsx' : 'paper-motion.css')}><Download size={13} />Download</button><button aria-label="Close motion export" onClick={() => setExportOpen(false)}><X size={14} /></button></div><p>Spring and Bézier easing baked at 120 Hz. Each layer exports independently on a shared clock.</p><textarea readOnly aria-label="Exported motion code" value={code} spellCheck={false} /><span role="status">{notice}</span></div>}
  </section>
}
