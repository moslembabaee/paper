import { useId, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { TextElement } from './types'
import { shapeText } from './fontEngine'
import { cascadeOffset, placeGlyphs } from './kineticGeometry'
import { useOutlineFont } from './useOutlineFont'
import { compileTypographyStyles } from './typography'
import { ShapeShader } from '../shaders/ShapeShader'

/** Animation stays in the compositor; scene/history never update on animation frames. */
export function KineticText({ node, pathD }: { node: TextElement; pathD: string }) {
  const clipId = useId()
  const loaded = useOutlineFont(node.fontSource)
  const shaped = useMemo(() => {
    if (!loaded?.font) return null
    try { return shapeText(loaded.font, node) } catch { return null }
    // Animation/paint edits do not reshape the glyph run.
  }, [loaded, node.text, node.fontSize, node.fontWeight, node.variableAxes, node.openTypeFeatures, node.fontKerning, node.opticalKerning, node.letterSpacing, node.lineHeight, node.width, node.textTransform, node.textOnPath?.enabled, node.textOnPath?.spacing])
  const layout = useMemo(() => {
    if (!loaded?.font || !shaped) return null
    try { return { glyphs: placeGlyphs(node, shaped, loaded.font.unitsPerEm, pathD) } }
    catch { return null }
  }, [loaded, shaped, node, pathD])
  if (!layout) return <>{node.style.shader && <ShapeShader node={node} textPathD={pathD} />}<div className="scene-text" style={{ ...compileTypographyStyles(node), color: node.style.shader ? 'transparent' : node.style.fill ?? 'transparent' }}>{node.text}</div></>
  const k = node.kinetic!
  const glyphStyle = (index: number): CSSProperties => {
    const offset = cascadeOffset(k, index)
    return {
      '--cascade-amplitude': `${k.amplitude}px`, '--cascade-rotation': `${k.rotation}deg`,
      animationDuration: `${k.duration}s`, animationDelay: `${-(k.phase * k.duration + index * k.stagger / 1000)}s`,
      transform: `translateY(${offset.y}px) rotate(${offset.angle}deg)`,
    } as CSSProperties
  }
  return <svg className="scene-text-on-path scene-kinetic-text" viewBox={`0 0 ${node.width} ${node.height}`} preserveAspectRatio="none" role="img" aria-label={node.text}
    data-playing={k.playing} style={{ filter: !node.style.effects?.some(effect => effect.enabled) && node.style.shadow ? `drop-shadow(${node.style.shadow.x}px ${node.style.shadow.y}px ${node.style.shadow.blur / 2}px ${node.style.shadow.color})` : undefined }}>
    {node.style.shader && <>
      <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse">{layout.glyphs.map(glyph => {
        const base = `translate(${glyph.x}px, ${glyph.y}px) rotate(${glyph.angle}deg)`
        const font = `translate(${glyph.origin + glyph.dx}px, ${glyph.dy}px) scale(${glyph.scale}, ${-glyph.scale})`
        const motion = glyphStyle(glyph.index)
        return <path key={glyph.index} className="kinetic-glyph" d={glyph.d} style={{ ...motion, '--cascade-base': base, '--cascade-font': font, transform: `${base} ${motion.transform} ${font}` } as CSSProperties} />
      })}</clipPath></defs>
      <foreignObject width={node.width} height={node.height}><ShapeShader node={node} clipPathId={clipId} /></foreignObject>
    </>}
    <g fill={node.style.shader ? 'none' : node.style.fill ?? 'none'} stroke={node.style.stroke?.color ?? 'none'} strokeWidth={node.style.stroke?.width ?? 0} strokeDasharray={node.style.stroke?.dash.join(' ')}>
      {layout.glyphs.map(glyph => {
        const style = glyphStyle(glyph.index)
        return <g key={glyph.index} transform={`translate(${glyph.x} ${glyph.y}) rotate(${glyph.angle})`}>
          <g className="kinetic-glyph" style={style}><path d={glyph.d} transform={`translate(${glyph.origin + glyph.dx} ${glyph.dy}) scale(${glyph.scale} ${-glyph.scale})`} strokeWidth={(node.style.stroke?.width ?? 0) / glyph.scale} /></g>
        </g>
      })}
    </g>
  </svg>
}
