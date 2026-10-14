import { useEffect, useState } from 'react'
import type { SceneStore } from '../scene/store'
import type { ViewportController } from '../canvas/ViewportController'
import { CollaborationSession } from './session'

export function useCollaboration(
  room: string,
  store: SceneStore,
  controller: ViewportController,
  name: string,
  enabled = false
) {
  const [session, setSession] = useState<CollaborationSession | null>(null)
  useEffect(() => {
    if (!enabled) {
      setSession(null)
      return
    }
    const current = new CollaborationSession(room, store, controller, name)
    setSession(current)
    current.start()
    return () => current.stop()
    // Profile changes update presence without replacing the connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, store, controller, enabled])
  useEffect(() => { session?.setName(name) }, [session, name])
  return session
}
