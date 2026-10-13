import { memo } from 'react'
import type { CSSProperties } from 'react'
import type { SceneStore } from './store'
import type { SceneElement } from './types'
import { useScene } from './useScene'
import { ShapeShader } from '../shaders/ShapeShader'
import './scene.css'

interface NodeProps { store: SceneStore; id: string; interactive: boolean; inheritedLocked?: boolean }

function Paint({ node }: { node: SceneElement }) {
  const { fill: solidFill, stroke, shadow, shader } = node.style
  const fill = shader ? null : solidFill
  const shadowStyle = shadow ? { filter: `drop-shadow(${shadow.x}px ${shadow.y}px ${shadow.blur / 2}px ${shadow.color})` } : undefined
  if (node.type === 'frame') return null
  if (node.type === 'text') {
    return <div className="scene-text" style={{ ...shadowStyle, color: fill ?? 'transparent', fontFamily: node.fontFamily, fontSize: node.fontSize, fontWeight: node.fontWeight, lineHeight: node.lineHeight, letterSpacing: node.letterSpacing, textAlign: node.textAlign, WebkitTextStroke: stroke ? `${stroke.width}px ${stroke.color}` : undefined }}>{node.text}</div>
  }
  if (node.type === 'image') {
    return <div className="scene-image" style={{ background: fill ?? undefined, borderRadius: node.cornerRadius, boxShadow: shadow ? `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color}` : undefined }}>
      <img src={node.src} alt={node.alt} draggable={false} style={{ objectFit: node.fit, borderRadius: node.cornerRadius, visibility: shader ? 'hidden' : undefined }} />
      {stroke && <div className="scene-image-border" style={{ border: `${stroke.width}px ${stroke.dash.length ? 'dashed' : 'solid'} ${stroke.color}`, borderRadius: node.cornerRadius }} />}
    </div>
  }
  const paint = { fill: fill ?? 'none', stroke: stroke?.color ?? 'none', strokeWidth: stroke?.width ?? 0, strokeDasharray: stroke?.dash.join(' '), strokeLinejoin: 'round' as const }
  const inset = (stroke?.width ?? 0) / 2
  const viewBox = node.type === 'path' ? node.viewBox.join(' ') : `0 0 ${node.width} ${node.height}`
  return <svg className="scene-vector" viewBox={viewBox} preserveAspectRatio="none" style={shadowStyle} aria-hidden="true">
    {node.type === 'rectangle' && <rect x={inset} y={inset} width={Math.max(0, node.width - inset * 2)} height={Math.max(0, node.height - inset * 2)} rx={node.cornerRadius} {...paint} />}
    {node.type === 'ellipse' && <ellipse cx={node.width / 2} cy={node.height / 2} rx={Math.max(0, node.width / 2 - inset)} ry={Math.max(0, node.height / 2 - inset)} {...paint} />}
    {node.type === 'path' && <path d={node.d} fillRule={node.fillRule} {...paint} />}
  </svg>
}

const SceneNode = memo(function SceneNode({ store, id, interactive, inheritedLocked = false }: NodeProps) {
  const node = useScene(store, state => state.elements[id])
  const selected = useScene(store, state => state.selection.includes(id))
  if (!node || !node.visible) return null
  const locked = inheritedLocked || node.locked
  const isFrame = node.type === 'frame'
  const style: CSSProperties = {
    left: node.x, top: node.y, width: node.width, height: node.height,
    zIndex: node.zIndex, transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
    pointerEvents: interactive && !locked ? 'auto' : 'none',
  }
  const frameStyle: CSSProperties | undefined = isFrame ? {
    background: node.style.fill ?? undefined, borderRadius: node.cornerRadius,
    overflow: node.clipContent ? 'hidden' : 'visible',
    boxShadow: node.style.shadow ? `${node.style.shadow.x}px ${node.style.shadow.y}px ${node.style.shadow.blur}px ${node.style.shadow.color}` : undefined,
  } : undefined
  return <div className={`scene-node ${isFrame ? 'scene-frame' : ''} ${selected ? 'is-selected' : ''}`} style={style} data-element-id={id} data-element-type={node.type} data-boolean-operation={node.type === 'path' ? node.boolean?.operation : undefined} aria-label={node.name}>
    {isFrame && node.parentId === null && <div className="artboard-label">{node.name}<span>{node.width} × {node.height}</span></div>}
    <div className="scene-content" style={{ ...frameStyle, opacity: node.style.opacity }}>
      {node.style.shader && <ShapeShader node={node} />}
      <Paint node={node} />
      {isFrame && node.children.map(childId => <SceneNode key={childId} store={store} id={childId} interactive={interactive} inheritedLocked={locked} />)}
      {isFrame && node.style.stroke && <div className="scene-frame-border" style={{ border: `${node.style.stroke.width}px ${node.style.stroke.dash.length ? 'dashed' : 'solid'} ${node.style.stroke.color}`, borderRadius: node.cornerRadius }} />}
    </div>
  </div>
})

export const SceneRenderer = memo(function SceneRenderer({ store, interactive = true }: { store: SceneStore; interactive?: boolean }) {
  const rootIds = useScene(store, state => state.rootIds)
  return rootIds.map(id => <SceneNode key={id} store={store} id={id} interactive={interactive} />)
})
