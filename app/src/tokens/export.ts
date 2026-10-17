import { resolveTokens } from './library.ts'
import { TOKEN_META, tokenCSSValue, tokenVariable } from './model.ts'
import type { DesignToken, StyleLibrary, TokenType } from './types.ts'

export type TokenExportFormat = 'tailwind-v4' | 'tailwind-v3' | 'css-variables' | 'dtcg-json'

/**
 * Categorizes tokens by primary design system types: color, typography, spacing, radius, elevation, layout.
 */
export function groupTokensByType(tokens: readonly DesignToken[]): Record<string, DesignToken[]> {
  const groups: Record<string, DesignToken[]> = {
    color: [],
    typography: [],
    spacing: [],
    radius: [],
    elevation: [],
    layout: [],
  }

  const typographyTypes: TokenType[] = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']

  for (const token of tokens) {
    if (token.type === 'color') {
      groups.color.push(token)
    } else if (typographyTypes.includes(token.type)) {
      groups.typography.push(token)
    } else if (token.type === 'spacing') {
      groups.spacing.push(token)
    } else if (token.type === 'radius') {
      groups.radius.push(token)
    } else if (token.type === 'elevation') {
      groups.elevation.push(token)
    } else {
      groups.layout.push(token)
    }
  }

  return groups
}

/**
 * Exports design tokens to Tailwind CSS v4 `@theme` configuration with multi-mode layers.
 */
export function exportToTailwindV4(tokens: readonly DesignToken[], library: StyleLibrary): string {
  const tokenMap = new Map(tokens.map(t => [t.id, t]))
  const groups = groupTokensByType(tokens)

  const formatDecl = (token: DesignToken) => {
    const v = tokenVariable(token)
    const val = token.aliasId && tokenMap.has(token.aliasId)
      ? `var(${tokenVariable(tokenMap.get(token.aliasId)!)})`
      : tokenCSSValue(token)
    return `  ${v}: ${val};`
  }

  const sections: string[] = []

  // Main @theme block
  sections.push('@theme {')
  if (groups.color.length) {
    sections.push('  /* --- Color Variables --- */')
    for (const t of groups.color) sections.push(formatDecl(t))
  }
  if (groups.typography.length) {
    sections.push('\n  /* --- Typography Variables --- */')
    for (const t of groups.typography) sections.push(formatDecl(t))
  }
  if (groups.spacing.length) {
    sections.push('\n  /* --- Spacing Variables --- */')
    for (const t of groups.spacing) sections.push(formatDecl(t))
  }
  if (groups.radius.length) {
    sections.push('\n  /* --- Border Radius Variables --- */')
    for (const t of groups.radius) sections.push(formatDecl(t))
  }
  if (groups.elevation.length) {
    sections.push('\n  /* --- Elevation Variables --- */')
    for (const t of groups.elevation) sections.push(formatDecl(t))
  }
  if (groups.layout.length) {
    sections.push('\n  /* --- Container & Breakpoint Variables --- */')
    for (const t of groups.layout) sections.push(formatDecl(t))
  }
  sections.push('}')

  // Multi-mode theme variant overrides in @layer base
  if (library.themes.length > 0) {
    sections.push('\n@layer base {')
    for (const theme of library.themes) {
      const modeTokens = resolveTokens(tokens, theme.id)
      const overridden = modeTokens.filter(t => {
        const baseVal = tokens.find(b => b.id === t.id)?.value
        const isExplicit = t.themeValues && Object.hasOwn(t.themeValues, theme.id)
        return isExplicit || t.value !== baseVal
      })

      if (overridden.length > 0) {
        const themeSlug = theme.id.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
        const selector = themeSlug === 'dark'
          ? '[data-theme="dark"], [data-paper-theme="dark"], .dark'
          : themeSlug === 'high-contrast'
            ? '[data-theme="high-contrast"], [data-paper-theme="high-contrast"], .high-contrast'
            : `[data-theme="${themeSlug}"], [data-paper-theme="${themeSlug}"], .theme-${themeSlug}`

        sections.push(`  /* Mode: ${theme.name} */`)
        sections.push(`  ${selector} {`)
        for (const t of overridden) {
          sections.push(`    ${tokenVariable(t)}: ${tokenCSSValue(t)};`)
        }
        sections.push('  }\n')
      }
    }
    sections.push('}')
  }

  return sections.join('\n')
}

/**
 * Exports design tokens to Tailwind CSS v3 `tailwind.config.js` theme extension file.
 */
export function exportToTailwindV3(tokens: readonly DesignToken[], _library?: StyleLibrary): string {
  const groups = groupTokensByType(tokens)

  const toJsObj = (items: DesignToken[], valTransform?: (t: DesignToken) => string) => {
    const lines = items.map(t => {
      const key = t.name.includes('-') ? `'${t.name}'` : t.name
      const val = valTransform ? valTransform(t) : `'var(${tokenVariable(t)})'`
      return `        ${key}: ${val},`
    })
    return lines.join('\n')
  }

  const parts: string[] = []
  parts.push(`/** @type {import('tailwindcss').Config} */`)
  parts.push(`module.exports = {`)
  parts.push(`  darkMode: ['class', '[data-theme="dark"]'],`)
  parts.push(`  theme: {`)
  parts.push(`    extend: {`)

  if (groups.color.length) {
    parts.push(`      colors: {\n${toJsObj(groups.color)}\n      },`)
  }

  const fontFamilies = groups.typography.filter(t => t.type === 'fontFamily')
  if (fontFamilies.length) {
    parts.push(`      fontFamily: {\n${toJsObj(fontFamilies, t => `['var(${tokenVariable(t)})', 'sans-serif']`)}\n      },`)
  }

  const fontSizes = groups.typography.filter(t => t.type === 'fontSize')
  if (fontSizes.length) {
    parts.push(`      fontSize: {\n${toJsObj(fontSizes)}\n      },`)
  }

  if (groups.spacing.length) {
    parts.push(`      spacing: {\n${toJsObj(groups.spacing)}\n      },`)
  }

  if (groups.radius.length) {
    parts.push(`      borderRadius: {\n${toJsObj(groups.radius)}\n      },`)
  }

  parts.push(`    },`)
  parts.push(`  },`)
  parts.push(`  plugins: [],`)
  parts.push(`}`)

  return parts.join('\n')
}

/**
 * Exports design tokens to a pure CSS custom properties stylesheet (`:root` and multi-mode theme rules).
 */
export function exportToCSSVariables(tokens: readonly DesignToken[], library: StyleLibrary): string {
  const tokenMap = new Map(tokens.map(t => [t.id, t]))
  const groups = groupTokensByType(tokens)

  const formatDecl = (token: DesignToken) => {
    const v = tokenVariable(token)
    const val = token.aliasId && tokenMap.has(token.aliasId)
      ? `var(${tokenVariable(tokenMap.get(token.aliasId)!)})`
      : tokenCSSValue(token)
    return `  ${v}: ${val};`
  }

  const lines: string[] = []
  lines.push('/* ==========================================================================')
  lines.push('   Paper Design System — Variable Tokens')
  lines.push('   Built with Paper (https://github.com/paper-design/paper)')
  lines.push('   ========================================================================== */\n')

  lines.push(':root {')
  if (groups.color.length) {
    lines.push('  /* --- Colors --- */')
    for (const t of groups.color) lines.push(formatDecl(t))
  }
  if (groups.typography.length) {
    lines.push('\n  /* --- Typography --- */')
    for (const t of groups.typography) lines.push(formatDecl(t))
  }
  if (groups.spacing.length) {
    lines.push('\n  /* --- Spacing --- */')
    for (const t of groups.spacing) lines.push(formatDecl(t))
  }
  if (groups.radius.length) {
    lines.push('\n  /* --- Radius --- */')
    for (const t of groups.radius) lines.push(formatDecl(t))
  }
  if (groups.elevation.length) {
    lines.push('\n  /* --- Elevation --- */')
    for (const t of groups.elevation) lines.push(formatDecl(t))
  }
  if (groups.layout.length) {
    lines.push('\n  /* --- Layout & Breakpoints --- */')
    for (const t of groups.layout) lines.push(formatDecl(t))
  }
  lines.push('}\n')

  // Theme modes
  for (const theme of library.themes) {
    const modeTokens = resolveTokens(tokens, theme.id)
    const overridden = modeTokens.filter(t => {
      const baseVal = tokens.find(b => b.id === t.id)?.value
      const isExplicit = t.themeValues && Object.hasOwn(t.themeValues, theme.id)
      return isExplicit || t.value !== baseVal
    })

    if (overridden.length > 0) {
      const themeSlug = theme.id.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
      lines.push(`/* Mode: ${theme.name} */`)
      lines.push(`[data-theme="${themeSlug}"], [data-paper-theme="${themeSlug}"], .theme-${themeSlug} {`)
      for (const t of overridden) {
        lines.push(`  ${tokenVariable(t)}: ${tokenCSSValue(t)};`)
      }
      lines.push('}\n')
    }
  }

  return lines.join('\n')
}

/**
 * Exports design tokens to W3C Design Tokens Community Group (DTCG) standard JSON format.
 */
export function exportToDTCGJson(tokens: readonly DesignToken[], library: StyleLibrary): string {
  const tokenMap = new Map(tokens.map(t => [t.id, t]))

  const dtcgType = (type: TokenType): string => {
    switch (type) {
      case 'color': return 'color'
      case 'fontFamily': return 'fontFamily'
      case 'fontSize': return 'dimension'
      case 'fontWeight': return 'fontWeight'
      case 'lineHeight': return 'number'
      case 'letterSpacing': return 'dimension'
      case 'radius': return 'dimension'
      case 'spacing': return 'dimension'
      case 'elevation': return 'dimension'
      case 'container': return 'dimension'
      case 'breakpoint': return 'dimension'
    }
  }

  const dtcgValue = (token: DesignToken): string | number => {
    if (token.aliasId && tokenMap.has(token.aliasId)) {
      const target = tokenMap.get(token.aliasId)!
      return `{${TOKEN_META[target.type].namespace}.${target.name}}`
    }
    return token.type === 'color' || token.type === 'fontFamily'
      ? token.value
      : tokenCSSValue(token)
  }

  const root: Record<string, any> = {
    $schema: 'https://design-tokens.github.io/community-group/format/',
    name: 'Paper Design System Variables',
  }

  for (const token of tokens) {
    const ns = TOKEN_META[token.type].namespace
    root[ns] ??= {}
    root[ns][token.name] = {
      $type: dtcgType(token.type),
      $value: dtcgValue(token),
      ...(token.palette ? { $description: `Palette: ${token.palette}` } : {}),
    }
  }

  // Include mode overrides
  if (library.themes.length > 0) {
    root.$modes = {}
    for (const theme of library.themes) {
      const modeTokens = resolveTokens(tokens, theme.id)
      const overrides: Record<string, any> = {}
      for (const t of modeTokens) {
        if (t.themeValues && Object.hasOwn(t.themeValues, theme.id)) {
          const ns = TOKEN_META[t.type].namespace
          overrides[ns] ??= {}
          overrides[ns][t.name] = t.type === 'color' || t.type === 'fontFamily' ? t.value : tokenCSSValue(t)
        }
      }
      if (Object.keys(overrides).length > 0) {
        root.$modes[theme.id] = {
          name: theme.name,
          overrides,
        }
      }
    }
  }

  return JSON.stringify(root, null, 2)
}

/**
 * Triggers a client-side file download for exported design tokens.
 */
export function downloadTokenFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Copies text content to clipboard with fallback.
 */
export async function copyTokensToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fallback below
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)
    return successful
  } catch {
    return false
  }
}
