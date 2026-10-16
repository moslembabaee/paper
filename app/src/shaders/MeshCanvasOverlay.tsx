import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { ViewportController } from '../canvas'
import { getWorldMatrix } from '../scene/geometry'
import type { SceneStore } from '../scene/store'
import { useScene } from '../scene/useScene'
import { freezeShader } from './catalog'
import { clampUnit, interpolateMeshColor, meshToSurface, surfaceToMesh } from './mesh'
import { MeshAnchorHandle } from './MeshAnchorHandle'
import {
  setMeshActiveAnchor,
  setMeshPlacementMode,
  useMeshActiveAnchor,
  useMeshPlacementMode,
} from './meshState'
import type { MeshAnchor } from './types'

export function MeshCanvasOverlay({ store, controller }: { store: SceneStore; controller: ViewportController }) {
  const state = useScene(store, value => value)
  const [viewport, setViewport] = useState(() => controller.getSnapshot())
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 })
  const host = useRef<HTMLDivElement>(null)
  const ownsGesture = useRef(false)
  const activeAnchor = useMeshActiveAnchor()
  const placementMode = useMeshPlacementMode()

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

  // Cancel placement mode on Escape
  useEffect(() => {
    if (!placementMode) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setMeshPlacementMode(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [placementMode])

  if (!enabled || paint?.kind !== 'mesh-gradient' || !paint.mesh) return null
  const mesh = paint.mesh
  const matrix = node ? getWorldMatrix(state, node.id) : null
  const { camera } = viewport

  const toScreen = (point: { x: number; y: number }) => {
    const p = meshToSurface(point, paint)
    if (!node || !matrix) return { x: p.x * surfaceSize.width, y: p.y * surfaceSize.height }
    const [a, b, c, d, e, f] = matrix
    const x = p.x * node.width, y = p.y * node.height
    return { x: (a * x + c * y + e) * camera.zoom + camera.x, y: (b * x + d * y + f) * camera.zoom + camera.y }
  }

  const screenToMeshCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const rect = host.current?.getBoundingClientRect()
    if (!rect) return null
    const point = { x: clientX - rect.left, y: clientY - rect.top }
    if (!node || !matrix) {
      return surfaceToMesh({ x: point.x / Math.max(1, rect.width), y: point.y / Math.max(1, rect.height) }, paint)
    }
    const world = controller.screenToWorld(point)
    const [a, b, c, d, e, f] = matrix
    const det = a * d - b * c
    if (Math.abs(det) < 1e-6) return null
    const x = world.x - e
    const y = world.y - f
    const surfaceX = (d * x - c * y) / det / Math.max(0.001, node.width)
    const surfaceY = (a * y - b * x) / det / Math.max(0.001, node.height)
    return surfaceToMesh({ x: surfaceX, y: surfaceY }, paint)
  }

  const addVertexAtPoint = (clientX: number, clientY: number) => {
    const currentNode = node ? store.getSnapshot().elements[node.id] : undefined
    const current = node ? currentNode?.style.shader : store.getSnapshot().backgroundShader
    if (current?.kind !== 'mesh-gradient' || !current.mesh || current.mesh.anchors.length >= 10) return
    const meshPoint = screenToMeshCoords(clientX, clientY)
    if (!meshPoint) return
    const sampledColor = interpolateMeshColor(current.mesh.anchors, current.params.colors, meshPoint)
    const newAnchor: MeshAnchor = { x: clampUnit(meshPoint.x), y: clampUnit(meshPoint.y), radius: 0.65 }
    store.beginTransaction('Add mesh anchor')
    const nextColors = [...current.params.colors, sampledColor]
    const nextAnchors = [...current.mesh.anchors, newAnchor]
    const next = freezeShader({
      ...current,
      params: { ...current.params, colors: nextColors },
      mesh: { ...current.mesh, anchors: nextAnchors },
    })
    if (currentNode) store.update(currentNode.id, currentNode.type, { style: { shader: next } })
    else store.setBackgroundShader(next)
    store.endTransaction()
    setMeshActiveAnchor(nextAnchors.length - 1)
    setMeshPlacementMode(false)
  }

  const handleColorChange = (index: number, color: string) => {
    const currentNode = node ? store.getSnapshot().elements[node.id] : undefined
    const current = node ? currentNode?.style.shader : store.getSnapshot().backgroundShader
    if (current?.kind !== 'mesh-gradient' || !current.mesh) return
    store.beginTransaction('Change mesh stop color')
    const nextColors = current.params.colors.map((c, i) => i === index ? color : c)
    const next = freezeShader({
      ...current,
      params: { ...current.params, colors: nextColors },
    })
    if (currentNode) store.update(currentNode.id, currentNode.type, { style: { shader: next } })
    else store.setBackgroundShader(next)
    store.endTransaction()
  }

  const handleRadiusChange = (index: number, radius: number) => {
    const currentNode = node ? store.getSnapshot().elements[node.id] : undefined
    const current = node ? currentNode?.style.shader : store.getSnapshot().backgroundShader
    if (current?.kind !== 'mesh-gradient' || !current.mesh) return
    const nextAnchors = current.mesh.anchors.map((a, i) => i === index ? { ...a, radius: Math.max(0.1, Math.min(2.0, radius)) } : a)
    const next = freezeShader({
      ...current,
      mesh: { ...current.mesh, anchors: nextAnchors },
    })
    if (currentNode) store.update(currentNode.id, currentNode.type, { style: { shader: next } })
    else store.setBackgroundShader(next)
  }

  const handleDelete = (index: number) => {
    const currentNode = node ? store.getSnapshot().elements[node.id] : undefined
    const current = node ? currentNode?.style.shader : store.getSnapshot().backgroundShader
    if (current?.kind !== 'mesh-gradient' || !current.mesh || current.mesh.anchors.length <= 2) return
    store.beginTransaction('Delete mesh stop')
    const nextColors = current.params.colors.filter((_, i) => i !== index)
    const nextAnchors = current.mesh.anchors.filter((_, i) => i !== index)
    const next = freezeShader({
      ...current,
      params: { ...current.params, colors: nextColors },
      mesh: { ...current.mesh, anchors: nextAnchors },
    })
    if (currentNode) store.update(currentNode.id, currentNode.type, { style: { shader: next } })
    else store.setBackgroundShader(next)
    store.endTransaction()
    setMeshActiveAnchor(Math.max(0, index - 1))
  }

  const active = Math.min(activeAnchor, mesh.anchors.length - 1)

  return (
    <div
      ref={host}
      className="mesh-canvas-overlay"
      data-testid="mesh-canvas-overlay"
      data-placement-mode={placementMode ? 'true' : undefined}
      aria-label="Canvas mesh anchors"
      onClick={e => {
        if (!placementMode) return
        if ((e.target as Element).closest('.mesh-anchor-container, .mesh-handle-popover, .mesh-anchor, .mesh-placement-banner')) return
        e.preventDefault()
        e.stopPropagation()
        addVertexAtPoint(e.clientX, e.clientY)
      }}
      onDoubleClick={e => {
        if (placementMode) return
        if ((e.target as Element).closest('.mesh-anchor-container, .mesh-handle-popover, .mesh-anchor, .mesh-placement-banner')) return
        addVertexAtPoint(e.clientX, e.clientY)
      }}
    >
      {placementMode && (
        <div className="mesh-placement-banner viewport-ui" role="status">
          <span className="mesh-placement-dot" />
          <span>Click anywhere to place mesh vertex · Double-click on canvas also adds stop</span>
          <button
            type="button"
            aria-label="Cancel vertex placement"
            onClick={() => setMeshPlacementMode(false)}
          >
            <X size={12} />
            <span>Cancel <kbd>Esc</kbd></span>
          </button>
        </div>
      )}

      {mesh.anchors.map((anchor, index) => {
        const position = toScreen(anchor)
        return (
          <MeshAnchorHandle
            key={`${node?.id ?? 'background'}-${index}`}
            index={index}
            selected={index === active}
            color={paint.params.colors[index]}
            anchor={anchor}
            style={{ left: position.x, top: position.y }}
            showCanvasControls={true}
            onSelect={idx => setMeshActiveAnchor(idx)}
            onColorChange={color => handleColorChange(index, color)}
            onRadiusChange={radius => handleRadiusChange(index, radius)}
            onDelete={mesh.anchors.length > 2 ? () => handleDelete(index) : undefined}
            project={(clientX, clientY) => {
              const rect = host.current!.getBoundingClientRect()
              const point = { x: clientX - rect.left, y: clientY - rect.top }
              if (!node || !matrix) return surfaceToMesh({ x: point.x / Math.max(1, rect.width), y: point.y / Math.max(1, rect.height) }, paint)
              const world = controller.screenToWorld(point)
              const [a, b, c, d, e, f] = matrix, det = a * d - b * c
              const x = world.x - e, y = world.y - f
              return surfaceToMesh({ x: (d * x - c * y) / det / Math.max(0.001, node.width), y: (a * y - b * x) / det / Math.max(0.001, node.height) }, paint)
            }}
            onStart={() => {
              if (store.getHistorySnapshot().active) return false
              ownsGesture.current = true
              store.beginTransaction('Move mesh anchor')
            }}
            onEnd={finish}
            onMove={point => {
              const currentNode = node ? store.getSnapshot().elements[node.id] : undefined
              const current = node ? currentNode?.style.shader : store.getSnapshot().backgroundShader
              if (current?.kind !== 'mesh-gradient' || !current.mesh || (node && (!currentNode || store.isLocked(node.id) || !store.isVisible(node.id)))) return
              const next = freezeShader({
                ...current,
                mesh: {
                  ...current.mesh,
                  anchors: current.mesh.anchors.map((value, i) => i === index ? { ...value, ...point } : value),
                },
              })
              if (currentNode) store.update(currentNode.id, currentNode.type, { style: { shader: next } })
              else store.setBackgroundShader(next)
            }}
          />
        )
      })}
    </div>
  )
}

