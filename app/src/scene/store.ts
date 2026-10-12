import { createElement, freezeElement, validateElement } from './elements.ts'
import type { ElementInput, ElementOf, ElementPatch, ElementType, SceneDocument, SceneElement, SceneSnapshot } from './types.ts'

type Listener = () => void
const EMPTY = Object.freeze([]) as readonly string[]

/** Framework-independent immutable scene graph. Sibling arrays are the paint order. */
export class SceneStore {
  private state: SceneSnapshot = Object.freeze({ version: 1, elements: Object.freeze({}), rootIds: EMPTY, selection: EMPTY })
  private listeners = new Set<Listener>()
  private batchDepth = 0
  private pending = false

  getSnapshot = (): SceneSnapshot => this.state
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** One notification for many edits. Nested batches are supported. */
  batch<T>(work: () => T): T {
    this.batchDepth++
    try { return work() } finally {
      this.batchDepth--
      if (!this.batchDepth && this.pending) { this.pending = false; this.emit() }
    }
  }

  private emit() { for (const listener of [...this.listeners]) listener() }
  private commit(elements: Record<string, SceneElement>, rootIds = this.state.rootIds, selection = this.state.selection) {
    this.state = Object.freeze({ version: 1, elements: Object.freeze(elements), rootIds: rootIds === this.state.rootIds ? rootIds : Object.freeze([...rootIds]), selection: selection === this.state.selection ? selection : Object.freeze([...selection]) })
    if (this.batchDepth) this.pending = true
    else this.emit()
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
    const node = createElement(type, input)
    if (Object.hasOwn(this.state.elements, node.id)) throw new Error(`Duplicate element: ${node.id}`)
    if (['__proto__', 'prototype', 'constructor'].includes(node.id)) throw new Error('Reserved element ID')
    this.requireFrame(node.parentId)
    if (node.parentId !== null && this.isLocked(node.parentId)) throw new Error('Parent frame is locked')
    const siblings = [...this.getChildren(node.parentId)]
    siblings.splice(this.index(index ?? siblings.length, siblings.length), 0, node.id)
    const elements = { ...this.state.elements, [node.id]: node }
    this.ordered(elements, node.parentId, siblings)
    this.commit(elements, node.parentId === null ? siblings : this.state.rootIds)
    return elements[node.id] as ElementOf<T>
  }

  /** Structural fields can only change through add/reparent/reorder/remove. */
  update<T extends ElementType>(id: string, type: T, patch: ElementPatch<T>): void {
    const node = this.require(id)
    if (node.type !== type) throw new Error('Element type mismatch')
    if (this.isLocked(id)) throw new Error('Element is locked')
    for (const key of ['id', 'type', 'children', 'parentId', 'zIndex']) {
      if (Object.hasOwn(patch, key)) throw new Error(`Use structural actions to change ${key}`)
    }
    const updated = { ...node, ...patch, style: { ...node.style, ...patch.style } } as SceneElement
    validateElement(updated)
    this.commit({ ...this.state.elements, [id]: freezeElement(updated) })
  }

  /** Flags are editable even for a locked layer, so it can always be unlocked. */
  setLocked(id: string, locked: boolean): void { this.setFlag(id, 'locked', locked) }
  setVisible(id: string, visible: boolean): void { this.setFlag(id, 'visible', visible) }
  private setFlag(id: string, key: 'locked' | 'visible', value: boolean) {
    const node = this.require(id)
    if (node[key] === value) return
    const elements = { ...this.state.elements, [id]: freezeElement({ ...node, [key]: value }) }
    this.batch(() => {
      this.commit(elements)
      this.select(this.state.selection)
    })
  }

  select = (ids: readonly string[]): void => {
    const selection = [...new Set(ids)].filter(id => this.isVisible(id) && !this.isLocked(id))
    if (selection.length === this.state.selection.length && selection.every((id, i) => id === this.state.selection[i])) return
    this.commit({ ...this.state.elements }, this.state.rootIds, selection)
  }

  private index(value: number, max: number): number {
    if (!Number.isFinite(value)) throw new Error('Invalid sibling index')
    return Math.max(0, Math.min(max, Math.trunc(value)))
  }

  /** Reparenting retains local coordinates. Call update to place the node afterward. */
  reparent(id: string, parentId: string | null, index?: number): void {
    const node = this.require(id)
    this.requireFrame(parentId)
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
    })
  }

  reorder(id: string, index: number): void {
    const node = this.require(id)
    if (this.isLocked(id)) throw new Error('Element is locked')
    const ids = this.getChildren(node.parentId).filter(child => child !== id)
    ids.splice(this.index(index, ids.length), 0, id)
    if (ids.every((child, i) => child === this.getChildren(node.parentId)[i])) return
    const elements = { ...this.state.elements }
    this.ordered(elements, node.parentId, ids)
    this.commit(elements, node.parentId === null ? ids : this.state.rootIds)
  }

  remove(id: string): void {
    const node = this.require(id)
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
    this.commit(elements, node.parentId === null ? siblings : this.state.rootIds, this.state.selection.filter(selected => Object.hasOwn(elements, selected)))
  }

  toJSON(): SceneDocument { return { version: 1, elements: this.state.elements, rootIds: this.state.rootIds } }

  /** Validate the whole document before replacing state; invalid imports are atomic. */
  load(document: SceneDocument): void {
    if (document.version !== 1 || !document.elements || !Array.isArray(document.rootIds)) throw new Error('Unsupported scene document')
    const elements: Record<string, SceneElement> = {}
    for (const [id, node] of Object.entries(document.elements)) {
      if (id !== node.id || ['__proto__', 'prototype', 'constructor'].includes(id)) throw new Error('Invalid element ID')
      validateElement(node)
      elements[id] = freezeElement(node)
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
    this.commit(elements, document.rootIds, EMPTY)
  }
}
