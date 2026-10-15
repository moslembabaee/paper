import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ViewportController } from '../canvas'
import { getWorldMatrix } from '../scene/geometry'
import type { SceneStore } from '../scene/store'
import { useScene } from '../scene/useScene'
import { freezeShader } from './catalog'
import { meshToSurface, surfaceToMesh } from './mesh'
import { MeshAnchorHandle } from './MeshAnchorHandle'

export function MeshCanvasOverlay({ store, controller }: { store: SceneStore; controller: ViewportController }) {
  const state = useScene(store, value => value)
  const [viewport, setViewport] = useState(() => controller.getSnapshot())
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 })
  const host = useRef<HTMLDivElement>(null)
  const ownsGesture = useRef(false)
  useLayoutEffect(() => controller.subscribe(setViewport), [controller])
  const node = state.selection.length === 1 ? state.elements[state.selection[0]] : undefined
  const paint = node ? node.style.shader : state.selection.length === 0 ? state.backgroundShader : null
  const enabled = paint?.kind === 'mesh-gradient' && !!paint.mesh && (!node || (!store.isLocked(node.id) && store.isVisible(node.id)))
  // The material excludes the rulers; controller.size includes them.
  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    const resize = () => setSurfaceSize({ width: element.clientWidth, height: element.clientHeight })
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled])
  const finish = useCallback((cancel: boolean) => {
    if (!ownsGesture.current) return
    ownsGesture.current = false
    if (cancel) store.cancelTransaction()
    else store.endTransaction()
  }, [store])
  useLayoutEffect(() => () => finish(true), [finish])
  if (!enabled || paint?.kind !== 'mesh-gradient' || !paint.mesh) return null
  const matrix = node ? getWorldMatrix(state, node.id) : null
  const { camera } = viewport
  const toScreen = (point: { x: number; y: number }) => {
    const p = meshToSurface(point, paint)
    if (!node || !matrix) return { x: p.x * surfaceSize.width, y: p.y * surfaceSize.height }
    const [a, b, c, d, e, f] = matrix
    const x = p.x * node.width, y = p.y * node.height
    return { x: (a * x + c * y + e) * camera.zoom + camera.x, y: (b * x + d * y + f) * camera.zoom + camera.y }
  }
  return <div ref={host} className="mesh-canvas-overlay" data-testid="mesh-canvas-overlay" aria-label="Canvas mesh anchors">
    {paint.mesh.anchors.map((anchor, index) => {
      const position = toScreen(anchor)
      return <MeshAnchorHandle key={`${node?.id ?? 'background'}-${index}`} index={index} color={paint.params.colors[index]} anchor={anchor} style={{ left: position.x, top: position.y }}
        project={(clientX, clientY) => {
          const rect = host.current!.getBoundingClientRect()
          const point = { x: clientX - rect.left, y: clientY - rect.top }
          if (!node || !matrix) return surfaceToMesh({ x: point.x / Math.max(1, rect.width), y: point.y / Math.max(1, rect.height) }, paint)
          const world = controller.screenToWorld(point)
          const [a, b, c, d, e, f] = matrix, det = a * d - b * c
          const x = world.x - e, y = world.y - f
          return surfaceToMesh({ x: (d * x - c * y) / det / Math.max(.001, node.width), y: (a * y - b * x) / det / Math.max(.001, node.height) }, paint)
        }}
        onStart={() => { if (store.getHistorySnapshot().active) return false; ownsGesture.current = true; store.beginTransaction('Move mesh anchor') }}
        onEnd={finish}
        onMove={point => {
          const currentNode = node ? store.getSnapshot().elements[node.id] : undefined
          const current = node ? currentNode?.style.shader : store.getSnapshot().backgroundShader
          if (current?.kind !== 'mesh-gradient' || !current.mesh || (node && (!currentNode || store.isLocked(node.id) || !store.isVisible(node.id)))) return
          const next = freezeShader({ ...current, mesh: { ...current.mesh, anchors: current.mesh.anchors.map((value, i) => i === index ? { ...value, ...point } : value) } })
          if (currentNode) store.update(currentNode.id, currentNode.type, { style: { shader: next } })
          else store.setBackgroundShader(next)
        }} />
    })}
  </div>
}
