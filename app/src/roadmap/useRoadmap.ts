import { useCallback, useEffect, useRef, useState } from 'react'
import snapshot from './snapshot.json'
import { parseRoadmap } from './model'

export function useRoadmap() {
  const [feed, setFeed] = useState(() => parseRoadmap(snapshot))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const request = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}roadmap.json`, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error('Feed unavailable')
      const next = parseRoadmap(await response.json())
      if (request.current !== controller) return
      setFeed(next)
      setVerified(true)
      setError('')
    } catch {
      if (request.current === controller) setError('Could not refresh the roadmap. Showing the last available snapshot.')
    } finally {
      window.clearTimeout(timeout)
      if (request.current === controller) { request.current = null; setLoading(false) }
    }
  }, [])

  useEffect(() => {
    let disposed = false
    queueMicrotask(() => { if (!disposed) void refresh() })
    const whenVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const interval = window.setInterval(whenVisible, 30_000)
    document.addEventListener('visibilitychange', whenVisible)
    window.addEventListener('online', whenVisible)
    return () => {
      disposed = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', whenVisible)
      window.removeEventListener('online', whenVisible)
      request.current?.abort()
      request.current = null
    }
  }, [refresh])

  return { feed, loading, error, verified, refresh }
}
