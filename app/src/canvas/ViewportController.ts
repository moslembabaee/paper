import { cameraMatrix, clampZoom, fitBounds, inverseCameraMatrix, screenToWorld, visibleBounds, worldToScreen, zoomAt } from './math.ts'
import type { Bounds, Camera, Point, Size, ViewportSnapshot } from './types.ts'

type Listener = (snapshot: ViewportSnapshot) => void

/**
 * A demand-driven camera. Input mutates a target; one RAF batches all DOM writes.
 * No React state updates or perpetual idle loop. Call dispose on unmount.
 */
export class ViewportController {
  private camera: Camera
  private target: Camera
  private size: Size = { width: 0, height: 0 }
  private listeners = new Set<Listener>()
  private frame: number | null = null
  private previousTime: number | null = null
  private reducedMotion = false

  constructor(initial: Camera = { x: 0, y: 0, zoom: 1 }) {
    this.camera = this.validate(initial)
    this.target = { ...this.camera }
  }

  private validate(camera: Camera): Camera {
    return {
      x: Number.isFinite(camera.x) ? camera.x : 0,
      y: Number.isFinite(camera.y) ? camera.y : 0,
      zoom: clampZoom(camera.zoom),
    }
  }

  getSnapshot = (): ViewportSnapshot => ({
    camera: { ...this.camera },
    size: { ...this.size },
    matrix: cameraMatrix(this.camera),
    inverseMatrix: inverseCameraMatrix(this.camera),
    visibleBounds: visibleBounds(this.camera, this.size),
  })

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => { this.listeners.delete(listener) }
  }

  setReducedMotion(value: boolean): void { this.reducedMotion = value }

  resize(size: Size): void {
    // Keep the same world point in the center when panels or window sizes change.
    if (this.size.width > 0 && this.size.height > 0) {
      const dx = (size.width - this.size.width) / 2
      const dy = (size.height - this.size.height) / 2
      this.camera.x += dx
      this.camera.y += dy
      this.target.x += dx
      this.target.y += dy
    }
    this.size = { ...size }
    this.schedule()
  }

  setCamera(camera: Camera, animate = true): void {
    this.target = this.validate(camera)
    if (!animate || this.reducedMotion) this.camera = { ...this.target }
    this.schedule()
  }

  panBy(delta: Point, animate = false): void {
    this.setCamera({ ...this.target, x: this.target.x + delta.x, y: this.target.y + delta.y }, animate)
  }

  zoomTo(zoom: number, anchor: Point = this.center(), animate = true): void {
    this.setCamera(zoomAt(this.target, zoom, anchor), animate)
  }

  zoomBy(factor: number, anchor: Point = this.center()): void {
    this.zoomTo(this.target.zoom * factor, anchor)
  }

  centerOn(point: Point, animate = true): void {
    this.setCamera({ x: this.size.width / 2 - point.x * this.target.zoom, y: this.size.height / 2 - point.y * this.target.zoom, zoom: this.target.zoom }, animate)
  }

  fit(bounds: Bounds, padding = 80, animate = true): void {
    this.setCamera(fitBounds(bounds, this.size, padding), animate)
  }

  /** Stop interpolation before a direct gesture to prevent a camera jump. */
  stop(): void { this.target = { ...this.camera } }

  worldToScreen(point: Point): Point { return worldToScreen(point, this.camera) }
  screenToWorld(point: Point): Point { return screenToWorld(point, this.camera) }
  private center(): Point { return { x: this.size.width / 2, y: this.size.height / 2 } }

  private schedule(): void {
    if (this.frame === null) this.frame = requestAnimationFrame(this.tick)
  }

  private tick = (time: number): void => {
    this.frame = null
    const dt = this.previousTime === null ? 1000 / 60 : Math.min(64, time - this.previousTime)
    this.previousTime = time
    const alpha = this.reducedMotion ? 1 : 1 - Math.exp(-dt / 55)
    this.camera = {
      x: this.camera.x + (this.target.x - this.camera.x) * alpha,
      y: this.camera.y + (this.target.y - this.camera.y) * alpha,
      zoom: this.camera.zoom + (this.target.zoom - this.camera.zoom) * alpha,
    }
    const settled = Math.abs(this.camera.x - this.target.x) < 0.01
      && Math.abs(this.camera.y - this.target.y) < 0.01
      && Math.abs(this.camera.zoom - this.target.zoom) < 0.00001
    if (settled) this.camera = { ...this.target }
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
    if (!settled) this.schedule()
    else this.previousTime = null
  }

  dispose(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.previousTime = null
    this.listeners.clear()
  }
}
