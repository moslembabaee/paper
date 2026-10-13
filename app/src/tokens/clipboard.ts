import type { SceneStore } from '../scene/store.ts'
import { TOKEN_META, tokenVariable, validateToken } from './model.ts'
import type { DesignToken, TokenType } from './types.ts'

const namespaces = (Object.keys(TOKEN_META) as TokenType[]).sort((a, b) => TOKEN_META[b].namespace.length - TOKEN_META[a].namespace.length)

/** CSS is the interchange format for both codebases and other Paper files. */
export function pasteTokenCSS(store: SceneStore, source: string): number {
  if (!/^\s*(?::root|@theme(?:\s+static)?)\s*\{/.test(source)) return 0
  const names = new Set(store.getSnapshot().tokens.map(tokenVariable))
  const imported: DesignToken[] = []
  for (const [, variable, raw] of source.matchAll(/--([a-z][a-z0-9-]*)\s*:\s*([^;{}]*);/g)) {
    const type = namespaces.find(key => variable.startsWith(`${TOKEN_META[key].namespace}-`))
    if (!type) continue
    if (!raw.trim()) throw new Error('Enter a token value.')
    const originalName = variable.slice(TOKEN_META[type].namespace.length + 1)
    let name = originalName, index = 2
    const value = type === 'color' || type === 'fontFamily' ? raw.trim() : Number(raw.trim().replace(/px$/, ''))
    const draft = { id: crypto.randomUUID(), type, name, value } as DesignToken
    validateToken(draft)
    while (names.has(tokenVariable({ ...draft, name }))) name = `${originalName}-${index++}`
    const token = { ...draft, name }
    names.add(tokenVariable(token))
    imported.push(token)
  }
  store.addTokens(imported)
  return imported.length
}
