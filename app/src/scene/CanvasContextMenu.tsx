import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  LockKeyhole,
  UnlockKeyhole,
  Eye,
  EyeOff,
  Code2,
  FileCode,
  Frame,
  Square,
  Circle,
  Type,
  Maximize,
  ZoomIn,
} from 'lucide-react'
import type { ViewportController } from '../canvas'
import type { Point } from '../canvas/types'
import { alignSelection, deleteSelection, duplicateSelection, orderSelection } from './arrange'
import type { Alignment, LayerOrder } from './arrange'
import { selectionBounds, selectionRoots } from './selectionGeometry'
import type { SceneStore } from './store'
import type { ElementType } from './types'
import { sceneToSVG } from '../io/svg'
import { buildReactComponent } from '../tokens/codegen'
import { importClipboard, insertImportedScene } from '../io/import'
import './contextMenu.css'

interface ContextMenuPosition {
  x: number
  y: number
  worldPos: Point
}

interface CanvasContextMenuProps {
  store: SceneStore
  controller: ViewportController
  position: ContextMenuPosition
  onClose: () => void
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  try {
    const field = document.createElement('textarea')
    field.value = text
    field.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none'
    document.body.append(field)
    field.select()
    const success = document.execCommand('copy')
    field.remove()
    return success
  } catch {
    return false
  }
}

export function CanvasContextMenu({ store, controller, position, onClose }: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: position.y, left: position.x })
  const state = store.getSnapshot()
  const selection = state.selection
  const selectedRoots = selectionRoots(state, selection)
  const hasSelection = selectedRoots.length > 0
  const isSingle = selectedRoots.length === 1
  const firstNode = isSingle ? state.elements[selectedRoots[0]] : null
  const anyLocked = selectedRoots.some(id => store.isLocked(id))
  const anyVisible = selectedRoots.some(id => store.isVisible(id))
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const modKey = isMac ? '⌘' : 'Ctrl+'

  // Smart viewport clamping to avoid clipping outside screen
  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const padding = 10
    let left = position.x
    let top = position.y

    if (left + rect.width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - rect.width - padding)
    }
    if (top + rect.height > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - rect.height - padding)
    }
    setCoords({ top, left })
  }, [position.x, position.y])

  // Dismiss on click outside or escape
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const handleDuplicate = () => {
    duplicateSelection(store)
    onClose()
  }

  const handleDelete = () => {
    deleteSelection(store)
    onClose()
  }

  const handleCopy = async () => {
    if (!hasSelection) return
    try {
      const svg = sceneToSVG(state, { scope: 'selection', scale: 1, background: 'transparent' })
      await copyToClipboard(svg)
    } catch (e) {
      console.error('Failed to copy selection to SVG:', e)
    }
    onClose()
  }

  const handleCut = async () => {
    await handleCopy()
    deleteSelection(store)
    onClose()
  }

  const handlePaste = async () => {
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText()
        if (text) {
          const doc = await importClipboard({ text, svg: text.includes('<svg') ? text : undefined })
          if (doc) {
            insertImportedScene(store, doc, position.worldPos)
          }
        }
      }
    } catch (e) {
      console.error('Failed to paste clipboard content:', e)
    }
    onClose()
  }

  const handleOrder = (order: LayerOrder) => {
    orderSelection(store, order)
    onClose()
  }

  const handleAlign = (alignment: Alignment) => {
    alignSelection(store, alignment, controller.getSnapshot().visibleBounds)
    onClose()
  }

  const handleToggleLock = () => {
    store.batch(() => {
      for (const id of selectedRoots) {
        store.setLocked(id, !anyLocked)
      }
    }, anyLocked ? 'Unlock elements' : 'Lock elements')
    onClose()
  }

  const handleToggleVisibility = () => {
    store.batch(() => {
      for (const id of selectedRoots) {
        store.setVisible(id, !anyVisible)
      }
    }, anyVisible ? 'Hide elements' : 'Show elements')
    onClose()
  }

  const handleCopySVG = async () => {
    if (!hasSelection) return
    try {
      const svg = sceneToSVG(state, { scope: 'selection', scale: 1, background: 'transparent' })
      await copyToClipboard(svg)
    } catch (e) {
      console.error('Failed to copy SVG:', e)
    }
    onClose()
  }

  const handleCopyReact = async () => {
    if (!firstNode) return
    try {
      const parentNode = firstNode.parentId ? state.elements[firstNode.parentId] : undefined
      const code = buildReactComponent(firstNode, state.tokens, parentNode, state.elements)
      await copyToClipboard(code)
    } catch (e) {
      console.error('Failed to generate React component:', e)
    }
    onClose()
  }

  const handleGroupInFrame = () => {
    const ids = selectedRoots.filter(id => store.isVisible(id) && !store.isLocked(id))
    if (!ids.length) return
    const bounds = selectionBounds(state, ids)
    if (!bounds) return
    store.batch(() => {
      const parent = state.elements[ids[0]].parentId
      const frame = store.add('frame', {
        name: 'Group',
        parentId: parent,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        clipContent: false,
        style: { fill: null },
      })
      for (const id of ids) {
        const node = state.elements[id]
        store.reparent(id, frame.id, node.zIndex)
        store.update(id, node.type, {
          x: node.x - bounds.x,
          y: node.y - bounds.y,
        })
      }
      store.select([frame.id])
    }, 'Group selection in frame')
    onClose()
  }

  const handleAddElement = (type: ElementType) => {
    const w = type === 'frame' ? 720 : type === 'text' ? 240 : 120
    const h = type === 'frame' ? 480 : type === 'text' ? 48 : 120
    const node = store.add(type, {
      x: position.worldPos.x - w / 2,
      y: position.worldPos.y - h / 2,
    })
    store.select([node.id])
    onClose()
  }

  const handleSelectAll = () => {
    const unlockedVisible = state.rootIds.filter(id => store.isVisible(id) && !store.isLocked(id))
    store.select(unlockedVisible)
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="canvas-context-menu"
      style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
      role="menu"
      aria-label="Canvas context menu"
      data-testid="canvas-context-menu"
    >
      {hasSelection ? (
        <>
          <div className="context-menu-header">
            {isSingle ? firstNode?.name : `${selectedRoots.length} elements selected`}
          </div>

          <MenuItem icon={<CopyPlus size={14} />} label="Duplicate" shortcut={`${modKey}D`} onClick={handleDuplicate} />
          <MenuItem icon={<Copy size={14} />} label="Copy" shortcut={`${modKey}C`} onClick={handleCopy} />
          <MenuItem icon={<Scissors size={14} />} label="Cut" shortcut={`${modKey}X`} onClick={handleCut} />
          <MenuItem icon={<ClipboardPaste size={14} />} label="Paste" shortcut={`${modKey}V`} onClick={handlePaste} />
          <MenuItem icon={<Trash2 size={14} />} label="Delete" shortcut="Del" danger onClick={handleDelete} />

          <div className="context-menu-separator" />

          <MenuItem icon={<ChevronsUp size={14} />} label="Bring to Front" shortcut="]" onClick={() => handleOrder('front')} />
          <MenuItem icon={<ArrowUp size={14} />} label="Bring Forward" shortcut={`${modKey}]`} onClick={() => handleOrder('forward')} />
          <MenuItem icon={<ArrowDown size={14} />} label="Send Backward" shortcut={`${modKey}[`} onClick={() => handleOrder('backward')} />
          <MenuItem icon={<ChevronsDown size={14} />} label="Send to Back" shortcut="[" onClick={() => handleOrder('back')} />

          <div className="context-menu-separator" />

          {/* Quick Alignment Grid */}
          <div className="context-menu-grid" title="Align selection">
            <button className="context-menu-grid-btn" title="Align left (Alt+A)" onClick={() => handleAlign('left')}><AlignStartVertical size={13} /></button>
            <button className="context-menu-grid-btn" title="Align horizontal center (Alt+H)" onClick={() => handleAlign('horizontal-center')}><AlignCenterVertical size={13} /></button>
            <button className="context-menu-grid-btn" title="Align right (Alt+D)" onClick={() => handleAlign('right')}><AlignEndVertical size={13} /></button>
            <button className="context-menu-grid-btn" title="Align top (Alt+W)" onClick={() => handleAlign('top')}><AlignStartHorizontal size={13} /></button>
            <button className="context-menu-grid-btn" title="Align vertical center (Alt+V)" onClick={() => handleAlign('vertical-center')}><AlignCenterHorizontal size={13} /></button>
            <button className="context-menu-grid-btn" title="Align bottom (Alt+S)" onClick={() => handleAlign('bottom')}><AlignEndHorizontal size={13} /></button>
          </div>

          <div className="context-menu-separator" />

          <MenuItem
            icon={anyLocked ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}
            label={anyLocked ? 'Unlock' : 'Lock'}
            onClick={handleToggleLock}
          />
          <MenuItem
            icon={anyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            label={anyVisible ? 'Hide' : 'Show'}
            onClick={handleToggleVisibility}
          />
          <MenuItem icon={<Frame size={14} />} label="Frame Selection" shortcut={`${modKey}Alt+G`} onClick={handleGroupInFrame} />

          <div className="context-menu-separator" />

          <MenuItem icon={<FileCode size={14} />} label="Copy as SVG" onClick={handleCopySVG} />
          {isSingle && (
            <MenuItem icon={<Code2 size={14} />} label="Copy as React / Tailwind" onClick={handleCopyReact} />
          )}
        </>
      ) : (
        <>
          <div className="context-menu-header">Canvas</div>

          <MenuItem icon={<ClipboardPaste size={14} />} label="Paste" shortcut={`${modKey}V`} onClick={handlePaste} />
          <MenuItem icon={<Copy size={14} />} label="Select All" shortcut={`${modKey}A`} onClick={handleSelectAll} />

          <div className="context-menu-separator" />

          <MenuItem icon={<Frame size={14} />} label="New Frame" shortcut="F" onClick={() => handleAddElement('frame')} />
          <MenuItem icon={<Square size={14} />} label="New Rectangle" shortcut="R" onClick={() => handleAddElement('rectangle')} />
          <MenuItem icon={<Circle size={14} />} label="New Ellipse" shortcut="O" onClick={() => handleAddElement('ellipse')} />
          <MenuItem icon={<Type size={14} />} label="New Text" shortcut="T" onClick={() => handleAddElement('text')} />

          <div className="context-menu-separator" />

          <MenuItem icon={<ZoomIn size={14} />} label="Zoom to 100%" shortcut="0" onClick={() => { controller.zoomTo(1); onClose() }} />
          <MenuItem icon={<Maximize size={14} />} label="Fit to Screen" shortcut="1" onClick={() => { controller.fit(controller.getSnapshot().visibleBounds); onClose() }} />
        </>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  shortcut,
  danger = false,
  disabled = false,
  onClick,
}: {
  icon: ReactNode
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`context-menu-item ${danger ? 'context-menu-danger' : ''}`}
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
    >
      <div className="context-menu-item-content">
        {icon}
        <span>{label}</span>
      </div>
      {shortcut && <span className="context-menu-shortcut">{shortcut}</span>}
    </button>
  )
}
