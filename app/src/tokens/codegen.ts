import { effectsCSS, effectFilterMarkup } from './effects.ts'
import { frameMask, maskPathData, maskFillRule } from '../scene/maskGeometry.ts'
import type { SceneElement, TextElement } from '../scene/types.ts'
import { boundToken, tokenClass, tokenVariable } from './model.ts'
import type { DesignToken, TokenProperty } from './types.ts'

// ─── CSS generation ──────────────────────────────────────────────────────────

function hexToRgba(color: string): string {
  const hex = color.replace('#', '')
  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const a = (parseInt(hex.slice(6, 8), 16) / 255).toFixed(2)
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgb(${r}, ${g}, ${b})`
  }
  return color
}

export interface CSSProp { property: string; value: string; token?: string }

export function buildCSSProps(node: SceneElement, tokens: readonly DesignToken[] = [], parent?: SceneElement): CSSProp[] {
  const props: CSSProp[] = []
  const parentLayout = parent?.type === 'frame' ? parent.layout : null
  props.push({ property: 'position', value: parentLayout ? 'relative' : 'absolute' })
  if (!parentLayout) props.push({ property: 'left', value: `${node.x}px` }, { property: 'top', value: `${node.y}px` })
  if (parentLayout) props.push({ property: 'flex-shrink', value: '0' })
  for (const axis of ['width', 'height'] as const) {
    const rule = node.sizing?.[axis] ?? 'fixed'
    const main = parentLayout && (parentLayout.direction === 'horizontal' ? axis === 'width' : axis === 'height')
    const fills = rule === 'fill' && parentLayout && parent?.sizing?.[axis] !== 'hug'
    const wrappedCrossFill = fills && !main && parentLayout?.wrap && parentLayout.wrap !== 'nowrap'
    props.push({ property: axis, value: rule === 'hug' ? axis === 'width' ? 'max-content' : 'auto' : fills ? main ? '0px' : wrappedCrossFill ? 'auto' : '100%' : `${node[axis]}px` })
    if (wrappedCrossFill) props.push({ property: 'align-self', value: 'stretch' }, { property: `min-${axis}`, value: '0.01px' })
    if (fills && main) props.push({ property: 'flex', value: '1 1 0px' }, { property: `min-${axis}`, value: '0.01px' })
  }
  if (node.type === 'frame' && node.layout) {
    const { direction, gap, padding, justify, align } = node.layout
    props.push({ property: 'display', value: 'flex' }, { property: 'box-sizing', value: 'border-box' }, { property: 'flex-direction', value: direction === 'horizontal' ? 'row' : 'column' }, { property: 'gap', value: `${gap}px` }, { property: 'padding', value: `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px` }, { property: 'justify-content', value: justify === 'start' || justify === 'end' ? `flex-${justify}` : justify }, { property: 'align-items', value: align === 'start' || align === 'end' ? `flex-${align}` : align })
    props.push({ property: 'flex-wrap', value: node.layout.wrap ?? 'nowrap' }, { property: 'align-content', value: node.layout.alignContent === 'start' || node.layout.alignContent === 'end' || !node.layout.alignContent ? `flex-${node.layout.alignContent ?? 'start'}` : node.layout.alignContent })
  }

  if (node.rotation !== 0) {
    props.push({ property: 'transform', value: `rotate(${node.rotation}deg)` })
  }

  if (node.style.opacity !== 1) {
    props.push({ property: 'opacity', value: String(node.style.opacity) })
  }

  if (node.style.fill !== null) {
    const raw = node.style.fill
    const token = boundToken(node, 'fill', tokens) ? tokenVariable(boundToken(node, 'fill', tokens)!) : undefined
    if (node.type === 'text') {
      props.push({ property: 'color', value: raw, token })
    } else {
      props.push({ property: node.type === 'path' ? 'fill' : 'background-color', value: raw, token })
    }
  } else if (node.type === 'path') props.push({ property: 'fill', value: 'none' })

  if ('cornerRadius' in node && (node.cornerRadius > 0 || node.tokenBindings?.cornerRadius)) {
    props.push({ property: 'border-radius', value: `${node.cornerRadius}px` })
  }

  if (node.style.stroke) {
    const { color, width } = node.style.stroke
    if (node.type === 'path') {
      props.push({ property: 'stroke', value: color }, { property: 'stroke-width', value: String(width) })
      if (node.style.stroke.dash.length) props.push({ property: 'stroke-dasharray', value: node.style.stroke.dash.join(' ') })
    } else props.push({ property: 'border', value: `${width}px solid ${color}` })
  }

  if (node.style.effects?.length) {
    const effects = effectsCSS(node.style.effects)
    if (effects.boxShadow) props.push({ property: 'box-shadow', value: effects.boxShadow })
    if (effects.filter) props.push({ property: 'filter', value: effects.filter })
  }
  if (node.style.shadow && !node.style.effects?.some(effect => effect.enabled)) {
    const { x, y, blur, color } = node.style.shadow
    props.push(node.type === 'path'
      ? { property: 'filter', value: `drop-shadow(${x}px ${y}px ${blur / 2}px ${hexToRgba(color)})` }
      : { property: 'box-shadow', value: `${x}px ${y}px ${blur}px ${hexToRgba(color)}` })
  }

  if (node.type === 'text') {
    const t = node as TextElement
    props.push({ property: 'margin', value: '0' }, { property: 'white-space', value: 'pre-wrap' }, { property: 'overflow-wrap', value: 'break-word' })
    props.push({ property: 'font-family', value: t.fontFamily })
    props.push({ property: 'font-size', value: `${t.fontSize}px` })
    props.push({ property: 'font-weight', value: String(t.fontWeight) })
    props.push({ property: 'line-height', value: String(t.lineHeight) })
    if (t.letterSpacing !== 0 || node.tokenBindings?.letterSpacing) props.push({ property: 'letter-spacing', value: `${t.letterSpacing}px` })
    if (t.textAlign !== 'left') props.push({ property: 'text-align', value: t.textAlign })
  }

  if (node.type === 'frame' && node.clipContent) {
    props.push({ property: 'overflow', value: 'hidden' })
  }

  const properties: Partial<Record<string, TokenProperty>> = { left: 'x', top: 'y', width: 'width', height: 'height', fill: 'fill', stroke: 'stroke', color: 'fill', 'background-color': 'fill', border: 'stroke', 'border-radius': 'cornerRadius', 'font-family': 'fontFamily', 'font-size': 'fontSize', 'font-weight': 'fontWeight', 'line-height': 'lineHeight', 'letter-spacing': 'letterSpacing' }
  return props.map(prop => {
    const property = properties[prop.property]
    if ((property === 'width' || property === 'height') && node.sizing?.[property] && node.sizing[property] !== 'fixed') return prop
    const token = property ? boundToken(node, property, tokens) : undefined
    if (!token) return prop
    const variable = tokenVariable(token)
    return { ...prop, value: prop.property === 'border' ? `${node.style.stroke!.width}px ${node.style.stroke!.dash.length ? 'dashed' : 'solid'} var(${variable})` : `var(${variable})`, token: variable }
  })
}

// ─── Tailwind generation ──────────────────────────────────────────────────────

function colorToTailwind(color: string, prefix: 'bg' | 'text' | 'border' | 'fill' | 'stroke'): string {
  const map: Record<string, string> = {
    '#080808': `${prefix}-neutral-950`,
    '#edebe1': `${prefix}-[#edebe1]`,
    '#81adec': `${prefix}-blue-300`,
    '#4c8eef': `${prefix}-blue-500`,
    '#222222': `${prefix}-neutral-900`,
    '#f5f4ee': `${prefix}-[#f5f4ee]`,
    '#ffffff': `${prefix}-white`,
    '#000000': `${prefix}-black`,
  }
  return map[color.toLowerCase()] ?? `${prefix}-[${color}]`
}

export function buildTailwindClasses(node: SceneElement, tokens: readonly DesignToken[] = [], parent?: SceneElement): string {
  const parentLayout = parent?.type === 'frame' ? parent.layout : null
  const classes: string[] = [parentLayout ? 'relative' : 'absolute']
  if (parentLayout) classes.push('shrink-0')
  const bindingClass = (property: TokenProperty) => { const token = boundToken(node, property, tokens); return token ? tokenClass(token, property, node.type === 'text', tokens) : undefined }
  for (const property of ['x', 'y', 'width', 'height'] as const) {
    if ((property === 'x' || property === 'y') && parentLayout) continue
    if ((property === 'width' || property === 'height') && node.sizing?.[property] && node.sizing[property] !== 'fixed') continue
    const name = bindingClass(property); if (name) classes.push(name)
  }
  for (const axis of ['width', 'height'] as const) {
    const prefix = axis === 'width' ? 'w' : 'h', rule = node.sizing?.[axis]
    const main = parentLayout && (parentLayout.direction === 'horizontal' ? axis === 'width' : axis === 'height')
    if (rule === 'hug') classes.push(`${prefix}-${axis === 'width' ? 'max' : 'auto'}`)
    if (rule === 'fill' && parentLayout && parent?.sizing?.[axis] !== 'hug') classes.push(...(main ? ['flex-1', `${prefix}-0`, `min-${prefix}-[0.01px]`] : parentLayout.wrap && parentLayout.wrap !== 'nowrap' ? [`${prefix}-auto`, 'self-stretch', `min-${prefix}-[0.01px]`] : [`${prefix}-full`]))
  }
  if (node.type === 'frame' && node.layout) {
    const { direction, gap, padding, justify, align } = node.layout
    classes.push('flex', 'box-border', direction === 'horizontal' ? 'flex-row' : 'flex-col', `gap-[${gap}px]`, `pt-[${padding.top}px]`, `pr-[${padding.right}px]`, `pb-[${padding.bottom}px]`, `pl-[${padding.left}px]`, `justify-${justify === 'space-between' ? 'between' : justify}`, `items-${align}`)
    classes.push(node.layout.wrap === 'wrap' ? 'flex-wrap' : node.layout.wrap === 'wrap-reverse' ? 'flex-wrap-reverse' : 'flex-nowrap', `content-${node.layout.alignContent === 'space-between' ? 'between' : node.layout.alignContent ?? 'start'}`)
  }

  if (node.style.opacity !== 1) {
    const pct = Math.round(node.style.opacity * 100)
    classes.push(`opacity-${pct}`)
  }

  if (node.style.fill !== null && node.type !== 'text') {
    const token = boundToken(node, 'fill', tokens)
    classes.push(node.type === 'path' ? token ? `fill-[var(${tokenVariable(token)})]` : colorToTailwind(node.style.fill, 'fill') : bindingClass('fill') ?? colorToTailwind(node.style.fill, 'bg'))
  }

  if (node.style.fill !== null && node.type === 'text') {
    classes.push(bindingClass('fill') ?? colorToTailwind(node.style.fill, 'text'))
  }

  if ('cornerRadius' in node && (node.cornerRadius > 0 || node.tokenBindings?.cornerRadius)) {
    const r = node.cornerRadius
    if (bindingClass('cornerRadius')) classes.push(bindingClass('cornerRadius')!)
    else if (r === 2) classes.push('rounded-sm')
    else if (r === 4) classes.push('rounded')
    else if (r === 6) classes.push('rounded-md')
    else if (r === 8) classes.push('rounded-lg')
    else if (r === 12) classes.push('rounded-xl')
    else if (r === 16) classes.push('rounded-2xl')
    else if (r === 9999 || r >= 9999) classes.push('rounded-full')
    else classes.push(`rounded-[${r}px]`)
  }

  if (node.style.stroke) {
    const { width } = node.style.stroke
    if (node.type === 'path') {
      const token = boundToken(node, 'stroke', tokens)
      classes.push(token ? `stroke-[var(${tokenVariable(token)})]` : colorToTailwind(node.style.stroke.color, 'stroke'), `[stroke-width:${width}]`)
    } else {
      classes.push('border')
      if (width !== 1) classes.push(`border-[${width}px]`)
      classes.push(bindingClass('stroke') ?? colorToTailwind(node.style.stroke.color, 'border'))
    }
  }

  for (const prop of buildCSSProps(node, tokens, parent).filter(prop => ['box-shadow', 'filter'].includes(prop.property) && node.style.effects?.length)) classes.push(`[${prop.property}:${prop.value.replace(/ /g, '_')}]`)

  if (node.style.shadow && !node.style.effects?.some(effect => effect.enabled)) {
    const { x, y, blur } = node.style.shadow
    if (node.type === 'path') classes.push(`drop-shadow-[${x}px_${y}px_${blur / 2}px_${node.style.shadow.color}]`)
    else if (x === 0 && y === 2 && blur === 4) classes.push('shadow-sm')
    else if (x === 0 && y === 4 && blur === 8) classes.push('shadow')
    else if (x === 0 && y === 4 && blur === 16) classes.push('shadow-md')
    else classes.push(`shadow-[${x}px_${y}px_${blur}px]`)
  }

  if (node.type === 'text') {
    const t = node as TextElement
    classes.push('m-0', 'whitespace-pre-wrap', '[overflow-wrap:break-word]')
    const fsSizes: Record<number, string> = { 10: 'text-xs', 12: 'text-sm', 14: 'text-sm', 16: 'text-base', 18: 'text-lg', 20: 'text-xl', 24: 'text-2xl', 30: 'text-3xl', 36: 'text-4xl', 48: 'text-5xl', 57: 'text-[57px]', 60: 'text-6xl', 72: 'text-7xl' }
    classes.push(bindingClass('fontSize') ?? fsSizes[t.fontSize] ?? `text-[${t.fontSize}px]`)
    const fwMap: Record<number, string> = { 100: 'font-thin', 200: 'font-extralight', 300: 'font-light', 400: 'font-normal', 500: 'font-medium', 600: 'font-semibold', 700: 'font-bold', 800: 'font-extrabold', 900: 'font-black' }
    const fw = fwMap[t.fontWeight]
    if (bindingClass('fontWeight')) classes.push(bindingClass('fontWeight')!)
    else if (fw && t.fontWeight !== 400) classes.push(fw)
    if (bindingClass('fontFamily')) classes.push(bindingClass('fontFamily')!)
    classes.push(bindingClass('lineHeight') ?? `leading-[${t.lineHeight}]`)
    if (t.letterSpacing !== 0 || bindingClass('letterSpacing')) classes.push(bindingClass('letterSpacing') ?? `tracking-[${t.letterSpacing}px]`)
    if (t.textAlign === 'center') classes.push('text-center')
    if (t.textAlign === 'right') classes.push('text-right')
  }

  if (node.type === 'frame' && node.clipContent) {
    classes.push('overflow-hidden')
  }

  return classes.join(' ')
}

// ─── React component code gen ─────────────────────────────────────────────────

export function elementToComponentName(node: SceneElement): string {
  const name = node.name.replace(/[^a-zA-Z0-9]/g, '') || node.type
  return `${/^[a-zA-Z]/.test(name) ? '' : 'Paper'}${name[0].toUpperCase()}${name.slice(1)}`
}

export function buildReactComponent(node: SceneElement, tokens: readonly DesignToken[] = [], parent?: SceneElement, elements?: Readonly<Record<string, SceneElement>>): string {
  const name = elementToComponentName(node)
  const tw = buildTailwindClasses(node, tokens, parent)
  const parentLayout = parent?.type === 'frame' ? parent.layout : null
  const geometryStyle = (['x', 'y', 'width', 'height'] as const).filter(property => {
    if ((property === 'x' || property === 'y') && parentLayout) return false
    if ((property === 'width' || property === 'height') && (node.sizing?.[property] === 'hug' || (node.sizing?.[property] === 'fill' && parentLayout && parent?.sizing?.[property] !== 'hug'))) return false
    return !node.tokenBindings?.[property]
  }).map(property => `${property === 'x' ? 'left' : property === 'y' ? 'top' : property}: ${node[property]}`)
  if (node.rotation !== 0) geometryStyle.push(`transform: 'rotate(${node.rotation}deg)'`)
  if (node.type === 'text' && !node.tokenBindings?.fontFamily) geometryStyle.push(`fontFamily: ${JSON.stringify(node.fontFamily)}`)
  if (node.style.effects?.some(effect => effect.enabled) && node.type !== 'path') {
    const effects = effectsCSS(node.style.effects)
    if (effects.boxShadow) geometryStyle.push(`boxShadow: ${JSON.stringify(effects.boxShadow)}`)
    if (effects.filter) geometryStyle.push(`filter: ${JSON.stringify(effects.filter)}`)
  }
  const inlineStyle = geometryStyle.length ? `{{ ${geometryStyle.join(', ')} }}` : null
  const styleAttribute = inlineStyle ? `\n      style=${inlineStyle}` : ''

  if (node.type === 'text') {
    const t = node as TextElement
    const tag = t.fontSize >= 36 ? 'h2' : t.fontSize >= 24 ? 'h3' : 'p'
    if (inlineStyle) {
      return `export function ${name}() {\n  return (\n    <${tag}\n      className="${tw}"\n      style=${inlineStyle}\n    >\n      {${JSON.stringify(t.text)}}\n    </${tag}>\n  )\n}`
    }
    return `export function ${name}() {\n  return (\n    <${tag} className="${tw}">\n      {${JSON.stringify(t.text)}}\n    </${tag}>\n  )\n}`
  }

  if (node.type === 'image') {
    return `export function ${name}() {\n  return (\n    <div\n      className="${tw}"${styleAttribute}\n    >\n      <img\n        src="${node.src}"\n        alt="${node.alt}"\n        className="w-full h-full object-${node.fit}"\n      />\n    </div>\n  )\n}`
  }

  if (node.type === 'frame') {
    const mask = elements ? frameMask(elements, node) : undefined
    if (mask) {
      const layout = node.layout
      const clipLayoutStyle = layout ? `, display: 'flex', flexDirection: '${layout.direction === 'horizontal' ? 'row' : 'column'}', flexWrap: '${layout.wrap ?? 'nowrap'}', alignContent: '${layout.alignContent === 'start' || layout.alignContent === 'end' || !layout.alignContent ? `flex-${layout.alignContent ?? 'start'}` : layout.alignContent}', gap: ${layout.gap}, padding: '${layout.padding.top}px ${layout.padding.right}px ${layout.padding.bottom}px ${layout.padding.left}px', boxSizing: 'border-box', justifyContent: '${{ start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between' }[layout.justify]}', alignItems: '${{ start: 'flex-start', center: 'center', end: 'flex-end' }[layout.align]}'` : ''
      return `import { useId } from 'react'\n\nexport function ${name}({ children }: { children?: React.ReactNode }) {\n  const clipId = useId()\n  return (\n    <div\n      className="${tw}"${styleAttribute}\n    >\n      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>\n        <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse">\n          <path d={${JSON.stringify(maskPathData(mask))}} clipRule="${maskFillRule(mask)}" />\n        </clipPath></defs>\n      </svg>\n      <div style={{ position: 'absolute', inset: 0, clipPath: \`url(#\${clipId})\`${clipLayoutStyle} }}>\n        {children}\n      </div>\n    </div>\n  )\n}`
    }
    return `export function ${name}({ children }: { children?: React.ReactNode }) {\n  return (\n    <div\n      className="${tw}"${styleAttribute}\n    >\n      {children}\n    </div>\n  )\n}`
  }

  if (node.type === 'ellipse') {
    return `export function ${name}() {\n  return (\n    <div\n      className="${tw} rounded-full"${styleAttribute}\n    />\n  )\n}`
  }

  if (node.type === 'path') {
    const effectId = `paper-${node.id.replace(/[^a-zA-Z0-9-]/g, '')}-effects`
    const effectDefs = node.style.effects?.some(effect => effect.enabled) ? `<defs>${effectFilterMarkup(node.style.effects, effectId)}</defs>` : ''
    const fillToken = boundToken(node, 'fill', tokens), strokeToken = boundToken(node, 'stroke', tokens)
    const fill = fillToken ? `var(${tokenVariable(fillToken)})` : node.style.fill ?? 'none'
    const stroke = strokeToken ? `var(${tokenVariable(strokeToken)})` : node.style.stroke?.color ?? 'none'
    // A real SVG outline keeps compound holes and curves intact in handoff.
    return `export function ${name}() {\n  return (\n    <svg\n      className="${tw}"${styleAttribute}\n      viewBox="${node.viewBox.join(' ')}"\n      preserveAspectRatio="none"\n      overflow="visible"\n    >\n      ${effectDefs}\n      <path${effectDefs ? ` filter="url(#${effectId})"` : ''}\n        d={${JSON.stringify(node.d)}}\n        fillRule="${node.fillRule}"\n        fill={${JSON.stringify(fill)}}\n        stroke={${JSON.stringify(stroke)}}\n        strokeWidth={${node.style.stroke?.width ?? 0}}\n        strokeDasharray="${node.style.stroke?.dash.join(' ') ?? ''}"\n        strokeLinejoin="round"\n      />\n    </svg>\n  )\n}`
  }

  return `export function ${name}() {\n  return (\n    <div\n      className="${tw}"${styleAttribute}\n    />\n  )\n}`
}

