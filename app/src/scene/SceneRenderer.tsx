import { effectFilterMarkup } from '../tokens/effects'
import { memo, useId, useMemo, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { SceneStore } from './store'
import type { SceneElement } from './types'
import { useScene } from './useScene'
import { ShapeShader } from '../shaders/ShapeShader'
import { frameMask, maskPathData, maskFillRule } from './maskGeometry'
import { compileTypographyStyles, embeddedFontCSS, resolveTextPathD } from './typography'
import { textMarkup } from './textMarkup'
import { KineticText } from './KineticText'
import './scene.css'

interface NodeProps { store: SceneStore; id: string; interactive: boolean; inheritedLocked?: boolean; presentationRoot?: boolean; presentation?: boolean }

/** Render in the operands' parent space so nested frame transforms and masks apply. */
function BooleanCanvasPreview({ store, parentId }: { store: SceneStore; parentId: string | null }) {
  const read = () => { const preview = store.getBooleanPreview(); return preview?.node.parentId === parentId ? preview : null }
  const preview = useSyncExternalStore(store.subscribeBooleanPreview, read, read)
  if (!preview) return null
  const { node, operation } = preview
  return <div className="boolean-canvas-preview" data-testid="boolean-canvas-preview" data-operation={operation} style={{ left: node.x, top: node.y, width: node.width, height: node.height, transform: `rotate(${node.rotation}deg)` }} aria-hidden="true">
    <svg viewBox={node.viewBox.join(' ')} preserveAspectRatio="none"><path d={node.d} fillRule={node.fillRule} vectorEffect="non-scaling-stroke" /></svg>
  </div>
}

function Paint({ node, pathD, paintId }: { node: SceneElement; pathD: string; paintId: string }) {
  const { fill: solidFill, stroke, shader } = node.style
  const shadow = node.style.effects?.some(effect => effect.enabled) ? null : node.style.shadow
  const fill = shader ? null : solidFill
  const shadowStyle = shadow ? { filter: `drop-shadow(${shadow.x}px ${shadow.y}px ${shadow.blur / 2}px ${shadow.color})` } : undefined
  if (node.type === 'frame') return null
  if (node.type === 'text') {
    if (node.kinetic?.enabled) return <KineticText node={node} pathD={pathD} />
    if (node.textOnPath?.enabled) {
      const pathNode = { ...node, textOnPath: { ...node.textOnPath, pathId: null, preset: 'custom' as const, pathData: pathD, reverse: false, side: 'left' as const } }
      return <svg className="scene-text-on-path" viewBox={`0 0 ${node.width} ${node.height}`} preserveAspectRatio="none" style={shadowStyle} role="img" aria-label={node.text}>
        <g stroke={stroke?.color ?? 'none'} strokeWidth={stroke?.width ?? 0} dangerouslySetInnerHTML={{ __html: textMarkup(pathNode, fill ?? 'none', undefined, undefined, undefined, paintId) }} />
      </svg>
    }
    return <div className="scene-text" style={{ ...shadowStyle, ...compileTypographyStyles(node), color: fill ?? 'transparent', WebkitTextStroke: stroke ? `${stroke.width}px ${stroke.color}` : undefined }}>{node.text}</div>
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

const SceneNode = memo(function SceneNode({ store, id, interactive, inheritedLocked = false, presentationRoot = false, presentation = false }: NodeProps) {
  const effectId = useId().replace(/:/g, "")
  const node = useScene(store, state => state.elements[id])
  const pathD = useScene(store, state => {
    const text = state.elements[id]
    return text?.type === 'text' && text.textOnPath?.enabled ? resolveTextPathD(text, state.elements) : ''
  })
  const mask = useScene(store, state => { const frame = state.elements[id]; return frame?.type === 'frame' ? frameMask(state.elements, frame) : undefined })
  const maskSelected = useScene(store, state => !!mask && state.selection.includes(mask.id))
  const selected = useScene(store, state => state.selection.includes(id))
  const previewSource = useSyncExternalStore(store.subscribeBooleanPreview, () => !presentation && !!store.getBooleanPreview()?.sourceIds.includes(id), () => false)
  const effects = node?.style.effects
  const effectMarkup = useMemo(() => effects ? effectFilterMarkup(effects, effectId) : '', [effects, effectId])
  if (!node || !node.visible) return null
  const locked = inheritedLocked || node.locked
  const isFrame = node.type === 'frame'
  const style: CSSProperties = {
    left: presentationRoot ? 0 : node.x, top: presentationRoot ? 0 : node.y, width: node.width, height: node.height,
    zIndex: presentationRoot ? 0 : node.zIndex, transform: !presentationRoot && node.rotation ? `rotate(${node.rotation}deg)` : undefined,
    pointerEvents: interactive && (presentation || !locked) ? 'auto' : 'none',
    opacity: previewSource ? .2 : undefined,
  }
  const hasEffects = node.style.effects?.some(effect => effect.enabled)
  const frameStyle: CSSProperties | undefined = isFrame ? {
    background: node.style.shader ? undefined : node.style.fill ?? undefined, borderRadius: node.cornerRadius,
    overflow: node.clipContent && !presentationRoot ? 'hidden' : 'visible',
    boxShadow: !hasEffects && node.style.shadow ? `${node.style.shadow.x}px ${node.style.shadow.y}px ${node.style.shadow.blur}px ${node.style.shadow.color}` : node.style.fill === null ? 'none' : undefined,
  } : undefined
  return <div className={`scene-node ${isFrame ? 'scene-frame' : ''} ${selected ? 'is-selected' : ''}`} style={style} data-element-id={id} data-element-type={node.type} data-component-kind={node.component?.kind} data-component-master={node.component?.kind === 'instance' ? node.component.masterId : undefined} data-boolean-operation={node.type === 'path' ? node.boolean?.operation : undefined} aria-label={node.name}>
    {isFrame && node.parentId === null && !presentation && <div className="artboard-label">{node.name}<span>{node.width} × {node.height}</span></div>}
    {hasEffects && <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden="true"><defs dangerouslySetInnerHTML={{ __html: effectMarkup }} /></svg>}
    <div className="scene-content" style={{ ...frameStyle, opacity: node.style.opacity, filter: hasEffects ? `url(#${effectId})` : undefined }}>
      {node.type === 'text' && node.fontSource && <style>{embeddedFontCSS(node)}</style>}
      {node.style.shader && !(node.type === 'text' && node.kinetic?.enabled) && <ShapeShader node={node} textPathD={pathD} />}
      <Paint node={node} pathD={pathD} paintId={`${effectId}-text`} />
      {selected && !presentation && node.type === 'text' && node.textOnPath?.enabled && <svg className="scene-text-path-guide" viewBox={`0 0 ${node.width} ${node.height}`} preserveAspectRatio="none" aria-hidden="true"><path d={pathD} fill="none" stroke="#81adec" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" /></svg>}
      {isFrame && mask && <svg width="0" height="0" className="scene-mask-defs" aria-hidden="true"><defs><clipPath id={`${effectId}-mask`} clipPathUnits="userSpaceOnUse"><path d={maskPathData(mask)} clipRule={maskFillRule(mask)} /></clipPath></defs></svg>}
      {isFrame && <div className="scene-children" data-mask-source={mask?.id} style={{ clipPath: mask ? `url(#${effectId}-mask)` : undefined }}>{node.children.filter(childId => childId !== mask?.id).map(childId => <SceneNode key={childId} store={store} id={childId} interactive={interactive} inheritedLocked={locked} presentation={presentation} />)}{!presentation && <BooleanCanvasPreview store={store} parentId={id} />}</div>}
      {isFrame && mask && !presentation && (mask.mask?.showOutline || maskSelected) && <svg className="scene-mask-outline" viewBox={`0 0 ${node.width} ${node.height}`} preserveAspectRatio="none" aria-hidden="true"><path d={maskPathData(mask)} fill="none" stroke="#81adec" strokeWidth="1" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" /></svg>}
      {isFrame && node.style.stroke && <div className="scene-frame-border" style={{ border: `${node.style.stroke.width}px ${node.style.stroke.dash.length ? 'dashed' : 'solid'} ${node.style.stroke.color}`, borderRadius: node.cornerRadius }} />}
    </div>
  </div>
})

export const SceneRenderer = memo(function SceneRenderer({ store, interactive = true, frameId }: { store: SceneStore; interactive?: boolean; frameId?: string }) {
  const rootIds = useScene(store, state => state.rootIds)
  if (frameId) return <SceneNode store={store} id={frameId} interactive={interactive} presentation presentationRoot />
  return <>{rootIds.map(id => <SceneNode key={id} store={store} id={id} interactive={interactive} />)}<BooleanCanvasPreview store={store} parentId={null} /></>
})
