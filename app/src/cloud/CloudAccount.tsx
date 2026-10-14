import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Cloud, Copy, Eye, EyeOff, GitBranch, KeyRound, LogOut, RefreshCw, ShieldAlert, Terminal } from 'lucide-react'
import type { useCloudAccount } from './useCloudAccount'
import type { useCloudSync } from './useCloudSync'
import { Dialog } from '../workspace/Dialog'
import { initials } from '../workspace/profile'

export type CloudAccountState = ReturnType<typeof useCloudAccount>

export function CloudAccount({ account, sync, disabled = false }: { account: CloudAccountState; sync: ReturnType<typeof useCloudSync>; disabled?: boolean }) {
  const [token, setToken] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pending = useRef(false)
  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const action = async (work: () => Promise<void>) => {
    if (pending.current || disabled) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please try again')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  const handleReveal = async () => {
    await action(async () => {
      if (!revealed) {
        const secret = await account.revealToken()
        setToken(secret)
      } else setToken('')
      setRevealed(!revealed)
    })
  }

  const handleCopy = async () => {
    await action(async () => {
      const raw = await account.revealToken()
      try { await navigator.clipboard.writeText(raw) }
      catch { throw new Error('Clipboard unavailable. Reveal the token to copy it manually.') }
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2500)
    })
  }

  const handleRotate = async () => {
    await action(async () => {
      const next = await account.rotate()
      setToken(next)
      setRevealed(true)
      setCopied(false)
    })
  }

  const handleRevoke = async () => {
    await action(async () => {
      await account.revoke()
      setToken('')
      setRevealed(false)
      setCopied(false)
    })
  }

  const handleGenerate = async () => {
    await action(async () => {
      const next = await account.regenerate()
      setToken(next)
      setRevealed(true)
      setCopied(false)
    })
  }

  return (
    <section className="cloud-account" aria-label="Cloud account">
      <div className="profile-section-title">
        <Cloud size={14} />
        <h3>Your cloud workspace</h3>
        <span>{account.user ? 'CONNECTED' : 'OPTIONAL'}</span>
      </div>

      {account.user ? (
        <>
          <div className="cloud-identity">
            {account.user.avatar ? (
              <img src={account.user.avatar} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="account-avatar">{initials(account.user.name)}</span>
            )}
            <div>
              <strong>{account.user.name}</strong>
              <span>
                {account.user.email} · {account.user.provider === 'google' ? 'Google' : account.user.provider === 'github' ? 'GitHub' : 'Cloud workspace'}
              </span>
            </div>
            <button
              type="button"
              className="quiet-button"
              aria-label="Sign out"
              title="Sign out of Paper Cloud"
              disabled={busy || disabled}
              onClick={() => void action(account.logout)}
            >
              <LogOut size={14} />
            </button>
          </div>

          <p className="profile-note">Your projects stay on this device and sync to your private account.</p>
          {sync.offered.length > 0 && (
            <button type="button" className="workspace-secondary" onClick={() => sync.setMigrationOpen(true)}>
              Sync {sync.offered.length} local {sync.offered.length === 1 ? 'project' : 'projects'}…
            </button>
          )}

          <div className="profile-section-title">
            <KeyRound size={14} />
            <h3>Remote MCP Auth Token</h3>
            <span>{account.user.hasMcpToken ? 'ACTIVE' : 'NONE'}</span>
          </div>
          <p className="profile-note">
            Connect Claude Code, Codex, Cursor, or Google Antigravity to <code>{location.origin}/mcp</code> with an <code>Authorization: Bearer</code> token. Your agent can read and edit synced projects while Paper is closed.
          </p>

          <label className="workspace-field token-field">
            Auth token
            <div>
              <input
                aria-label="Remote MCP auth token"
                readOnly
                type={revealed ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={revealed && token ? token : account.user.hasMcpToken ? '•••••••••••••••••••••••••••••••••••••••••••' : ''}
                placeholder={account.user.hasMcpToken ? 'Click reveal to view your private token' : 'No active token · Click Generate token'}
              />
              <button
                type="button"
                className="quiet-button"
                disabled={busy || disabled || !account.user.hasMcpToken}
                aria-label={revealed ? 'Hide remote token' : 'Reveal remote token'}
                title={revealed ? 'Hide remote token' : 'Reveal remote token'}
                onClick={() => void handleReveal()}
              >
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="button"
                className="quiet-button"
                aria-label="Copy remote token"
                title="Copy token to clipboard"
                disabled={busy || disabled || !account.user.hasMcpToken}
                onClick={() => void handleCopy()}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </label>

          <div className="token-actions">
            {account.user.hasMcpToken ? (
              <>
                <button
                  type="button"
                  className="workspace-secondary"
                  disabled={busy || disabled}
                  onClick={() => void handleRotate()}
                  title="Generate a new token; immediately revokes the current token"
                >
                  <RefreshCw size={13} />
                  {busy ? 'Working…' : 'Rotate token'}
                </button>
                <button
                  type="button"
                  className="workspace-danger-button"
                  disabled={busy || disabled}
                  onClick={() => void handleRevoke()}
                  title="Revoke token server-side; cuts off remote agent access"
                >
                  <ShieldAlert size={13} />
                  {busy ? 'Revoking…' : 'Revoke token'}
                </button>
                <span role="status">
                  {copied ? 'Copied to clipboard' : 'Rotating or revoking invalidates previous tokens immediately'}
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="workspace-primary"
                  disabled={busy || disabled}
                  onClick={() => void handleGenerate()}
                >
                  <KeyRound size={13} />
                  {busy ? 'Generating…' : 'Generate MCP token'}
                </button>
                <span role="status">
                  {copied ? 'Copied to clipboard' : 'A private key for agents you trust'}
                </span>
              </>
            )}
          </div>

          <details className="mcp-config-guide">
            <summary>
              <Terminal size={12} />
              <span>Agent client configuration snippet</span>
              <ChevronDown size={12} />
            </summary>
            <pre>
              {JSON.stringify(
                {
                  mcpServers: {
                    paper: {
                      url: `${location.origin}/mcp`,
                      headers: {
                        Authorization: 'Bearer <YOUR_PAPER_TOKEN>',
                      },
                    },
                  },
                },
                null,
                2
              )}
            </pre>
          </details>
        </>
      ) : (
        <>
          <p className="profile-note">
            Keep working locally, or sign in to back up projects and connect remote AI agents through Paper’s Model Context Protocol.
          </p>
          {account.available && (account.providers.google || account.providers.github) ? (
            <div className="cloud-signin">
              {account.providers.google && (
                <a className="workspace-secondary oauth-button" href="/api/auth/google">
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Sign in with Google</span>
                </a>
              )}
              {account.providers.github && (
                <a className="workspace-secondary oauth-button" href="/api/auth/github">
                  <GitBranch size={14} />
                  <span>Sign in with GitHub</span>
                </a>
              )}
            </div>
          ) : (
            <p className="profile-note">
              {account.checked
                ? account.available
                  ? 'The host has not configured Google or GitHub OAuth yet.'
                  : 'This host supports local workspaces. Your projects stay on this device.'
                : 'Checking cloud availability…'}
            </p>
          )}
        </>
      )}

      {(error || account.authNotice) && (
        <p className="workspace-error" role="alert">
          {error || account.authNotice}
        </p>
      )}
    </section>
  )
}

export function MigrationDialog({ sync }: { sync: ReturnType<typeof useCloudSync> }) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog className="profile-dialog workspace-surface cloud-migration" labelledBy="migration-title" onClose={() => sync.setMigrationOpen(false)} busy={busy}>
      <div className="workspace-dialog-heading">
        <div>
          <span className="workspace-eyebrow">A SPACE THAT TRAVELS WITH YOU</span>
          <h2 id="migration-title">Bring your projects along.</h2>
          <p>{sync.offered.length} local {sync.offered.length === 1 ? 'project is' : 'projects are'} ready to sync to your account.</p>
        </div>
      </div>
      <div className="profile-body">
        <p className="profile-note">Your local copies stay here. Cloud copies let you pick up on another device and work with remote agents.</p>
        {sync.error && <p className="workspace-error" role="alert">{sync.error}</p>}
      </div>
      <div className="workspace-dialog-footer">
        <span>Always local first</span>
        <div>
          <button type="button" className="workspace-secondary" disabled={busy} onClick={() => sync.setMigrationOpen(false)}>
            Keep local for now
          </button>
          <button type="button" className="workspace-primary" disabled={busy} onClick={() => { setBusy(true); void sync.uploadLocal().finally(() => setBusy(false)) }}>
            {busy ? 'Preparing…' : 'Sync my projects'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
