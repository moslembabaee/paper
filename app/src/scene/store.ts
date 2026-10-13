import { EMPTY_LIBRARY, detachEditedSharedStyles, resolveSharedStyles, resolveTokens, validateLibrary } from '../tokens/library.ts'
import { detachEditedBindings, detachRemovedTokenBindings, resolveTokenBindings, supportsTokenProperty, tokenVariable, validateTokens } from '../tokens/model.ts'
import type { DesignToken, SharedStyle, SharedStyleInput, SharedStyleKind, StyleLibrary, TokenInput, TokenProperty } from '../tokens/types.ts'
import { createElement, freezeElement, validateElement } from './elements.ts'
import { freezeShader, validateShader } from '../shaders/catalog.ts'
import { CommandHistory, equalValue } from './history.ts'
import type { ShaderPaint } from '../shaders/types.ts'
import type { BooleanCompound, BooleanOperation, ElementInput, ElementOf, ElementPatch, ElementType, PathElement, SceneDocument, SceneElement, SceneSnapshot, VectorElement } from './types.ts'
import { computeBoolean, isVector, refreshBooleanElement, transformedSource } from './booleanGeometry.ts'
import { serializePath } from './pathGeometry.ts'
import { FIXED_SIZING, invalidateLayoutTextMetrics, reflowAutoLayout } from './autoLayout.ts'
import { componentRoot, recordComponentEdit, recordComponentTokenEdit, subtree, synchronizeComponents, validateComponentGraph } from './components.ts'

type Listener = () => void
const EMPTY = Object.freeze([]) as readonly string[]

/** Framework-independent immutable scene graph. Sibling arrays are the paint order. */
export class SceneStore {
  private state: SceneSnapshot = Object.freeze({ version: 1, tokens: Object.freeze([]), styleLibrary: EMPTY_LIBRARY, backgroundShader: null, elements: Object.freeze({}), rootIds: EMPTY, selection: EMPTY })
  private listeners = new Set<Listener>()
  private batchDepth = 0
  private pending = false
  private history = new CommandHistory()
  private transaction: { before: SceneSnapshot; label: string } | null = null

  getHistorySnapshot = () => this.history.getSnapshot()

  /** A gesture may publish live frames while keeping only one history command. */
  beginTransaction(label: string): void {
    if (this.transaction || this.batchDepth) throw new Error('A history transaction is already active')
    this.transaction = { before: this.state, label }
    this.history.setActive(true)
    this.emit()
  }

  endTransaction(): void {
    if (!this.transaction) return
    const { before, label } = this.transaction
    this.transaction = null
    this.history.record(before, this.state, label)
    this.history.setActive(false)
    this.emit()
  }

  cancelTransaction(): void {
    if (!this.transaction) return
    this.state = this.transaction.before
    this.transaction = null
    this.history.setActive(false)
    this.emit()
  }

  undo = (): void => {
    if (this.batchDepth || this.transaction) return
    const previous = this.history.undo()
    if (previous) { this.state = previous; this.emit() }
  }

  redo = (): void => {
    if (this.batchDepth || this.transaction) return
    const next = this.history.redo()
    if (next) { this.state = next; this.emit() }
  }

  /** Establish a fresh baseline when seeding or opening a different project. */
  clearHistory(): void {
    if (this.batchDepth || this.transaction) throw new Error('Finish the active edit before clearing history')
    this.history.clear()
    this.emit()
  }

  getSnapshot = (): SceneSnapshot => this.state
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** One history command and notification for many edits. Nested batches are supported. */
  batch<T>(work: () => T, label = 'Edit elements'): T {
    const before = this.state
    this.batchDepth++
    try { return work() } finally {
      this.batchDepth--
      if (!this.batchDepth && this.pending) {
        if (!this.transaction) this.history.record(before, this.state, label)
        this.pending = false
        this.emit()
      }
    }
  }

  private emit() { for (const listener of [...this.listeners]) listener() }
  private publish(next: SceneSnapshot, label: string, documentChanged = true) {
    const before = this.state
    if (documentChanged) {
      let elements = reflowAutoLayout(next.elements, next.rootIds)
      elements = synchronizeComponents(elements, resolveTokens(next.tokens, next.styleLibrary.activeThemeId), before.elements, next.styleLibrary)
      elements = reflowAutoLayout(elements, next.rootIds)
      if (elements !== next.elements) next = Object.freeze({ ...next, elements: Object.freeze(elements) })
      const selection = next.selection.filter(id => {
        let node: SceneElement | undefined = Object.hasOwn(elements, id) ? elements[id] : undefined
        if (!node) return false
        while (node) { if (!node.visible || node.locked) return false; node = node.parentId === null ? undefined : elements[node.parentId] }
        return true
      })
      if (selection.length !== next.selection.length) next = Object.freeze({ ...next, selection: Object.freeze(selection) })
    }
    this.state = next
    if (!this.batchDepth && !this.transaction && documentChanged) this.history.record(before, next, label)
    if (this.batchDepth) this.pending = true
    else this.emit()
  }

  private commit(elements: Readonly<Record<string, SceneElement>>, rootIds = this.state.rootIds, selection = this.state.selection, label = 'Edit elements', documentChanged = true) {
    this.publish(Object.freeze({ ...this.state, elements: Object.freeze(elements), rootIds: rootIds === this.state.rootIds ? rootIds : Object.freeze([...rootIds]), selection: selection === this.state.selection ? selection : Object.freeze([...selection]) }), label, documentChanged)
  }

  private require(id: string): SceneElement {
    const node = Object.hasOwn(this.state.elements, id) ? this.state.elements[id] : undefined
    if (!node) throw new Error(`Unknown element: ${id}`)
    return node
  }

  private requireFrame(id: string | null) {
    if (id === null) return
    if (this.require(id).type !== 'frame') throw new Error('Only frames can contain elements')
  }

  /** Instance structure belongs to its master; detach before changing it locally. */
  private requireEditableStructure(id: string | null, rootAllowed = false): void {
    if (id === null) return
    const node = this.require(id)
    if (node.component?.kind === 'instance' && (!rootAllowed || node.component.instanceId !== id)) throw new Error('Detach the instance before editing its structure')
  }

  getChildren = (parentId: string | null): readonly string[] => {
    if (parentId === null) return this.state.rootIds
    const node = this.state.elements[parentId]
    return node?.type === 'frame' ? node.children : EMPTY
  }

  /** Resolve inherited visibility/locking without flattening the hierarchy. */
  isVisible = (id: string): boolean => {
    let node: SceneElement | undefined = Object.hasOwn(this.state.elements, id) ? this.state.elements[id] : undefined
    if (!node) return false
    while (node) {
      if (!node.visible) return false
      node = node.parentId === null ? undefined : this.state.elements[node.parentId]
    }
    return true
  }

  isLocked = (id: string): boolean => {
    let node: SceneElement | undefined = Object.hasOwn(this.state.elements, id) ? this.state.elements[id] : undefined
    if (!node) return true
    while (node) {
      if (node.locked) return true
      node = node.parentId === null ? undefined : this.state.elements[node.parentId]
    }
    return false
  }

  private ordered(elements: Record<string, SceneElement>, parentId: string | null, ids: readonly string[]) {
    ids.forEach((id, index) => {
      const node = elements[id]
      if (node.zIndex !== index || node.parentId !== parentId) elements[id] = freezeElement({ ...node, parentId, zIndex: index })
    })
    if (parentId !== null) {
      const frame = elements[parentId]
      if (frame.type === 'frame') elements[parentId] = freezeElement({ ...frame, children: ids })
    }
  }

  add<T extends ElementType>(type: T, input: ElementInput<T> = {}, index?: number): ElementOf<T> {
    const node = freezeElement(this.resolveStyles(createElement(type, input)))
    validateElement(node)
    if (Object.hasOwn(this.state.elements, node.id)) throw new Error(`Duplicate element: ${node.id}`)
    if (['__proto__', 'prototype', 'constructor'].includes(node.id)) throw new Error('Reserved element ID')
    this.requireFrame(node.parentId)
    this.requireEditableStructure(node.parentId)
    if (node.parentId !== null && this.isLocked(node.parentId)) throw new Error('Parent frame is locked')
    const siblings = [...this.getChildren(node.parentId)]
    siblings.splice(this.index(index ?? siblings.length, siblings.length), 0, node.id)
    const elements = { ...this.state.elements, [node.id]: node }
    this.ordered(elements, node.parentId, siblings)
    this.commit(elements, node.parentId === null ? siblings : this.state.rootIds, this.state.selection, `Add ${node.name}`)
    return this.state.elements[node.id] as ElementOf<T>
  }

  /** Structural fields can only change through add/reparent/reorder/remove. */
  update<T extends ElementType>(id: string, type: T, patch: ElementPatch<T>): void {
    const node = this.require(id)
    if (node.type !== type) throw new Error('Element type mismatch')
    if (this.isLocked(id)) throw new Error('Element is locked')
    for (const key of ['component', 'id', 'type', 'children', 'parentId', 'zIndex', 'tokenBindings', 'sharedStyleBindings', 'boolean']) {
      if (Object.hasOwn(patch, key)) throw new Error(`Use structural actions to change ${key}`)
    }
    if (node.type === 'path' && node.boolean && ['d', 'viewBox', 'fillRule', 'nodes'].some(key => Object.hasOwn(patch, key))) throw new Error('Flatten the compound before editing its merged outline')
    const tokenBindings = detachEditedBindings(node.tokenBindings, patch as Record<string, unknown>, node)
    const updated = { ...node, ...patch, ...(node.sharedStyleBindings ? { sharedStyleBindings: detachEditedSharedStyles(node.sharedStyleBindings, patch as Record<string, unknown>) } : {}), ...(tokenBindings ? { tokenBindings } : {}), style: { ...node.style, ...patch.style } } as SceneElement
    // A direct resize is an explicit fixed-size edit; layout settings remain
    // authoritative when the caller supplies sizing in the same patch.
    if (!Object.hasOwn(patch, 'sizing') && node.sizing && (Object.hasOwn(patch, 'width') || Object.hasOwn(patch, 'height'))) {
      Object.assign(updated, { sizing: { ...node.sizing, ...(Object.hasOwn(patch, 'width') ? { width: 'fixed' } : {}), ...(Object.hasOwn(patch, 'height') ? { height: 'fixed' } : {}) } })
    }
    if (updated.type === 'path') {
      if (Object.hasOwn(patch, 'nodes') && updated.nodes) Object.assign(updated, { d: serializePath(updated.nodes) })
      else if (Object.hasOwn(patch, 'd')) delete (updated as { nodes?: unknown }).nodes
    }
    Object.assign(updated, this.resolveStyles(updated))
    validateElement(updated)
    if (Object.hasOwn(patch, 'sizing') && updated.sizing && tokenBindings) {
      for (const axis of ['width', 'height'] as const) if (updated.sizing[axis] !== 'fixed') delete tokenBindings[axis]
    }
    if (equalValue(node, updated)) return
    const label = patch.style ? 'Style' : ['x', 'y', 'width', 'height', 'rotation'].some(key => Object.hasOwn(patch, key)) ? 'Transform' : 'Edit'
    this.commit({ ...this.state.elements, [id]: freezeElement(recordComponentEdit(node, updated, patch)) }, this.state.rootIds, this.state.selection, `${label} ${node.name}`)
  }

  /** Flags are editable even for a locked layer, so it can always be unlocked. */
  setLocked(id: string, locked: boolean): void { this.setFlag(id, 'locked', locked) }
  setVisible(id: string, visible: boolean): void { this.setFlag(id, 'visible', visible) }
  private setFlag(id: string, key: 'locked' | 'visible', value: boolean) {
    const node = this.require(id)
    if (node[key] === value) return
    const action = key === 'locked' ? value ? 'Lock' : 'Unlock' : value ? 'Show' : 'Hide'
    const updated = recordComponentEdit(node, { ...node, [key]: value }, { [key]: value })
    const elements = { ...this.state.elements, [id]: freezeElement(updated) }
    this.batch(() => {
      this.commit(elements)
      this.select(this.state.selection)
    }, `${action} ${node.name}`)
  }

  select = (ids: readonly string[]): void => {
    const selection = [...new Set(ids)].filter(id => this.isVisible(id) && !this.isLocked(id))
    if (selection.length === this.state.selection.length && selection.every((id, i) => id === this.state.selection[i])) return
    this.commit(this.state.elements, this.state.rootIds, selection, 'Select elements', false)
  }

  private index(value: number, max: number): number {
    if (!Number.isFinite(value)) throw new Error('Invalid sibling index')
    return Math.max(0, Math.min(max, Math.trunc(value)))
  }

  /** Reparenting retains local coordinates. Call update to place the node afterward. */
  reparent(id: string, parentId: string | null, index?: number): void {
    const node = this.require(id)
    this.requireFrame(parentId)
    this.requireEditableStructure(id, true)
    this.requireEditableStructure(parentId)
    if (parentId !== null && componentRoot(this.state.elements, parentId) && subtree(this.state.elements, id).some(child => child.component)) throw new Error('Nested components are not supported')
    if (this.isLocked(id) || (parentId !== null && this.isLocked(parentId))) throw new Error('Element or destination is locked')
    let ancestor = parentId
    while (ancestor !== null) {
      if (ancestor === id) throw new Error('A frame cannot contain itself or its ancestor')
      ancestor = this.require(ancestor).parentId
    }
    if (node.parentId === parentId) { this.reorder(id, index ?? this.getChildren(parentId).length - 1); return }
    const oldIds = this.getChildren(node.parentId).filter(child => child !== id)
    const newIds = [...this.getChildren(parentId)]
    newIds.splice(this.index(index ?? newIds.length, newIds.length), 0, id)
    const elements = { ...this.state.elements }
    this.ordered(elements, node.parentId, oldIds)
    this.ordered(elements, parentId, newIds)
    this.batch(() => {
      this.commit(elements, parentId === null ? newIds : node.parentId === null ? oldIds : this.state.rootIds)
      this.select(this.state.selection)
    }, `Reparent ${node.name}`)
  }

  reorder(id: string, index: number): void {
    const node = this.require(id)
    this.requireEditableStructure(id, true)
    if (this.isLocked(id)) throw new Error('Element is locked')
    const ids = this.getChildren(node.parentId).filter(child => child !== id)
    ids.splice(this.index(index, ids.length), 0, id)
    if (ids.every((child, i) => child === this.getChildren(node.parentId)[i])) return
    const elements = { ...this.state.elements }
    this.ordered(elements, node.parentId, ids)
    this.commit(elements, node.parentId === null ? ids : this.state.rootIds, this.state.selection, `Reorder ${node.name}`)
  }

  remove(id: string): void {
    const node = this.require(id)
    this.requireEditableStructure(id, true)
    if (this.isLocked(id)) throw new Error('Element is locked')
    const elements = { ...this.state.elements }
    const removeTree = (childId: string) => {
      const child = elements[childId]
      if (child.type === 'frame') child.children.forEach(removeTree)
      delete elements[childId]
    }
    removeTree(id)
    const siblings = this.getChildren(node.parentId).filter(child => child !== id)
    this.ordered(elements, node.parentId, siblings)
    this.commit(elements, node.parentId === null ? siblings : this.state.rootIds, this.state.selection.filter(selected => Object.hasOwn(elements, selected)), `Delete ${node.name}`)
  }

  componentCreationReason(id: string): string | null {
    if (this.history.getSnapshot().active) return 'Finish the active edit first.'
    const node = this.state.elements[id]
    if (!node) return 'Select a layer or frame to create a component.'
    if (this.isLocked(id)) return 'Unlock the layer first.'
    if (componentRoot(this.state.elements, id) || subtree(this.state.elements, id).some(child => child.component)) return 'Choose a layer outside an existing component.'
    return null
  }

  /** Any layer, including a frame with a complete subtree, can become a master. */
  createComponent(id: string): SceneElement {
    const reason = this.componentCreationReason(id)
    if (reason) throw new Error(reason)
    const node = freezeElement({ ...this.require(id), component: { kind: 'master' } })
    this.commit({ ...this.state.elements, [id]: node }, this.state.rootIds, [id], `Create ${node.name} component`)
    return node
  }

  createComponentInstance(masterId: string, placement: { x?: number; y?: number; parentId?: string | null } = {}): SceneElement {
    const master = this.require(masterId)
    if (master.component?.kind !== 'master') throw new Error('Choose a master component')
    if (this.history.getSnapshot().active) throw new Error('Finish the active edit first')
    const parentId = placement.parentId === undefined ? master.parentId : placement.parentId
    this.requireFrame(parentId)
    this.requireEditableStructure(parentId)
    if (parentId && (componentRoot(this.state.elements, parentId) || this.isLocked(parentId))) throw new Error('Choose an unlocked destination outside a component')
    const y = placement.y ?? master.y
    let x = placement.x ?? master.x + Math.ceil(master.width / 120) * 120 + 120
    if (placement.x === undefined) {
      const neighbors = this.getChildren(parentId).map(id => this.state.elements[id]).filter(node => node.visible).sort((a, b) => a.x - b.x)
      for (const neighbor of neighbors) {
        if (x < neighbor.x + neighbor.width && x + master.width > neighbor.x && y < neighbor.y + neighbor.height && y + master.height > neighbor.y) x = master.x + Math.ceil((neighbor.x + neighbor.width - master.x) / 120) * 120 + 120
      }
    }
    const id = crypto.randomUUID()
    const node = freezeElement({ ...master, id, parentId, x, y,
      component: { kind: 'instance', masterId, sourceId: masterId, instanceId: id, overrides: {} }, ...(master.type === 'frame' ? { children: [] } : {}),
    })
    validateElement(node)
    const elements = { ...this.state.elements, [id]: node }, siblings = [...this.getChildren(parentId), id]
    this.ordered(elements, parentId, siblings)
    this.commit(elements, parentId === null ? siblings : this.state.rootIds, [id], `Insert ${master.name} instance`)
    return this.state.elements[id]
  }

  /** A descendant action always detaches the complete instance without changing its appearance. */
  detachComponentInstance(id: string): void {
    const root = componentRoot(this.state.elements, id)
    if (root?.component?.kind !== 'instance') throw new Error('Choose a component instance')
    if (this.isLocked(root.id) || this.history.getSnapshot().active) throw new Error('Unlock the instance and finish the active edit first')
    const elements = { ...this.state.elements }
    for (const node of subtree(elements, root.id)) {
      const { component, ...detached } = node
      void component
      elements[node.id] = freezeElement(detached)
    }
    this.commit(elements, this.state.rootIds, this.state.selection, `Detach ${root.name} instance`)
  }

  /** Root reset includes all descendants. A child reset restores just that layer. */
  resetComponentOverrides(id: string): void {
    const node = this.require(id)
    if (node.component?.kind !== 'instance') throw new Error('Choose an instance layer')
    if (this.isLocked(id) || this.history.getSnapshot().active) throw new Error('Unlock the layer and finish the active edit first')
    const elements = { ...this.state.elements }
    const nodes = node.component.instanceId === id ? subtree(elements, id) : [node]
    for (const child of nodes) if (child.component?.kind === 'instance') elements[child.id] = freezeElement({ ...child, component: { ...child.component, overrides: {} } })
    this.commit(elements, this.state.rootIds, this.state.selection, `Reset ${node.name} overrides`)
  }

  /** The same checks serve the toolbar and programmatic callers. */
  booleanSelectionReason(ids = this.state.selection): string | null {
    if (this.history.getSnapshot().active) return 'Finish the active edit first.'
    if (new Set(ids).size < 2) return 'Select at least two vector shapes.'
    const nodes = [...new Set(ids)].map(id => this.state.elements[id])
    if (nodes.some(node => node?.component || (node && componentRoot(this.state.elements, node.id)?.component?.kind === 'instance'))) return 'Detach the component before combining its layers.'
    if (nodes.some(node => !node || !isVector(node))) return 'Select rectangles, ellipses, or vector paths.'
    if (nodes.some(node => this.isLocked(node.id) || !this.isVisible(node.id))) return 'Choose visible, unlocked shapes.'
    if (nodes.some(node => node.parentId !== nodes[0].parentId)) return 'Choose shapes in the same frame.'
    return null
  }

  /** Compute before publishing so errors leave the entire selection untouched. */
  booleanSelection(operation: BooleanOperation, destructive = false, ids = this.state.selection): PathElement {
    const reason = this.booleanSelectionReason(ids)
    if (reason) throw new Error(reason)
    const operands = [...new Set(ids)].map(id => this.require(id) as VectorElement).sort((a, b) => a.zIndex - b.zIndex)
    const result = computeBoolean(operands, operation), base = operands[0]
    const node = createElement('path', {
      name: `${operation[0].toUpperCase() + operation.slice(1)}${destructive ? ' path' : ' compound'}`,
      parentId: base.parentId, ...result.bounds, d: result.d, viewBox: result.viewBox, fillRule: result.fillRule, style: base.style,
      ...(base.tokenBindings ? { tokenBindings: {
        ...(base.tokenBindings.fill ? { fill: base.tokenBindings.fill } : {}),
        ...(base.tokenBindings.stroke ? { stroke: base.tokenBindings.stroke } : {}),
      } } : {}),
      ...(destructive ? {} : { boolean: { operation, operands } }),
    })
    const selected = new Set(operands.map(n => n.id)), elements = { ...this.state.elements }
    for (const operand of operands) delete elements[operand.id]
    elements[node.id] = node
    const siblings = this.getChildren(base.parentId)
    // Replace at the top selected layer, retaining the order of unselected layers.
    const topIndex = operands.at(-1)!.zIndex
    const next = siblings.filter(id => !selected.has(id))
    next.splice(siblings.slice(0, topIndex).filter(id => !selected.has(id)).length, 0, node.id)
    this.ordered(elements, node.parentId, next)
    this.commit(elements, node.parentId === null ? next : this.state.rootIds, [node.id], `${operation[0].toUpperCase() + operation.slice(1)} shapes${destructive ? ' and flatten' : ''}`)
    return elements[node.id] as PathElement
  }

  private requireCompound(id: string): PathElement & { boolean: BooleanCompound } {
    const node = this.require(id)
    if (this.history.getSnapshot().active) throw new Error('Finish the active edit first')
    if (node.type !== 'path' || !node.boolean) throw new Error('Select a boolean compound')
    if (node.component?.kind === 'instance') throw new Error('Detach the instance before editing its boolean sources')
    if (this.isLocked(id)) throw new Error('Element is locked')
    return node as PathElement & { boolean: BooleanCompound }
  }

  private refreshCompound(node: PathElement, compound: BooleanCompound, label: string): void {
    const updated = refreshBooleanElement(node, compound)
    validateElement(updated)
    this.commit({ ...this.state.elements, [node.id]: freezeElement(updated) }, this.state.rootIds, this.state.selection, label)
  }

  setBooleanOperation(id: string, operation: BooleanOperation): void {
    const node = this.requireCompound(id)
    if (node.boolean.operation === operation) return
    this.refreshCompound(node, { ...node.boolean, operation }, `Change boolean to ${operation}`)
  }

  updateBooleanOperand(id: string, operandId: string, patch: ElementPatch<'rectangle' | 'ellipse' | 'path'>): void {
    const node = this.requireCompound(id), operand = node.boolean.operands.find(source => source.id === operandId)
    if (!operand) throw new Error('Unknown boolean source')
    for (const key of ['component', 'id', 'type', 'children', 'parentId', 'zIndex', 'boolean', 'tokenBindings', 'sharedStyleBindings', 'visible', 'locked']) if (Object.hasOwn(patch, key)) throw new Error(`Cannot change source ${key}`)
    if (operand.type === 'path' && operand.boolean && ['d', 'viewBox', 'fillRule', 'nodes'].some(key => Object.hasOwn(patch, key))) throw new Error('Release the compound to edit a nested operation')
    const updated = { ...operand, ...patch, ...(operand.tokenBindings ? { tokenBindings: detachEditedBindings(operand.tokenBindings, patch as Record<string, unknown>, operand) } : {}), style: { ...operand.style, ...patch.style } } as VectorElement
    if (updated.type === 'path') {
      if (Object.hasOwn(patch, 'nodes') && updated.nodes) Object.assign(updated, { d: serializePath(updated.nodes) })
      else if (Object.hasOwn(patch, 'd')) delete (updated as { nodes?: unknown }).nodes
    }
    validateElement(updated)
    if (equalValue(operand, updated)) return
    this.refreshCompound(node, { ...node.boolean, operands: node.boolean.operands.map(source => source.id === operandId ? updated : source) }, `Edit ${operand.name} source`)
  }

  flattenBoolean(id: string): void {
    const node = this.requireCompound(id)
    const { boolean: sources, ...path } = node
    void sources
    this.commit({ ...this.state.elements, [id]: freezeElement(path) }, this.state.rootIds, this.state.selection, 'Flatten boolean compound')
  }

  /** Release sources at the compound's current position, scale and rotation. */
  releaseBoolean(id: string): readonly string[] {
    const node = this.requireCompound(id), [vx, vy, vw, vh] = node.viewBox
    const sx = node.width / vw, sy = node.height / vh, angle = node.rotation * Math.PI / 180
    const cos = Math.cos(angle), sin = Math.sin(angle)
    const elements = { ...this.state.elements }, released: string[] = []
    for (const operand of node.boolean.operands) {
      const sourceId = Object.hasOwn(elements, operand.id) ? crypto.randomUUID() : operand.id
      let restored: VectorElement
      if (Math.abs(sx - 1) < 1e-10 && Math.abs(sy - 1) < 1e-10 && node.rotation === 0) restored = { ...operand, id: sourceId, parentId: node.parentId, x: operand.x + node.x - vx, y: operand.y + node.y - vy }
      else if (Math.abs(sx - sy) < 1e-10 || operand.rotation % 180 === 0) {
        const dx = (operand.x + operand.width / 2 - vx) * sx - node.width / 2, dy = (operand.y + operand.height / 2 - vy) * sy - node.height / 2
        const width = operand.width * sx, height = operand.height * sy
        restored = { ...operand, id: sourceId, parentId: node.parentId, x: node.x + node.width / 2 + cos * dx - sin * dy - width / 2, y: node.y + node.height / 2 + sin * dx + cos * dy - height / 2, width, height, rotation: operand.rotation + node.rotation,
          ...('cornerRadius' in operand ? { cornerRadius: operand.cornerRadius * Math.min(sx, sy) } : {}),
        }
        // Unequal scaling of rounded rectangles needs elliptical corner geometry.
        if (operand.type === 'rectangle' && operand.cornerRadius > 0 && Math.abs(sx - sy) > 1e-10) {
          const shape = transformedSource(operand, node)
          restored = createElement('path', { id: sourceId, name: operand.name, visible: operand.visible, locked: operand.locked, style: operand.style, parentId: node.parentId, ...shape.bounds, d: shape.d, viewBox: shape.viewBox, fillRule: 'nonzero' })
        }
      } else {
        const shape = transformedSource(operand, node)
        restored = createElement('path', { id: sourceId, name: operand.name, parentId: node.parentId, ...shape.bounds, d: shape.d, viewBox: shape.viewBox, fillRule: operand.type === 'path' ? operand.fillRule : 'nonzero', style: operand.style })
      }
      // Primitive strokes are in element pixels; paths scale their strokes
      // through the viewBox instead. Keep the fill boundary aligned on release.
      if (operand.type !== 'path' && restored.type !== 'path' && operand.style.stroke && Math.abs(sx - sy) < 1e-10 && Math.abs(sx - 1) > 1e-10) {
        restored = { ...restored, style: { ...restored.style, stroke: {
          ...operand.style.stroke, width: operand.style.stroke.width * sx, dash: operand.style.stroke.dash.map(value => value * sx),
        } } }
      }
      if (operand.tokenBindings) {
        const tokenBindings = { ...operand.tokenBindings }
        for (const property of Object.keys(tokenBindings) as TokenProperty[]) {
          if (!supportsTokenProperty(restored, property) || (property !== 'fill' && property !== 'stroke' && restored[property as keyof VectorElement] !== operand[property as keyof VectorElement])) delete tokenBindings[property]
        }
        restored = { ...restored, tokenBindings }
      }
      if (operand.sharedStyleBindings) restored = { ...restored, sharedStyleBindings: operand.sharedStyleBindings }
      validateElement(restored)
      elements[sourceId] = freezeElement(restored); released.push(sourceId)
    }
    delete elements[id]
    const siblings = [...this.getChildren(node.parentId)]
    siblings.splice(node.zIndex, 1, ...released)
    this.ordered(elements, node.parentId, siblings)
    this.commit(elements, node.parentId === null ? siblings : this.state.rootIds, released, 'Release boolean compound')
    return released
  }

  addToken(input: TokenInput): DesignToken {
    return this.addTokens([input])[0]
  }

  /** Clipboard and integrations can insert a whole theme atomically. */
  addTokens(inputs: readonly TokenInput[]): readonly DesignToken[] {
    if (!inputs.length) return []
    const tokens = inputs.map(input => ({ ...input, id: input.id ?? crypto.randomUUID() }) as DesignToken)
    this.setTokens([...this.state.tokens, ...tokens], tokens.length === 1 ? `Add ${tokens[0].name} token` : 'Paste tokens')
    return this.state.tokens.slice(-tokens.length)
  }

  updateToken(id: string, patch: { name?: string; value?: string | number; aliasId?: string; themeValues?: Readonly<Record<string, string | number>>; palette?: string }): void {
    const token = this.state.tokens.find(candidate => candidate.id === id)
    if (!token) throw new Error('Unknown token')
    const next = { ...token, ...patch } as DesignToken
    if (equalValue(token, next)) return
    this.setTokens(this.state.tokens.map(candidate => candidate.id === id ? next : candidate), `Edit ${token.name} token`)
  }

  duplicateToken(id: string): DesignToken {
    const token = this.state.tokens.find(candidate => candidate.id === id)
    if (!token) throw new Error('Unknown token')
    let name = `${token.name}-copy`, index = 2
    while (this.state.tokens.some(candidate => tokenVariable(candidate) === tokenVariable({ ...token, name }))) name = `${token.name}-copy-${index++}`
    return this.addToken({ ...token, id: crypto.randomUUID(), name })
  }

  removeTokens(ids: readonly string[]): void {
    const removed = new Set(ids)
    if (!this.state.tokens.some(token => removed.has(token.id))) return
    const elements = { ...this.state.elements }
    for (const node of Object.values(elements)) {
      // Values were already resolved; removing a token detaches, retaining its appearance.
      let next = detachRemovedTokenBindings(node, removed)
      if (next.component?.kind === 'instance' && next.component.overrides.tokenBindings) {
        for (const [property, tokenId] of Object.entries(next.component.overrides.tokenBindings)) {
          if (tokenId !== null && removed.has(tokenId)) next = recordComponentTokenEdit(next, next, property as TokenProperty, null)
        }
      }
      if (next !== node) elements[node.id] = freezeElement(next)
    }
    const resolved = resolveTokens(this.state.tokens, this.state.styleLibrary.activeThemeId)
    const lookup = new Map(resolved.map(token => [token.id, token]))
    const tokens = validateTokens(this.state.tokens.filter(token => !removed.has(token.id)).map(token => {
      if (!token.aliasId || !removed.has(token.aliasId)) return token
      const { aliasId, ...literal } = token; void aliasId
      const themeValues = Object.fromEntries(this.state.styleLibrary.themes.map(theme => [theme.id, resolveTokens(this.state.tokens, theme.id).find(value => value.id === token.id)!.value]))
      return { ...literal, value: resolveTokens(this.state.tokens).find(value => value.id === token.id)!.value, themeValues } as DesignToken
    }))
    const styles = this.state.styleLibrary.styles.map(style => {
      if (style.kind === 'color' && style.tokenId && removed.has(style.tokenId)) {
        const { tokenId, ...literal } = style
        return { ...literal, value: lookup.get(tokenId)!.value as string }
      }
      if (style.kind === 'typography') {
        const value = { ...style.value, tokenBindings: { ...style.value.tokenBindings } }
        for (const [key, id] of Object.entries(value.tokenBindings)) if (removed.has(id)) {
          Object.assign(value, { [key]: lookup.get(id)!.value }); delete value.tokenBindings[key as TokenProperty]
        }
        return { ...style, value }
      }
      if (style.kind === 'effects') return { ...style, value: style.value.map(effect => {
        if (effect.type === 'layer-blur' || !effect.colorTokenId || !removed.has(effect.colorTokenId)) return effect
        const { colorTokenId, ...literal } = effect
        return { ...literal, color: lookup.get(colorTokenId)!.value as string }
      }) }
      return style
    })
    const styleLibrary = validateLibrary({ ...this.state.styleLibrary, styles }, tokens)
    this.publish(Object.freeze({ ...this.state, tokens, styleLibrary, elements: Object.freeze(elements) }), 'Delete tokens')
  }

  bindToken(id: string, property: TokenProperty, tokenId: string): void {
    const node = this.require(id)
    if (this.isLocked(id)) throw new Error('Element is locked')
    if (!supportsTokenProperty(node, property)) throw new Error('Unsupported token property')
    if (node.tokenBindings?.[property] === tokenId) return
    const next = this.resolveStyles({ ...node, ...(node.sharedStyleBindings ? { sharedStyleBindings: detachEditedSharedStyles(node.sharedStyleBindings, property === 'fill' ? { style: { fill: true } } : { [property]: true }) } : {}), ...(property === 'width' || property === 'height' ? { sizing: { ...(node.sizing ?? FIXED_SIZING), [property]: 'fixed' } } : {}), tokenBindings: { ...node.tokenBindings, [property]: tokenId } })
    validateElement(next)
    const updated = recordComponentTokenEdit(node, next, property, tokenId)
    this.commit({ ...this.state.elements, [id]: freezeElement(updated) }, this.state.rootIds, this.state.selection, `Bind ${property} token`)
  }

  detachToken(id: string, property: TokenProperty): void {
    const node = this.require(id)
    if (this.isLocked(id)) throw new Error('Element is locked')
    if (!node.tokenBindings?.[property]) return
    const tokenBindings = { ...node.tokenBindings }
    delete tokenBindings[property]
    const updated = recordComponentTokenEdit(node, { ...node, tokenBindings }, property, null)
    this.commit({ ...this.state.elements, [id]: freezeElement(updated) }, this.state.rootIds, this.state.selection, `Detach ${property} token`)
  }

  private resolveStyles(node: SceneElement, tokens = resolveTokens(this.state.tokens, this.state.styleLibrary.activeThemeId), library = this.state.styleLibrary): SceneElement {
    return resolveTokenBindings(resolveSharedStyles(node, library, tokens), tokens)
  }

  private setTokens(input: readonly DesignToken[], label: string): void {
    this.setDesignSystem(input, this.state.styleLibrary, label)
  }

  private setDesignSystem(input: readonly DesignToken[], inputLibrary: StyleLibrary, label: string): void {
    const tokens = input === this.state.tokens ? input : validateTokens(input), styleLibrary = validateLibrary(inputLibrary, tokens)
    const resolved = resolveTokens(tokens, styleLibrary.activeThemeId)
    let elements = this.state.elements
    for (const node of Object.values(elements)) {
      const next = this.resolveStyles(node, resolved, styleLibrary)
      if (next === node) continue
      validateElement(next)
      if (elements === this.state.elements) elements = { ...elements }
      ;(elements as Record<string, SceneElement>)[node.id] = freezeElement(next)
    }
    this.publish(Object.freeze({ ...this.state, tokens, styleLibrary, elements: Object.freeze(elements) }), label)
  }

  addTheme(name: string): string {
    const id = crypto.randomUUID()
    this.setDesignSystem(this.state.tokens, { ...this.state.styleLibrary, themes: [...this.state.styleLibrary.themes, { id, name }] }, 'Add theme')
    return id
  }

  setActiveTheme(id: string | null): void {
    if (id === this.state.styleLibrary.activeThemeId) return
    this.setDesignSystem(this.state.tokens, { ...this.state.styleLibrary, activeThemeId: id }, 'Switch document theme')
  }

  removeTheme(id: string): void {
    const tokens = this.state.tokens.map(token => {
      const themeValues: Record<string, string | number> = { ...token.themeValues }; delete themeValues[id]
      return { ...token, ...(token.themeValues ? { themeValues } : {}) } as DesignToken
    })
    const library = this.state.styleLibrary
    this.setDesignSystem(tokens, { ...library, themes: library.themes.filter(theme => theme.id !== id), activeThemeId: library.activeThemeId === id ? null : library.activeThemeId }, 'Delete theme')
  }

  setTokenThemeValue(id: string, themeId: string, value: string | number | undefined): void {
    const token = this.state.tokens.find(token => token.id === id)
    if (!token) throw new Error('Unknown token')
    if (!this.state.styleLibrary.themes.some(theme => theme.id === themeId)) throw new Error('Unknown theme')
    const themeValues: Record<string, string | number> = { ...token.themeValues }
    if (value === undefined) delete themeValues[themeId]; else themeValues[themeId] = value
    this.updateToken(id, { themeValues })
  }

  addSharedStyle(input: SharedStyleInput): SharedStyle {
    const style = { ...input, id: input.id ?? crypto.randomUUID() } as SharedStyle
    this.setDesignSystem(this.state.tokens, { ...this.state.styleLibrary, styles: [...this.state.styleLibrary.styles, style] }, 'Add shared style')
    return this.state.styleLibrary.styles.at(-1)!
  }

  updateSharedStyle(style: SharedStyle): void {
    const previous = this.state.styleLibrary.styles.find(candidate => candidate.id === style.id)
    if (!previous || previous.kind !== style.kind) throw new Error('Unknown or incompatible shared style')
    if (equalValue(previous, style)) return
    this.setDesignSystem(this.state.tokens, { ...this.state.styleLibrary, styles: this.state.styleLibrary.styles.map(candidate => candidate.id === style.id ? style : candidate) }, `Edit ${style.name} style`)
  }

  bindSharedStyle(id: string, kind: SharedStyleKind, styleId: string): void {
    const node = this.require(id)
    if (this.isLocked(id)) throw new Error('Element is locked')
    if (node.sharedStyleBindings?.[kind] === styleId) return
    const tokenBindings = { ...node.tokenBindings }
    if (kind === 'color') delete tokenBindings.fill
    if (kind === 'typography') for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] as const) delete tokenBindings[key]
    const next = this.resolveStyles({ ...node, tokenBindings, sharedStyleBindings: { ...node.sharedStyleBindings, [kind]: styleId } })
    validateElement(next)
    this.commit({ ...this.state.elements, [id]: freezeElement(this.recordSharedStyleBinding(node, next, kind, styleId)) }, this.state.rootIds, this.state.selection, `Bind ${kind} style`)
  }

  private recordSharedStyleBinding(node: SceneElement, next: SceneElement, kind: SharedStyleKind, id: string | null): SceneElement {
    if (node.component?.kind !== 'instance') return next
    const original = node.component.overrides
    const overrides = { ...original, properties: { ...original.properties }, style: { ...original.style }, tokenBindings: { ...original.tokenBindings } }
    if (id !== null) {
      if (kind === 'color') { delete overrides.style.fill; delete overrides.tokenBindings.fill }
      if (kind === 'effects') { delete overrides.style.effects; delete overrides.style.shadow }
      if (kind === 'typography') for (const key of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign'] as const) {
        delete (overrides.properties as Record<string, unknown>)[key]
        delete (overrides.tokenBindings as Record<string, unknown>)[key]
      }
    }
    const detached = id === null ? kind === 'color' ? { style: { ...overrides.style, fill: node.style.fill } } : kind === 'effects' ? { style: { ...overrides.style, effects: node.style.effects } } : { properties: { ...overrides.properties, ...(node.type === 'text' ? { fontFamily: node.fontFamily, fontSize: node.fontSize, fontWeight: node.fontWeight, lineHeight: node.lineHeight, letterSpacing: node.letterSpacing, textAlign: node.textAlign } : {}) } } : {}
    return { ...next, component: { ...node.component, overrides: { ...overrides, ...detached, sharedStyleBindings: { ...overrides.sharedStyleBindings, [kind]: id } } } }
  }

  detachSharedStyle(id: string, kind: SharedStyleKind): void {
    const node = this.require(id)
    if (this.isLocked(id)) throw new Error('Element is locked')
    if (!node.sharedStyleBindings?.[kind]) return
    const sharedStyleBindings = { ...node.sharedStyleBindings }; delete sharedStyleBindings[kind]
    const next = this.recordSharedStyleBinding(node, { ...node, sharedStyleBindings }, kind, null)
    this.commit({ ...this.state.elements, [id]: freezeElement(next) }, this.state.rootIds, this.state.selection, `Detach ${kind} style`)
  }

  removeSharedStyle(id: string): void {
    if (!this.state.styleLibrary.styles.some(style => style.id === id)) return
    const detach = (node: SceneElement): SceneElement => {
      let next = node
      for (const kind of ['color', 'typography', 'effects'] as const) if (next.sharedStyleBindings?.[kind] === id) {
        const sharedStyleBindings = { ...next.sharedStyleBindings }; delete sharedStyleBindings[kind]
        next = this.recordSharedStyleBinding(next, { ...next, sharedStyleBindings }, kind, null)
      }
      if (next.type === 'path' && next.boolean) next = { ...next, boolean: { ...next.boolean, operands: next.boolean.operands.map(source => detach(source) as VectorElement) } }
      return next === node ? node : freezeElement(next)
    }
    const elements = Object.fromEntries(Object.entries(this.state.elements).map(([key, node]) => [key, detach(node)]))
    const styleLibrary = validateLibrary({ ...this.state.styleLibrary, styles: this.state.styleLibrary.styles.filter(style => style.id !== id) }, this.state.tokens)
    this.publish(Object.freeze({ ...this.state, elements: Object.freeze(elements), styleLibrary }), 'Delete shared style')
  }

  setBackgroundShader(paint: ShaderPaint | null): void {
    if (paint !== null) validateShader(paint)
    if (equalValue(this.state.backgroundShader, paint)) return
    this.publish(Object.freeze({ ...this.state, backgroundShader: paint ? freezeShader(paint) : null }), 'Style canvas background')
  }

  toJSON(): SceneDocument { return { version: 1, tokens: this.state.tokens, styleLibrary: this.state.styleLibrary, elements: this.state.elements, rootIds: this.state.rootIds, ...(this.state.backgroundShader !== undefined ? { backgroundShader: this.state.backgroundShader } : {}) } }

  /** Font loading changes text metrics without creating a user edit. */
  refreshLayout(): void {
    invalidateLayoutTextMetrics()
    const elements = reflowAutoLayout(this.state.elements, this.state.rootIds)
    if (elements !== this.state.elements) this.publish(Object.freeze({ ...this.state, elements: Object.freeze(elements) }), 'Refresh layout', false)
  }

  /** Validate the whole document before replacing state; invalid imports are atomic. */
  load(document: SceneDocument): void {
    if (document.version !== 1 || !document.elements || !Array.isArray(document.rootIds)) throw new Error('Unsupported scene document')
    if (document.backgroundShader !== undefined && document.backgroundShader !== null) validateShader(document.backgroundShader)
    const tokens = validateTokens(document.tokens ?? [])
    const styleLibrary = validateLibrary(document.styleLibrary, tokens)
    const resolvedTokens = resolveTokens(tokens, styleLibrary.activeThemeId)
    const elements: Record<string, SceneElement> = {}
    for (const [id, node] of Object.entries(document.elements)) {
      if (id !== node.id || ['__proto__', 'prototype', 'constructor'].includes(id)) throw new Error('Invalid element ID')
      validateElement(node)
      const resolved = this.resolveStyles(node, resolvedTokens, styleLibrary)
      validateElement(resolved)
      elements[id] = freezeElement(resolved)
    }
    const visited = new Set<string>()
    const visit = (id: string, parentId: string | null, index: number) => {
      const node = elements[id]
      if (!Object.hasOwn(elements, id) || visited.has(id)) throw new Error('Missing, duplicate, or cyclic element')
      if (node.parentId !== parentId || node.zIndex !== index) throw new Error('Inconsistent hierarchy or order')
      visited.add(id)
      if (node.type === 'frame') node.children.forEach((child, i) => visit(child, id, i))
    }
    document.rootIds.forEach((id, i) => visit(id, null, i))
    if (visited.size !== Object.keys(elements).length) throw new Error('Unreachable scene elements')
    validateComponentGraph(elements, resolvedTokens, styleLibrary)
    this.publish(Object.freeze({ version: 1, tokens, styleLibrary, elements: Object.freeze(elements), rootIds: Object.freeze([...document.rootIds]), selection: EMPTY, backgroundShader: document.backgroundShader ? freezeShader(document.backgroundShader) : null }), 'Load artwork')
  }
}
