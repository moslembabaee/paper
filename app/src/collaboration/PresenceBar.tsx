import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Check, Copy, Radio, RefreshCw, Users, X } from 'lucide-react'
import type { CollaborationSession } from './session'
import { initials } from '../workspace/profile'
import './collaboration.css'

export function PresenceBar({ session }: { session: CollaborationSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); host.current?.querySelector<HTMLButtonElement>('.presence-trigger')?.focus() } }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key) }
  }, [open])
  useEffect(() => { if (copied) { const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer) } }, [copied])
  const link = new URL(window.location.href)
  link.hash = new URLSearchParams({ room: session.room }).toString()
  const follow = state.peers.find(peer => peer.id === state.following)
  const live = state.status === 'live'
  const isUnavailable = state.status === 'unavailable'
  const status =
    live ? 'Live'
    : isUnavailable ? 'Unavailable'
    : state.status === 'offline' ? 'Offline'
    : state.status === 'connecting' ? 'Connecting'
    : 'Reconnecting'

  return <div className="presence-bar" ref={host} data-testid="presence-bar">
    <button className="presence-trigger" aria-label="Canvas collaborators" aria-expanded={open} aria-controls={open ? panelId : undefined} title={`${status} · ${state.peers.length + 1} on this canvas`} onClick={() => setOpen(!open)}>
      <span className="presence-signal" data-live={live} data-status={state.status} />
      {state.peers.length ? <span className="presence-avatars">{state.peers.slice(0, 3).map(peer => <span className="presence-avatar" key={peer.id} data-status={peer.status} style={{ background: peer.color }} title={`${peer.name} · ${peer.status}`}>{initials(peer.name)}</span>)}</span> : <Users size={13} />}
      <span className="presence-count">{state.peers.length ? state.peers.length + 1 : status}</span>
    </button>
    {isUnavailable && (
      <button
        type="button"
        className="presence-retry"
        aria-label="Retry collaboration"
        title="Retry collaboration"
        onClick={() => session.retry()}
      >
        <RefreshCw size={13} />
      </button>
    )}
    <span className="presence-announcement" role="status">{status}. {state.peers.length + 1} {state.peers.length ? 'designers' : 'designer'} on this canvas.</span>
    {open && <div id={panelId} className="presence-panel" role="region" aria-label="Collaboration" data-testid="presence-panel">
      <div className="presence-heading">
        <span>ON THIS CANVAS</span>
        <span className="presence-connection" data-live={live} data-status={state.status}>{status}</span>
      </div>
      <p className="presence-description">A shared space to think.<br />Invite someone to design alongside you.</p>
      {isUnavailable && (
        <div className="presence-unavailable-banner" data-testid="presence-unavailable">
          <p className="presence-error" role="status">{state.error || 'Collaboration service unavailable.'}</p>
          <button type="button" className="presence-retry-btn" aria-label="Retry collaboration" onClick={() => session.retry()}>
            <RefreshCw size={12} />
            <span>Retry</span>
          </button>
        </div>
      )}
      <div className="presence-person"><span className="presence-avatar self">You</span><span className="presence-person-info"><strong>You</strong><small>{live ? 'Connected to this room' : isUnavailable ? 'Collaboration unavailable' : 'Changes stay on this device until connected'}</small></span><span className="presence-person-status" data-status={live ? 'active' : 'away'} /></div>
      {state.peers.map(peer => <div className="presence-person" key={peer.id} data-testid="presence-peer" data-peer-name={peer.name}>
        <span className="presence-avatar" style={{ background: peer.color }}>{initials(peer.name)}</span>
        <span className="presence-person-info"><strong>{peer.name}</strong><small>{peer.following ? 'Following a collaborator' : peer.status === 'active' ? 'On the canvas' : peer.status === 'idle' ? 'Idle' : 'Away'}</small></span>
        <button className="presence-follow" disabled={peer.status === 'away' || !!peer.following} aria-label={`${state.following === peer.id ? 'Stop following' : 'Follow'} ${peer.name}`} aria-pressed={state.following === peer.id} onClick={() => session.follow(state.following === peer.id ? null : peer.id)}><Radio size={13} />{state.following === peer.id ? 'Following' : 'Follow'}</button>
        <span className="presence-person-status" data-status={peer.status} />
      </div>)}
      {!state.peers.length && <div className="presence-empty"><span className="presence-empty-cross">+</span><span>Room for another perspective</span></div>}
      <div className="presence-invite"><label htmlFor="collaboration-link">INVITE LINK</label><div><input id="collaboration-link" aria-label="Canvas invite link" readOnly value={link.href} onFocus={event => event.target.select()} /><button aria-label="Copy invite link" onClick={async () => { try { await navigator.clipboard.writeText(link.href); setCopied(true); setCopyError('') } catch { setCopyError('Select and copy the invite link above.') } }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div><small role="status">{copyError || (copied ? 'Link copied' : 'Anyone with this link can join and edit.')}</small></div>
      {state.error && !isUnavailable && <p className="presence-error" role="status">{state.error}</p>}
    </div>}
    {follow && <button className="presence-stop" onClick={() => session.follow(null)} aria-label={`Stop following ${follow.name}`}><Radio size={11} /><span>{follow.name}</span><X size={11} /></button>}
  </div>
}
