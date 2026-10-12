/** All screen points are local to the viewport, in CSS pixels. */
export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Bounds extends Point, Size {}

/** Translation is in screen pixels; zoom is screen pixels per world unit. */
export interface Camera extends Point {
  zoom: number
}

/** CSS/DOMMatrix order: [a, b, c, d, e, f]. */
export type ViewportMatrix = readonly [number, number, number, number, number, number]

export interface ViewportSnapshot {
  camera: Readonly<Camera>
  size: Readonly<Size>
  matrix: ViewportMatrix
  inverseMatrix: ViewportMatrix
  visibleBounds: Bounds
}

export interface MinimapItem extends Bounds {
  id: string
  color?: string
}
