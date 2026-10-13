import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CanvasViewport, unionBounds } from '../canvas'
import type { ViewportController } from '../canvas'
import type { Camera } from '../canvas/types'
import { getWorldBounds } from './geometry'
import { SceneRenderer } from './SceneRenderer'
import { SelectionOverlay } from './SelectionOverlay'
import type { SceneStore } from './store'
import { useScene } from './useScene'
import { PenOverlay } from './PenOverlay'
import { AgentOverlay } from '../mcp/AgentOverlay'
import type { AgentActivity } from '../mcp/protocol'
import { ShaderSurface } from '../shaders/ShaderSurface'
import { useArrangeShortcuts } from './useArrangeShortcuts'

export function SceneCanvas({ store, controller, grid, panMode, penMode = false, onExitPen, initialCamera, agentActivity }: { store: SceneStore; controller: ViewportController; grid: boolean; panMode: boolean; penMode?: boolean; onExitPen?: () => void; initialCamera?: Camera; agentActivity?: AgentActivity | null }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  useArrangeShortcuts(store, controller, !penMode && !editingId)
  useLayoutEffect(() => {
    const viewport = hostRef.current!.querySelector<HTMLElement>('.canvas-viewport')!
    const enter = (id: string | undefined) => {
      const node = id ? store.getSnapshot().elements[id] : undefined
      if (node?.type === 'path' && !node.boolean && !store.isLocked(node.id) && store.isVisible(node.id)) { store.select([node.id]); setEditingId(node.id) }
    }
    const doubleClick = (event: MouseEvent) => {
      if (panMode || penMode || editingId || (event.target as Element).closest('.viewport-ui')) return
      const hit = document.elementsFromPoint(event.clientX, event.clientY).map(e => e.closest<HTMLElement>('[data-element-id]')).find(Boolean)
      enter(hit?.dataset.elementId)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || (event.target as Element).closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return
      if (event.key === 'Enter' && !penMode && !panMode && !editingId) { event.preventDefault(); enter(store.getSnapshot().selection[0]) }
    }
    viewport.addEventListener('dblclick', doubleClick); document.addEventListener('keydown', keydown)
    return () => { viewport.removeEventListener('dblclick', doubleClick); document.removeEventListener('keydown', keydown) }
  }, [store, panMode, penMode, editingId])
  const elements = useScene(store, state => state.elements)
  const rootIds = useScene(store, state => state.rootIds)
  const backgroundShader = useScene(store, state => state.backgroundShader)
  const items = useMemo(() => {
    const state = store.getSnapshot()
    return rootIds.filter(id => store.isVisible(id)).map(id => ({ id, ...getWorldBounds(state, id), color: elements[id].style.fill ?? '#edebe1' }))
  }, [store, rootIds, elements])
  const bounds = useMemo(() => unionBounds(items), [items])
  return (
    <div ref={hostRef} style={{ display: 'contents' }}><CanvasViewport controller={controller} initialCamera={initialCamera} contentBounds={bounds} minimapItems={items} gridVisible={grid} panMode={panMode} background={backgroundShader && <ShaderSurface paint={backgroundShader} />} overlay={<><AgentOverlay store={store} controller={controller} activity={agentActivity} />{!panMode && (penMode || (editingId && elements[editingId]?.type === 'path' && !store.isLocked(editingId) && store.isVisible(editingId))) ? <PenOverlay key={`${editingId ?? 'new'}-${penMode}`} store={store} controller={controller} editingId={editingId} penMode={penMode} onFinish={() => { setEditingId(null); onExitPen?.() }} /> : <SelectionOverlay store={store} controller={controller} panMode={panMode} />}</>}>
      <SceneRenderer store={store} interactive={!panMode} />
    </CanvasViewport></div>
  )
}
