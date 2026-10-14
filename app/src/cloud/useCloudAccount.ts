import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { CloudSession } from './api'
import type { CloudUser } from './model'

export function useCloudAccount() {
  const [session, setSession] = useState<CloudSession>({ user: null, providers: { google: false, github: false } })
  const [available, setAvailable] = useState(false)
  const [checked, setChecked] = useState(false)
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    // Static hosts never probe /api; a self-hosted server opts in with a tiny capability file.
    if (!available) return
    setSession(await api<CloudSession>('/auth/session'))
  }, [available])

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const error = params.get('auth_error')
      const success = params.get('auth')
      if (error) {
        setAuthNotice(error)
        params.delete('auth_error')
      } else if (success === 'success') {
        params.delete('auth')
      }
      if (error || success === 'success') {
        const clean = window.location.pathname + (params.toString() ? `?${params.toString()}` : '') + window.location.hash
        window.history.replaceState(null, '', clean)
      }
    } catch { /* Ignore headless sandboxes */ }
  }, [])

  useEffect(() => {
    let stopped = false
    const abort = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}cloud.json`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(4000)]), cache: 'no-cache' })
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || (await response.json()).cloud !== true) return
        const next = await api<CloudSession>('/auth/session', { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(4000)]) })
        if (!stopped) { setSession(next); setAvailable(true) }
      } catch { /* Local workspace remains available. */ }
      finally { if (!stopped) setChecked(true) }
    })()
    return () => { stopped = true; abort.abort() }
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST', headers: { 'X-Paper-Account': session.user?.id ?? '' } })
    setSession(current => ({ ...current, user: null }))
  }, [session.user?.id])

  const regenerate = useCallback(async () => {
    const { token, user } = await api<{ token: string; user: CloudUser }>('/auth/token/regenerate', { method: 'POST', headers: { 'X-Paper-Account': session.user?.id ?? '' } })
    setSession(current => current.user?.id === session.user?.id ? { ...current, user } : current)
    return token
  }, [session.user?.id])

  const revoke = useCallback(async () => {
    const { user } = await api<{ user: CloudUser }>('/auth/token', { method: 'DELETE', headers: { 'X-Paper-Account': session.user?.id ?? '' } })
    setSession(current => current.user?.id === session.user?.id ? { ...current, user } : current)
  }, [session.user?.id])

  const revealToken = useCallback(async () => {
    const { token } = await api<{ token: string }>('/auth/token', { headers: { 'X-Paper-Account': session.user?.id ?? '' } })
    return token
  }, [session.user?.id])

  const updateProfile = useCallback(async (updates: { name?: string; avatar?: string }) => {
    const { user } = await api<{ user: CloudUser }>('/auth/profile', {
      method: 'PATCH',
      headers: { 'X-Paper-Account': session.user?.id ?? '' },
      body: JSON.stringify(updates),
    })
    setSession(current => current.user?.id === user.id ? { ...current, user } : current)
    return user
  }, [session.user?.id])

  const clearAuthNotice = useCallback(() => setAuthNotice(null), [])

  return {
    ...session,
    available,
    checked,
    authNotice,
    clearAuthNotice,
    refresh,
    logout,
    regenerate,
    rotate: regenerate,
    revoke,
    revealToken,
    updateProfile,
  }
}
