import { useEffect, useRef } from 'react'
import { unionBounds } from './math'
import type { Bounds, MinimapItem, Point } from './types'
import type { ViewportController } from './ViewportController'

interface MinimapProps {
  controller: ViewportController
  items: readonly MinimapItem[]
}

const WIDTH = 184
const HEIGHT = 116
const INSET = 12

function mapLayout(bounds: Bounds) {
  const scale = Math.min((WIDTH - INSET * 2) / Math.max(1, bounds.width), (HEIGHT - INSET * 2) / Math.max(1, bounds.height))
  return { scale, x: (WIDTH - bounds.width * scale) / 2 - bounds.x * scale, y: (HEIGHT - bounds.height * scale) / 2 - bounds.y * scale }
}

export function Minimap({ controller, items }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const layoutRef = useRef(mapLayout(unionBounds(items)))
  const dragRef = useRef<{ id: number; layout: ReturnType<typeof mapLayout> } | null>(null)

  useEffect(() => controller.subscribe(({ visibleBounds }) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    if (canvas.width !== WIDTH * ratio || canvas.height !== HEIGHT * ratio) {
      canvas.width = WIDTH * ratio
      canvas.height = HEIGHT * ratio
    }
    // Include the viewport so navigation stays useful arbitrarily far from artboards.
    const layout = dragRef.current?.layout ?? mapLayout(unionBounds([...items, visibleBounds]))
    layoutRef.current = layout
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    ctx.fillStyle = '#edebe1'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    for (const item of items) {
      ctx.fillStyle = item.color ?? '#222222'
      ctx.fillRect(item.x * layout.scale + layout.x, item.y * layout.scale + layout.y, Math.max(1, item.width * layout.scale), Math.max(1, item.height * layout.scale))
    }
    const x = visibleBounds.x * layout.scale + layout.x
    const y = visibleBounds.y * layout.scale + layout.y
    const w = visibleBounds.width * layout.scale
    const h = visibleBounds.height * layout.scale
    ctx.fillStyle = 'rgba(129,173,236,0.16)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#4c8eef'
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, w, h)
  }), [controller, items])

  function navigate(client: Point) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const layout = layoutRef.current
    controller.centerOn({
      x: ((client.x - rect.left) * WIDTH / rect.width - layout.x) / layout.scale,
      y: ((client.y - rect.top) * HEIGHT / rect.height - layout.y) / layout.scale,
    }, false)
  }

  return (
    <div className="viewport-minimap viewport-ui" data-testid="viewport-minimap">
      <div className="minimap-heading"><span>Navigator</span><span className="minimap-live" aria-hidden="true" /></div>
      <canvas
        ref={canvasRef}
        className="minimap-map"
        data-testid="minimap-canvas"
        role="button"
        tabIndex={0}
        aria-label="Canvas navigator. Click or drag to navigate; use arrow keys to pan."
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          controller.stop()
          dragRef.current = { id: event.pointerId, layout: layoutRef.current }
          navigate({ x: event.clientX, y: event.clientY })
        }}
        onPointerMove={(event) => {
          if (dragRef.current?.id === event.pointerId) navigate({ x: event.clientX, y: event.clientY })
        }}
        onPointerUp={(event) => {
          dragRef.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onLostPointerCapture={() => { dragRef.current = null }}
        onPointerCancel={() => { dragRef.current = null }}
        onKeyDown={(event) => {
          const delta = { ArrowLeft: { x: 80, y: 0 }, ArrowRight: { x: -80, y: 0 }, ArrowUp: { x: 0, y: 80 }, ArrowDown: { x: 0, y: -80 } }[event.key]
          if (delta) { event.preventDefault(); controller.panBy(delta) }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            controller.fit(unionBounds(items))
          }
        }}
      />
    </div>
  )
}
