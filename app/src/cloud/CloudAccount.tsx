import { useState } from 'react'
import { Check, Cloud, Copy, Eye, EyeOff, GitBranch, KeyRound, LogOut } from 'lucide-react'
import { api } from './api'
import type { useCloudAccount } from './useCloudAccount'
import type { useCloudSync } from './useCloudSync'
import { Dialog } from '../workspace/Dialog'

export type CloudAccountState = ReturnType<typeof useCloudAccount>
export function CloudAccount({ account, sync }: { account: CloudAccountState; sync: ReturnType<typeof useCloudSync> }) {
  const [token, setToken] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const action = async (work: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await work() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again') } finally { setBusy(false) }
  }
  return <section className="cloud-account" aria-label="Cloud account">
    <div className="profile-section-title"><Cloud size={14} /><h3>Your cloud workspace</h3><span>{account.user ? 'CONNECTED' : 'OPTIONAL'}</span></div>
    {account.user ? <>
      <div className="cloud-identity">{account.user.avatar && <img src={account.user.avatar} alt="" referrerPolicy="no-referrer" />}<div><strong>{account.user.name}</strong><span>{account.user.email}</span></div><button type="button" className="quiet-button" aria-label="Sign out" disabled={busy} onClick={() => void action(account.logout)}><LogOut size={14} /></button></div>
      <p className="profile-note">Your projects stay on this device and sync to your private account.</p>
      {sync.offered.length > 0 && <button type="button" className="workspace-secondary" onClick={() => sync.setMigrationOpen(true)}>Sync {sync.offered.length} local {sync.offered.length === 1 ? 'project' : 'projects'}…</button>}
      <div className="profile-section-title"><KeyRound size={14} /><h3>Remote MCP token</h3><span>PRIVATE</span></div>
      <p className="profile-note">Connect your agent to <code>{location.origin}/mcp</code> with an Authorization: Bearer token. Your agent can edit synced projects while Paper is closed.</p>
      <label className="workspace-field token-field">Auth token<div><input aria-label="Remote MCP auth token" readOnly type={revealed ? 'text' : 'password'} autoComplete="off" value={token} placeholder={account.user.hasMcpToken ? 'Reveal your private token' : 'Generate a private token'} /><button type="button" className="quiet-button" disabled={busy || !account.user.hasMcpToken} aria-label={revealed ? 'Hide remote token' : 'Reveal remote token'} onClick={() => void action(async () => { if (!token) setToken((await api<{ token: string }>('/auth/token', { headers: { 'X-Paper-Account': account.user?.id ?? '' } })).token); setRevealed(!revealed) })}>{revealed ? <EyeOff size={14} /> : <Eye size={14} />}</button><button type="button" className="quiet-button" aria-label="Copy remote token" disabled={busy || !account.user.hasMcpToken} onClick={() => void action(async () => { const raw = token || (await api<{ token: string }>('/auth/token', { headers: { 'X-Paper-Account': account.user?.id ?? '' } })).token; setToken(raw); await navigator.clipboard.writeText(raw); setCopied(true) })}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div></label>
      <div className="token-actions"><button type="button" className="workspace-secondary" disabled={busy} onClick={() => void action(async () => { setToken(await account.regenerate()); setRevealed(true); setCopied(false) })}>{busy ? 'Working…' : account.user.hasMcpToken ? 'Regenerate remote token' : 'Generate remote token'}</button><span role="status">{copied ? 'Copied to clipboard' : 'Previous tokens are revoked immediately'}</span></div>
    </> : <>
      <p className="profile-note">Keep working locally, or sign in to back up projects and connect remote agents.</p>
      {account.available && (account.providers.google || account.providers.github) ? <div className="cloud-signin">{account.providers.google && <a className="workspace-secondary" href="/api/auth/google"><span className="google-mark" aria-hidden="true">G</span>Sign in with Google</a>}{account.providers.github && <a className="workspace-secondary" href="/api/auth/github"><GitBranch size={14} />Sign in with GitHub</a>}</div> : <p className="profile-note">{account.checked ? account.available ? 'The host has not configured sign-in yet.' : 'This host supports local workspaces. Your projects stay on this device.' : 'Checking cloud availability…'}</p>}
    </>}
    {error && <p className="workspace-error" role="alert">{error}</p>}
  </section>
}
export function MigrationDialog({ sync }: { sync: ReturnType<typeof useCloudSync> }) {
  const [busy, setBusy] = useState(false)
  return <Dialog className="profile-dialog workspace-surface cloud-migration" labelledBy="migration-title" onClose={() => sync.setMigrationOpen(false)} busy={busy}>
    <div className="workspace-dialog-heading"><div><span className="workspace-eyebrow">A SPACE THAT TRAVELS WITH YOU</span><h2 id="migration-title">Bring your projects along.</h2><p>{sync.offered.length} local {sync.offered.length === 1 ? 'project is' : 'projects are'} ready to sync to your account.</p></div></div>
    <div className="profile-body"><p className="profile-note">Your local copies stay here. Cloud copies let you pick up on another device and work with remote agents.</p>{sync.error && <p className="workspace-error" role="alert">{sync.error}</p>}</div>
    <div className="workspace-dialog-footer"><span>Always local first</span><div><button type="button" className="workspace-secondary" disabled={busy} onClick={() => sync.setMigrationOpen(false)}>Keep local for now</button><button type="button" className="workspace-primary" disabled={busy} onClick={() => { setBusy(true); void sync.uploadLocal().finally(() => setBusy(false)) }}>{busy ? 'Preparing…' : 'Sync my projects'}</button></div></div>
  </Dialog>
}
