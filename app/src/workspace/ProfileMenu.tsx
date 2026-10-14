import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Cloud, Copy, Eye, EyeOff, FolderOpen, HardDrive, KeyRound, Settings2, Upload, UserRound, X } from 'lucide-react'
import { getTheme, setTheme } from '../design-system/theme'
import type { StudioTheme } from '../design-system/tokens'
import { Dialog } from './Dialog'
import { generateToken, initials, readAvatar, saveProfile } from './profile'
import { CloudAccount } from '../cloud/CloudAccount'
import type { CloudAccountState } from '../cloud/CloudAccount'
import type { useCloudSync } from '../cloud/useCloudSync'
import type { CloudUser } from '../cloud/model'
import type { UserProfile } from './types'

export function Avatar({ profile, user, large = false }: { profile: UserProfile; user?: CloudUser | null; large?: boolean }) {
  const avatar = user ? user.avatar : profile.avatar
  const name = user ? user.name : profile.name
  return <span className={`account-avatar ${large ? 'large' : ''}`} aria-hidden="true">{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : initials(name)}</span>
}

export function ProfileMenu({ profile, onSave, onOpenProjects, account, sync }: {
  profile: UserProfile; onSave: (profile: UserProfile) => void; onOpenProjects: () => void; account: CloudAccountState; sync: ReturnType<typeof useCloudSync>
}) {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); trigger.current?.focus() }
  useEffect(() => { if (account.authNotice) setSettings(true) }, [account.authNotice])
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])

  return <div className="account-control" ref={root}>
    <button ref={trigger} className="account-trigger" aria-label="User profile menu" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'profile-menu' : undefined} title={`${account.user?.name ?? profile.name} · ${account.user ? "Cloud workspace" : "Local workspace"}`} onClick={() => setOpen(!open)}><Avatar profile={profile} user={account.user} /><i className="account-status" /></button>
    {open && <div id="profile-menu" className="account-menu workspace-surface" role="menu" aria-label="Your account" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
      }
    }}>
      <div className="account-menu-identity"><Avatar profile={profile} user={account.user} /><div><strong>{account.user?.name ?? profile.name}</strong><span>{account.user?.email ?? "Self-hosted · On this device"}</span></div></div>
      <button role="menuitem" onClick={() => { close(); setSettings(true) }}><UserRound size={15} />Profile & account<Settings2 size={13} /></button>
      <button role="menuitem" onClick={() => { close(); onOpenProjects() }}><FolderOpen size={15} />Local projects<ArrowUpRight size={13} /></button>
      <div className="account-menu-footer"><HardDrive size={12} /><span>{profile.workspaceName}</span><i /></div>
    </div>}
    {settings && <ProfileDialog key={account.user?.id ?? 'local'} profile={profile} onSave={onSave} account={account} sync={sync} onClose={() => { setSettings(false); trigger.current?.focus() }} />}
  </div>
}

function ProfileDialog({ profile, onSave, onClose, account, sync }: { profile: UserProfile; onSave: (profile: UserProfile) => void; onClose: () => void; account: CloudAccountState; sync: ReturnType<typeof useCloudSync> }) {
  const [draft, setDraft] = useState(() => ({
    ...profile,
    name: account.user ? account.user.name : profile.name,
    avatar: account.user ? account.user.avatar : profile.avatar,
  }))
  const [theme, setDraftTheme] = useState<StudioTheme>(getTheme)
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const busy = uploading || saving
  const file = useRef<HTMLInputElement>(null)
  const field = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setDraft(current => ({ ...current, [key]: value }))

  async function upload(avatar: File) {
    setUploading(true)
    setError('')
    try { field('avatar', await readAvatar(avatar)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open this image.') }
    finally { setUploading(false) }
  }

  async function submit() {
    if (busy) return
    if (!draft.name.trim() || !draft.workspaceName.trim()) { setError('Enter your name and a workspace name.'); return }
    setSaving(true)
    setError('')
    try {
      const next = { ...draft, name: draft.name.trim(), workspaceName: draft.workspaceName.trim(), mcpToken: draft.mcpToken.trim() }
      if (account.user && (next.name !== account.user.name || next.avatar !== account.user.avatar)) {
        await account.updateProfile({
          name: next.name,
          avatar: next.avatar,
        })
      }
      const local = account.user ? { ...next, name: profile.name, avatar: profile.avatar } : next
      saveProfile(local)
      setTheme(theme)
      onSave(local)
      onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Account settings could not be saved. Browser storage may be full or unavailable.') }
    finally { setSaving(false) }
  }

  async function copyToken() {
    try { await navigator.clipboard.writeText(draft.mcpToken); setCopied(true) }
    catch { setError('Clipboard unavailable. Reveal the token to copy it manually.') }
  }

  return <Dialog className="profile-dialog workspace-surface" labelledBy="profile-title" onClose={onClose} busy={busy}>
    <form onSubmit={event => { event.preventDefault(); void submit() }}>
      <div className="workspace-dialog-heading"><div><span className="workspace-eyebrow">YOUR OWN LITTLE CORNER</span><h2 id="profile-title">Profile & account</h2><p>A personal space. Hosted on your terms.</p></div><button type="button" className="quiet-button" aria-label="Close account settings" disabled={busy} onClick={onClose}><X size={18} /></button></div>
      <div className="profile-body">
        <div className="profile-identity"><Avatar profile={draft} user={account.user ? { ...account.user, name: draft.name, avatar: draft.avatar } : null} large /><div><strong>Your profile picture</strong><span>PNG, JPEG or WebP · up to 5 MB</span><div className="avatar-actions"><button type="button" className="workspace-secondary" disabled={busy} onClick={() => file.current?.click()}><Upload size={12} />{uploading ? 'Preparing…' : 'Upload image'}</button>{draft.avatar && <button type="button" className="workspace-text-button" disabled={busy} onClick={() => field('avatar', '')}>Remove</button>}</div></div><input ref={file} hidden type="file" aria-label="Upload profile image" accept="image/png,image/jpeg,image/webp" onChange={event => { const avatar = event.target.files?.[0]; event.target.value = ''; if (avatar) void upload(avatar) }} /></div>
        <label className="workspace-field">Display name<input required maxLength={80} value={draft.name} autoComplete="name" onChange={event => field('name', event.target.value)} /></label>
        <CloudAccount key={account.user?.id ?? "local"} account={account} sync={sync} disabled={busy} />
        <div className="profile-section-title"><HardDrive size={14} /><h3>Self-host preferences</h3><span>LOCAL</span></div>
        <label className="workspace-field">Workspace name<input required maxLength={80} value={draft.workspaceName} onChange={event => field('workspaceName', event.target.value)} /></label>
        <div className="profile-preference"><div><strong>Studio appearance</strong><span>Choose the space you work best in.</span></div><div className="profile-theme" role="group" aria-label="Preferred studio appearance">{(['dark', 'light'] as const).map(value => <button type="button" key={value} aria-pressed={theme === value} onClick={() => setDraftTheme(value)}>{value === 'dark' ? 'Dark' : 'Light'}</button>)}</div></div>
        <label className="profile-preference"><span><strong>Engineering grid</strong><span>Show the 120 px grid in new projects.</span></span><input className="profile-checkbox" type="checkbox" checked={draft.defaultGrid} onChange={event => field('defaultGrid', event.target.checked)} /></label>
        {!account.user && <><div className="profile-section-title"><KeyRound size={14} /><h3>Local MCP auth token</h3><span>PRIVATE</span></div>
        <p className="profile-note">Store a token for your own MCP gateway. Paper’s bundled stdio server does not use token authentication. This value stays in this browser and is not sent to a server.</p>
        <label className="workspace-field token-field">Auth token<div><input aria-label="Local MCP auth token" type={revealed ? 'text' : 'password'} autoComplete="off" spellCheck={false} maxLength={512} placeholder="Add or generate a token" value={draft.mcpToken} onChange={event => { field('mcpToken', event.target.value); setCopied(false) }} /><button type="button" className="quiet-button" aria-label={revealed ? 'Hide token' : 'Show token'} onClick={() => setRevealed(!revealed)}>{revealed ? <EyeOff size={14} /> : <Eye size={14} />}</button><button type="button" className="quiet-button" aria-label="Copy token" disabled={!draft.mcpToken} onClick={() => void copyToken()}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div></label>
        <div className="token-actions"><button type="button" className="workspace-secondary" onClick={() => { field('mcpToken', generateToken()); setCopied(false) }}>{draft.mcpToken ? 'Regenerate token' : 'Generate token'}</button>{draft.mcpToken && <button type="button" className="workspace-text-button" onClick={() => { field('mcpToken', ''); setCopied(false) }}>Remove token</button>}<span role="status">{copied ? 'Copied to clipboard' : 'Changes apply when saved'}</span></div>
        </>}
        {error && <p className="workspace-error" role="alert">{error}</p>}
      </div>
      <div className="workspace-dialog-footer"><span>{account.user ? <><Cloud size={12} />Cloud synced workspace</> : <><HardDrive size={12} />Only on this device</>}</span><div><button type="button" className="workspace-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="workspace-primary" type="submit" disabled={busy}>{saving ? "Saving…" : "Save changes"}</button></div></div>
    </form>
  </Dialog>
}
