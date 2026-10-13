import type { DesignToken, TokenInput } from './types.ts'
import { tokenVariable } from './model.ts'

/** Optional document foundations. Existing tokens are reused, never overwritten. */
export function foundationTokens(existing: readonly DesignToken[]): TokenInput[] {
  const definitions: (TokenInput & { aliasName?: string })[] = [
    { type: 'color', name: 'paper', value: '#edebe1', palette: 'Paper' },
    { type: 'color', name: 'ink', value: '#080808', palette: 'Paper' },
    { type: 'color', name: 'blue', value: '#81adec', palette: 'Paper' },
    { type: 'color', name: 'charcoal', value: '#222222', palette: 'Paper' },
    { type: 'color', name: 'surface', value: '#edebe1', aliasName: 'paper', palette: 'Semantic' },
    { type: 'color', name: 'content', value: '#080808', aliasName: 'ink', palette: 'Semantic' },
    { type: 'color', name: 'action', value: '#81adec', aliasName: 'blue', palette: 'Semantic' },
    { type: 'fontFamily', name: 'sans', value: 'Inter, sans-serif' },
    ...[['caption', 12], ['small', 14], ['body', 16], ['heading', 24], ['display', 48]].map(([name, value]) => ({ type: 'fontSize' as const, name: name as string, value: value as number })),
    { type: 'fontWeight', name: 'regular', value: 400 },
    { type: 'fontWeight', name: 'medium', value: 500 },
    { type: 'lineHeight', name: 'body', value: 1.5 },
    { type: 'lineHeight', name: 'heading', value: 1.2 },
    { type: 'elevation', name: 'flat', value: 0 },
    { type: 'elevation', name: 'raised', value: 4 },
    { type: 'elevation', name: 'floating', value: 12 },
  ]
  const ids = new Map(existing.map(token => [tokenVariable(token), token.id]))
  const result: TokenInput[] = []
  for (const definition of definitions) {
    const variable = tokenVariable(definition)
    if (ids.has(variable)) continue
    const { aliasName, ...input } = definition
    const id = crypto.randomUUID()
    ids.set(variable, id)
    result.push({ ...input, id, ...(aliasName ? { aliasId: ids.get(tokenVariable({ type: definition.type, name: aliasName })) } : {}) } as TokenInput)
  }
  return result
}
