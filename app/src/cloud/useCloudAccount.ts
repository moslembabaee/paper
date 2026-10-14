import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { CloudSession } from './api'

export function useCloudAccount() {
  const [session, setSession] = useState<CloudSession>({ user: null, providers: { google: false, github: false } })
  const [available, setAvailable] = useState(false)
  const [checked, setChecked] = useState(false)
  const refresh = useCallback(async () => {
    // Static hosts never probe /api; a self-hosted server opts in with a tiny capability file.
    if (!available) return
    setSession(await api<CloudSession>('/auth/session'))
  }, [available])
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
  const logout = useCallback(async () => { await api('/auth/logout', { method: 'POST', headers: { 'X-Paper-Account': session.user?.id ?? '' } }); setSession(current => ({ ...current, user: null })) }, [session.user?.id])
  const regenerate = useCallback(async () => {
    const { token } = await api<{ token: string }>('/auth/token/regenerate', { method: 'POST', headers: { 'X-Paper-Account': session.user?.id ?? '' } })
    setSession(current => ({ ...current, user: current.user ? { ...current.user, hasMcpToken: true } : null }))
    return token
  }, [session.user?.id])
  return { ...session, available, checked, refresh, logout, regenerate }
}
