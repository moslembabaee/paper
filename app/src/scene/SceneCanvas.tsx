import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CanvasViewport, unionBounds } from '../canvas'
import type { ViewportController } from '../canvas'
import type { Camera, Point } from '../canvas/types'
import { getWorldBounds } from './geometry'
import { SceneRenderer } from './SceneRenderer'
import { SelectionOverlay } from './SelectionOverlay'
import type { SceneStore } from './store'
import { useScene } from './useScene'
import { PenOverlay } from './PenOverlay'
import { AgentOverlay } from '../mcp/AgentOverlay'
import type { AgentActivity } from '../mcp/protocol'
import { ShaderSurface } from '../shaders/ShaderSurface'
import { MeshCanvasOverlay } from '../shaders/MeshCanvasOverlay'
import { useArrangeShortcuts } from './useArrangeShortcuts'
import { measurementHit } from './measurementGeometry'
import { CollaborationOverlay } from '../collaboration/CollaborationOverlay'
import type { CollaborationSession } from '../collaboration/session'
import { CanvasContextMenu } from './CanvasContextMenu'

export function SceneCanvas({ store, controller, grid, panMode, penMode = false, onExitPen, initialCamera, agentActivity, prototypeOverlay, collaboration, annotationOverlay, commentMode = false }: { store: SceneStore; controller: ViewportController; grid: boolean; panMode: boolean; penMode?: boolean; onExitPen?: () => void; initialCamera?: Camera; agentActivity?: AgentActivity | null; prototypeOverlay?: ReactNode; collaboration?: CollaborationSession | null; annotationOverlay?: ReactNode; commentMode?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; worldPos: Point } | null>(null)
  useLayoutEffect(() => {
    let active = true
    const refresh = () => { if (active) store.refreshLayout() }
    void document.fonts.ready.then(refresh)
    document.fonts.addEventListener('loadingdone', refresh)
    return () => { active = false; document.fonts.removeEventListener('loadingdone', refresh) }
  }, [store])
  const interactionDisabled = Boolean(prototypeOverlay) || commentMode
  if (interactionDisabled && editingId !== null) setEditingId(null)
  useArrangeShortcuts(store, controller, !interactionDisabled && !penMode && !editingId)
  useLayoutEffect(() => {
    if (interactionDisabled) return
    const viewport = hostRef.current!.querySelector<HTMLElement>('.canvas-viewport')!
    const enter = (id: string | undefined) => {
      if (store.getHistorySnapshot().active) return
      const node = id ? store.getSnapshot().elements[id] : undefined
      if (node?.type === 'path' && !node.boolean && !store.isLocked(node.id) && store.isVisible(node.id)) { store.select([node.id]); setEditingId(node.id) }
    }
    const doubleClick = (event: MouseEvent) => {
      if (panMode || penMode || editingId || viewport.dataset.space === 'true' || viewport.dataset.panning === 'true' || (event.target as Element).closest('.viewport-ui')) return
      const rect = viewport.getBoundingClientRect()
      const hit = measurementHit(store.getSnapshot(), controller.screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }), true)
      enter(hit ?? undefined)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || (event.target as Element).closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return
      if (event.key === 'Enter' && !penMode && !panMode && !editingId) { event.preventDefault(); enter(store.getSnapshot().selection[0]) }
    }
    const handleContextMenu = (event: MouseEvent) => {
      if (panMode || penMode || (event.target as Element).closest('.viewport-ui, button, input, textarea, select, [role="dialog"], [role="menu"]')) return
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const worldPos = controller.screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top })
      const hit = measurementHit(store.getSnapshot(), worldPos, true)
      const currentSelection = store.getSnapshot().selection
      if (hit) {
        if (!currentSelection.includes(hit)) {
          store.select([hit])
        }
      } else {
        store.select([])
      }
      setContextMenu({ x: event.clientX, y: event.clientY, worldPos })
    }
    viewport.addEventListener('dblclick', doubleClick); document.addEventListener('keydown', keydown); viewport.addEventListener('contextmenu', handleContextMenu)
    const unsubscribe = store.subscribe(() => {
      if (!editingId) return
      const state = store.getSnapshot(), node = state.elements[editingId]
      if (node?.type !== 'path' || node.boolean || store.isLocked(editingId) || !store.isVisible(editingId) || state.selection.length !== 1 || state.selection[0] !== editingId) setEditingId(null)
    })
    return () => { unsubscribe(); viewport.removeEventListener('dblclick', doubleClick); document.removeEventListener('keydown', keydown); viewport.removeEventListener('contextmenu', handleContextMenu) }
  }, [store, controller, panMode, penMode, editingId, interactionDisabled])
  const elements = useScene(store, state => state.elements)
  const rootIds = useScene(store, state => state.rootIds)
  const backgroundShader = useScene(store, state => state.backgroundShader)
  const items = useMemo(() => {
    const state = store.getSnapshot()
    return rootIds.filter(id => store.isVisible(id)).map(id => ({ id, ...getWorldBounds(state, id), color: elements[id].style.fill ?? '#edebe1' }))
  }, [store, rootIds, elements])
  const bounds = useMemo(() => unionBounds(items), [items])
  return (
    <div ref={hostRef} style={{ display: 'contents' }}>
      <CanvasViewport controller={controller} initialCamera={initialCamera} contentBounds={bounds} minimapItems={items} gridVisible={grid} panMode={panMode} background={backgroundShader && <ShaderSurface paint={backgroundShader} />} overlay={<>{collaboration && <CollaborationOverlay session={collaboration} store={store} controller={controller} />}<AgentOverlay store={store} controller={controller} activity={agentActivity} />{annotationOverlay}{commentMode ? null : prototypeOverlay ?? (!panMode && (penMode || (editingId && elements[editingId]?.type === 'path' && !store.isLocked(editingId) && store.isVisible(editingId))) ? <PenOverlay key={`${editingId ?? 'new'}-${penMode}`} store={store} controller={controller} editingId={editingId} penMode={penMode} onFinish={() => { setEditingId(null); onExitPen?.() }} /> : <><SelectionOverlay store={store} controller={controller} panMode={panMode} />{!panMode && <MeshCanvasOverlay store={store} controller={controller} />}</>)}</>}>
        <SceneRenderer store={store} interactive={!panMode && !commentMode} />
      </CanvasViewport>
      {contextMenu && (
        <CanvasContextMenu
          store={store}
          controller={controller}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
