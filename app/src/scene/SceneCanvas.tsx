import { useMemo } from 'react'
import { CanvasViewport, unionBounds } from '../canvas'
import type { ViewportController } from '../canvas'
import type { Camera } from '../canvas/types'
import { getWorldBounds } from './geometry'
import { SceneRenderer } from './SceneRenderer'
import { SelectionOverlay } from './SelectionOverlay'
import type { SceneStore } from './store'
import { useScene } from './useScene'
import { ShaderSurface } from '../shaders/ShaderSurface'

export function SceneCanvas({ store, controller, grid, panMode, initialCamera }: { store: SceneStore; controller: ViewportController; grid: boolean; panMode: boolean; initialCamera?: Camera }) {
  const elements = useScene(store, state => state.elements)
  const rootIds = useScene(store, state => state.rootIds)
  const backgroundShader = useScene(store, state => state.backgroundShader)
  const items = useMemo(() => {
    const state = store.getSnapshot()
    return rootIds.filter(id => store.isVisible(id)).map(id => ({ id, ...getWorldBounds(state, id), color: elements[id].style.fill ?? '#edebe1' }))
  }, [store, rootIds, elements])
  const bounds = useMemo(() => unionBounds(items), [items])
  return (
    <CanvasViewport controller={controller} initialCamera={initialCamera} contentBounds={bounds} minimapItems={items} gridVisible={grid} panMode={panMode} background={backgroundShader && <ShaderSurface paint={backgroundShader} />} overlay={<SelectionOverlay store={store} controller={controller} panMode={panMode} />}>
      <SceneRenderer store={store} interactive={!panMode} />
    </CanvasViewport>
  )
}
