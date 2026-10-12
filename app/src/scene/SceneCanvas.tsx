import { useMemo } from 'react'
import { CanvasViewport, unionBounds } from '../canvas'
import type { ViewportController } from '../canvas'
import { getWorldBounds } from './geometry'
import { SceneRenderer } from './SceneRenderer'
import type { SceneStore } from './store'
import { useScene } from './useScene'

export function SceneCanvas({ store, controller, grid, panMode }: { store: SceneStore; controller: ViewportController; grid: boolean; panMode: boolean }) {
  const elements = useScene(store, state => state.elements)
  const rootIds = useScene(store, state => state.rootIds)
  const items = useMemo(() => {
    const state = store.getSnapshot()
    return rootIds.filter(id => store.isVisible(id)).map(id => ({ id, ...getWorldBounds(state, id), color: elements[id].style.fill ?? '#edebe1' }))
  }, [store, rootIds, elements])
  const bounds = useMemo(() => unionBounds(items), [items])
  return <CanvasViewport controller={controller} contentBounds={bounds} minimapItems={items} gridVisible={grid} panMode={panMode}><SceneRenderer store={store} interactive={!panMode} /></CanvasViewport>
}
