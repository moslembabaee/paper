import {
  computeBoolean,
  type BooleanResult,
} from './booleanGeometry.ts'
import { parsePath } from './pathGeometry.ts'
import type { BooleanOperation, PathElement, VectorElement } from './types.ts'
import {
  adaptiveSubdividePath,
  type AdaptiveSubdivisionOptions,
} from './adaptiveSubdivision.ts'
import { optimizeSvgBezierData } from './bezierOptimization.ts'

export type CSGOperation = 'union' | 'difference' | 'intersection' | 'exclusion'

export const CSG_OPERATIONS: readonly {
  operation: CSGOperation
  name: string
  hint: string
  symbol: string
}[] = [
  { operation: 'union', name: 'Union', hint: 'Merge all filled volumes (A ∪ B)', symbol: '∪' },
  { operation: 'difference', name: 'Difference', hint: 'Subtract cutting shape from base (A \\ B)', symbol: '∖' },
  { operation: 'intersection', name: 'Intersection', hint: 'Keep only overlapping volume (A ∩ B)', symbol: '∩' },
  { operation: 'exclusion', name: 'Exclusion', hint: 'Keep non-overlapping areas (A ⊕ B)', symbol: '⊕' },
]

export interface CSGOptions {
  /** If true, runs adaptive bezier subdivision on inputs to resolve tight curves */
  adaptiveSubdivision?: boolean
  subdivisionOptions?: AdaptiveSubdivisionOptions
  /** Optimization tolerance for resulting bezier curves */
  tolerance?: number
  /** Precision decimal places for SVG output */
  precision?: number
}

export function toBooleanOperation(op: CSGOperation): BooleanOperation {
  switch (op) {
    case 'union':
      return 'union'
    case 'difference':
      return 'subtract'
    case 'intersection':
      return 'intersect'
    case 'exclusion':
      return 'exclude'
  }
}

export function fromBooleanOperation(op: BooleanOperation): CSGOperation {
  switch (op) {
    case 'union':
      return 'union'
    case 'subtract':
      return 'difference'
    case 'intersect':
      return 'intersection'
    case 'exclude':
      return 'exclusion'
  }
}

/**
 * Creates a synthetic vector path element from SVG path data in parent coordinates.
 */
export function createSyntheticVectorPath(
  d: string,
  id = 'synthetic-operand',
  name = 'Operand'
): PathElement {
  const parsed = parsePath(d)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const contour of parsed) {
    for (const anchor of contour.anchors) {
      minX = Math.min(minX, anchor.x, anchor.in?.x ?? anchor.x, anchor.out?.x ?? anchor.x)
      minY = Math.min(minY, anchor.y, anchor.in?.y ?? anchor.y, anchor.out?.y ?? anchor.y)
      maxX = Math.max(maxX, anchor.x, anchor.in?.x ?? anchor.x, anchor.out?.x ?? anchor.x)
      maxY = Math.max(maxY, anchor.y, anchor.in?.y ?? anchor.y, anchor.out?.y ?? anchor.y)
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = 100; maxY = 100
  }
  const width = Math.max(0.1, maxX - minX)
  const height = Math.max(0.1, maxY - minY)

  return {
    id,
    name,
    type: 'path',
    parentId: null,
    zIndex: 0,
    visible: true,
    locked: false,
    x: minX,
    y: minY,
    width,
    height,
    rotation: 0,
    d,
    viewBox: [minX, minY, width, height],
    fillRule: 'nonzero',
    style: { fill: '#81adec', stroke: null, opacity: 1, shadow: null },
  }
}

/**
 * Evaluates live Constructive Solid Geometry between two vector elements.
 */
export function computeLayerCSG(
  base: VectorElement,
  operand: VectorElement,
  operation: CSGOperation,
  options: CSGOptions = {}
): BooleanResult {
  let baseElement = base
  let operandElement = operand

  if (options.adaptiveSubdivision && base.type === 'path') {
    const subdividedD = adaptiveSubdividePath(base.d, options.subdivisionOptions)
    baseElement = { ...base, d: subdividedD }
  }
  if (options.adaptiveSubdivision && operand.type === 'path') {
    const subdividedD = adaptiveSubdividePath(operand.d, options.subdivisionOptions)
    operandElement = { ...operand, d: subdividedD }
  }

  const boolOp = toBooleanOperation(operation)
  const result = computeBoolean([baseElement, operandElement], boolOp)

  const optimizedD = optimizeSvgBezierData(result.d, {
    tolerance: options.tolerance ?? 1e-6,
    precision: options.precision ?? 4,
  })

  return {
    ...result,
    d: optimizedD,
  }
}

/**
 * Evaluates live Constructive Solid Geometry between two raw SVG path data strings.
 */
export function computePathCSG(
  baseD: string,
  operandD: string,
  operation: CSGOperation,
  options: CSGOptions = {}
): BooleanResult {
  const baseEl = createSyntheticVectorPath(baseD, 'base-path', 'Base')
  const operandEl = createSyntheticVectorPath(operandD, 'operand-path', 'Operand')
  return computeLayerCSG(baseEl, operandEl, operation, options)
}
