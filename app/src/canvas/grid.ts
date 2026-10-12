import { GRID_SIZE, SUBGRID_SIZE } from './math.ts'
import type { ViewportSnapshot } from './types.ts'

/** Screen-space rasterization keeps grid strokes exactly one device pixel wide. */
export function drawGrid(canvas: HTMLCanvasElement, snapshot: ViewportSnapshot): void {
  const { camera, size } = snapshot
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const width = Math.round(size.width * ratio)
  const height = Math.round(size.height * ratio)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, size.width, size.height)
  ctx.lineWidth = 1 / ratio
  const lines = (step: number, color: string) => {
    const spacing = step * camera.zoom
    const offsetX = ((camera.x % spacing) + spacing) % spacing
    const offsetY = ((camera.y % spacing) + spacing) % spacing
    ctx.strokeStyle = color
    ctx.beginPath()
    for (let x = offsetX; x <= size.width; x += spacing) {
      const aligned = (Math.floor(x * ratio) + 0.5) / ratio
      ctx.moveTo(aligned, 0)
      ctx.lineTo(aligned, size.height)
    }
    for (let y = offsetY; y <= size.height; y += spacing) {
      const aligned = (Math.floor(y * ratio) + 0.5) / ratio
      ctx.moveTo(0, aligned)
      ctx.lineTo(size.width, aligned)
    }
    ctx.stroke()
  }
  if (SUBGRID_SIZE * camera.zoom >= 12) lines(SUBGRID_SIZE, 'rgba(8,8,8,0.035)')
  lines(GRID_SIZE, 'rgba(8,8,8,0.085)')
  // World axes remain anchored at (0, 0), even after arbitrarily long pans.
  ctx.strokeStyle = 'rgba(76,142,239,0.30)'
  ctx.beginPath()
  if (camera.x >= 0 && camera.x <= size.width) {
    ctx.moveTo(camera.x, 0)
    ctx.lineTo(camera.x, size.height)
  }
  if (camera.y >= 0 && camera.y <= size.height) {
    ctx.moveTo(0, camera.y)
    ctx.lineTo(size.width, camera.y)
  }
  ctx.stroke()
}
