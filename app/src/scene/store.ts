import { detachEditedBindings, resolveTokenBindings, supportsTokenProperty, tokenVariable, validateTokens } from '../tokens/model.ts'
import type { DesignToken, TokenInput, TokenProperty } from '../tokens/types.ts'
import { createElement, freezeElement, validateElement } from './elements.ts'
import { freezeShader, validateShader } from '../shaders/catalog.ts'
import { CommandHistory, equalValue } from './history.ts'
import type { ShaderPaint } from '../shaders/types.ts'
import type { ElementInput, ElementOf, ElementPatch, ElementType, SceneDocument, SceneElement, SceneSnapshot } from './types.ts'

type Listener = () => void
const EMPTY = Object.freeze([]) as readonly string[]

/** Framework-independent immutable scene graph. Sibling arrays are the paint order. */
export class SceneStore {
  private state: SceneSnapshot = Object.freeze({ version: 1, tokens: Object.freeze([]), backgroundShader: null, elements: Object.freeze({}), rootIds: EMPTY, selection: EMPTY })
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
    const node = freezeElement(resolveTokenBindings(createElement(type, input), this.state.tokens))
    validateElement(node)
    if (Object.hasOwn(this.state.elements, node.id)) throw new Error(`Duplicate element: ${node.id}`)
    if (['__proto__', 'prototype', 'constructor'].includes(node.id)) throw new Error('Reserved element ID')
    this.requireFrame(node.parentId)
    if (node.parentId !== null && this.isLocked(node.parentId)) throw new Error('Parent frame is locked')
    const siblings = [...this.getChildren(node.parentId)]
    siblings.splice(this.index(index ?? siblings.length, siblings.length), 0, node.id)
    const elements = { ...this.state.elements, [node.id]: node }
    this.ordered(elements, node.parentId, siblings)
    this.commit(elements, node.parentId === null ? siblings : this.state.rootIds, this.state.selection, `Add ${node.name}`)
    return elements[node.id] as ElementOf<T>
  }

  /** Structural fields can only change through add/reparent/reorder/remove. */
  update<T extends ElementType>(id: string, type: T, patch: ElementPatch<T>): void {
    const node = this.require(id)
    if (node.type !== type) throw new Error('Element type mismatch')
    if (this.isLocked(id)) throw new Error('Element is locked')
    for (const key of ['id', 'type', 'children', 'parentId', 'zIndex', 'tokenBindings']) {
      if (Object.hasOwn(patch, key)) throw new Error(`Use structural actions to change ${key}`)
    }
    const tokenBindings = detachEditedBindings(node.tokenBindings, patch as Record<string, unknown>, node)
    const updated = { ...node, ...patch, ...(tokenBindings ? { tokenBindings } : {}), style: { ...node.style, ...patch.style } } as SceneElement
    validateElement(updated)
    if (equalValue(node, updated)) return
    const label = patch.style ? 'Style' : ['x', 'y', 'width', 'height', 'rotation'].some(key => Object.hasOwn(patch, key)) ? 'Transform' : 'Edit'
    this.commit({ ...this.state.elements, [id]: freezeElement(updated) }, this.state.rootIds, this.state.selection, `${label} ${node.name}`)
  }

  /** Flags are editable even for a locked layer, so it can always be unlocked. */
  setLocked(id: string, locked: boolean): void { this.setFlag(id, 'locked', locked) }
  setVisible(id: string, visible: boolean): void { this.setFlag(id, 'visible', visible) }
  private setFlag(id: string, key: 'locked' | 'visible', value: boolean) {
    const node = this.require(id)
    if (node[key] === value) return
    const action = key === 'locked' ? value ? 'Lock' : 'Unlock' : value ? 'Show' : 'Hide'
    const elements = { ...this.state.elements, [id]: freezeElement({ ...node, [key]: value }) }
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

  updateToken(id: string, patch: { name?: string; value?: string | number }): void {
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
      if (!Object.values(node.tokenBindings ?? {}).some(id => removed.has(id))) continue
      const tokenBindings = { ...node.tokenBindings }
      for (const property of Object.keys(tokenBindings) as TokenProperty[]) if (removed.has(tokenBindings[property]!)) delete tokenBindings[property]
      // Values were already resolved; removing a token detaches, retaining its appearance.
      elements[node.id] = freezeElement({ ...node, tokenBindings })
    }
    this.publish(Object.freeze({ ...this.state, tokens: validateTokens(this.state.tokens.filter(token => !removed.has(token.id))), elements: Object.freeze(elements) }), 'Delete tokens')
  }

  bindToken(id: string, property: TokenProperty, tokenId: string): void {
    const node = this.require(id)
    if (this.isLocked(id)) throw new Error('Element is locked')
    if (!supportsTokenProperty(node, property)) throw new Error('Unsupported token property')
    if (node.tokenBindings?.[property] === tokenId) return
    const next = resolveTokenBindings({ ...node, tokenBindings: { ...node.tokenBindings, [property]: tokenId } }, this.state.tokens)
    validateElement(next)
    this.commit({ ...this.state.elements, [id]: freezeElement(next) }, this.state.rootIds, this.state.selection, `Bind ${property} token`)
  }

  detachToken(id: string, property: TokenProperty): void {
    const node = this.require(id)
    if (this.isLocked(id)) throw new Error('Element is locked')
    if (!node.tokenBindings?.[property]) return
    const tokenBindings = { ...node.tokenBindings }
    delete tokenBindings[property]
    this.commit({ ...this.state.elements, [id]: freezeElement({ ...node, tokenBindings }) }, this.state.rootIds, this.state.selection, `Detach ${property} token`)
  }

  private setTokens(input: readonly DesignToken[], label: string): void {
    const tokens = validateTokens(input)
    const tokenLookup = new Map(tokens.map(token => [token.id, token]))
    let elements = this.state.elements
    for (const node of Object.values(elements)) {
      const next = resolveTokenBindings(node, tokenLookup)
      if (next === node) continue
      validateElement(next)
      if (elements === this.state.elements) elements = { ...elements }
      ;(elements as Record<string, SceneElement>)[node.id] = freezeElement(next)
    }
    this.publish(Object.freeze({ ...this.state, tokens, elements: Object.freeze(elements) }), label)
  }

  setBackgroundShader(paint: ShaderPaint | null): void {
    if (paint !== null) validateShader(paint)
    if (equalValue(this.state.backgroundShader, paint)) return
    this.publish(Object.freeze({ ...this.state, backgroundShader: paint ? freezeShader(paint) : null }), 'Style canvas background')
  }

  toJSON(): SceneDocument { return { version: 1, tokens: this.state.tokens, elements: this.state.elements, rootIds: this.state.rootIds, ...(this.state.backgroundShader !== undefined ? { backgroundShader: this.state.backgroundShader } : {}) } }

  /** Validate the whole document before replacing state; invalid imports are atomic. */
  load(document: SceneDocument): void {
    if (document.version !== 1 || !document.elements || !Array.isArray(document.rootIds)) throw new Error('Unsupported scene document')
    if (document.backgroundShader !== undefined && document.backgroundShader !== null) validateShader(document.backgroundShader)
    const tokens = validateTokens(document.tokens ?? [])
    const tokenLookup = new Map(tokens.map(token => [token.id, token]))
    const elements: Record<string, SceneElement> = {}
    for (const [id, node] of Object.entries(document.elements)) {
      if (id !== node.id || ['__proto__', 'prototype', 'constructor'].includes(id)) throw new Error('Invalid element ID')
      validateElement(node)
      const resolved = resolveTokenBindings(node, tokenLookup)
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
    this.publish(Object.freeze({ version: 1, tokens, elements: Object.freeze(elements), rootIds: Object.freeze([...document.rootIds]), selection: EMPTY, backgroundShader: document.backgroundShader ? freezeShader(document.backgroundShader) : null }), 'Load artwork')
  }
}
