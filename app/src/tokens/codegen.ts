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

export function buildCSSProps(node: SceneElement, tokens: readonly DesignToken[] = []): CSSProp[] {
  const props: CSSProp[] = []

  props.push({ property: 'position', value: 'absolute' })
  props.push({ property: 'left', value: `${node.x}px` })
  props.push({ property: 'top', value: `${node.y}px` })
  props.push({ property: 'width', value: `${node.width}px` })
  props.push({ property: 'height', value: `${node.height}px` })

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
      props.push({ property: 'background-color', value: raw, token })
    }
  }

  if ('cornerRadius' in node && (node.cornerRadius > 0 || node.tokenBindings?.cornerRadius)) {
    props.push({ property: 'border-radius', value: `${node.cornerRadius}px` })
  }

  if (node.style.stroke) {
    const { color, width } = node.style.stroke
    props.push({ property: 'border', value: `${width}px solid ${color}` })
  }

  if (node.style.shadow) {
    const { x, y, blur, color } = node.style.shadow
    props.push({ property: 'box-shadow', value: `${x}px ${y}px ${blur}px ${hexToRgba(color)}` })
  }

  if (node.type === 'text') {
    const t = node as TextElement
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

  const properties: Partial<Record<string, TokenProperty>> = { left: 'x', top: 'y', width: 'width', height: 'height', color: 'fill', 'background-color': 'fill', border: 'stroke', 'border-radius': 'cornerRadius', 'font-family': 'fontFamily', 'font-size': 'fontSize', 'font-weight': 'fontWeight', 'line-height': 'lineHeight', 'letter-spacing': 'letterSpacing' }
  return props.map(prop => {
    const property = properties[prop.property]
    const token = property ? boundToken(node, property, tokens) : undefined
    if (!token) return prop
    const variable = tokenVariable(token)
    return { ...prop, value: prop.property === 'border' ? `${node.style.stroke!.width}px ${node.style.stroke!.dash.length ? 'dashed' : 'solid'} var(${variable})` : `var(${variable})`, token: variable }
  })
}

// ─── Tailwind generation ──────────────────────────────────────────────────────

function colorToTailwind(color: string, prefix: 'bg' | 'text' | 'border'): string {
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

export function buildTailwindClasses(node: SceneElement, tokens: readonly DesignToken[] = []): string {
  const classes: string[] = ['absolute']
  const bindingClass = (property: TokenProperty) => { const token = boundToken(node, property, tokens); return token ? tokenClass(token, property, node.type === 'text', tokens) : undefined }
  for (const property of ['x', 'y', 'width', 'height'] as const) { const name = bindingClass(property); if (name) classes.push(name) }

  if (node.style.opacity !== 1) {
    const pct = Math.round(node.style.opacity * 100)
    classes.push(`opacity-${pct}`)
  }

  if (node.style.fill !== null && node.type !== 'text') {
    classes.push(bindingClass('fill') ?? colorToTailwind(node.style.fill, 'bg'))
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
    classes.push('border')
    if (width !== 1) classes.push(`border-[${width}px]`)
    classes.push(bindingClass('stroke') ?? colorToTailwind(node.style.stroke.color, 'border'))
  }

  if (node.style.shadow) {
    const { x, y, blur } = node.style.shadow
    if (x === 0 && y === 2 && blur === 4) classes.push('shadow-sm')
    else if (x === 0 && y === 4 && blur === 8) classes.push('shadow')
    else if (x === 0 && y === 4 && blur === 16) classes.push('shadow-md')
    else classes.push(`shadow-[${x}px_${y}px_${blur}px]`)
  }

  if (node.type === 'text') {
    const t = node as TextElement
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

export function buildReactComponent(node: SceneElement, tokens: readonly DesignToken[] = []): string {
  const name = elementToComponentName(node)
  const tw = buildTailwindClasses(node, tokens)
  const geometryStyle = ['x', 'y', 'width', 'height'].filter(property => !node.tokenBindings?.[property as TokenProperty]).map(property => `${property === 'x' ? 'left' : property === 'y' ? 'top' : property}: ${node[property as 'x' | 'y' | 'width' | 'height']}`)
  if (node.rotation !== 0) geometryStyle.push(`transform: 'rotate(${node.rotation}deg)'`)
  if (node.type === 'text' && !node.tokenBindings?.fontFamily) geometryStyle.push(`fontFamily: ${JSON.stringify(node.fontFamily)}`)
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
    return `export function ${name}({ children }: { children?: React.ReactNode }) {\n  return (\n    <div\n      className="${tw}"${styleAttribute}\n    >\n      {children}\n    </div>\n  )\n}`
  }

  if (node.type === 'ellipse') {
    return `export function ${name}() {\n  return (\n    <div\n      className="${tw} rounded-full"${styleAttribute}\n    />\n  )\n}`
  }

  return `export function ${name}() {\n  return (\n    <div\n      className="${tw}"${styleAttribute}\n    />\n  )\n}`
}

