import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Plus, Search, Trash2, X } from 'lucide-react'
import { Dialog } from '../workspace/Dialog'
import type { SceneStore } from '../scene/store'
import { useScene } from '../scene/useScene'
import { TOKEN_META, tokenCSSValue, tokensToCSS, tokenVariable, validateToken } from './model'
import type { DesignToken, TokenInput, TokenType } from './types'
import './tokens.css'

const groups: { label: string; types: TokenType[] }[] = [
  { label: 'Color', types: ['color'] }, { label: 'Radius', types: ['radius'] },
  { label: 'Spacing', types: ['spacing'] },
  { label: 'Typography', types: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing'] },
  { label: 'Layout', types: ['container', 'breakpoint'] },
]

function TokenEditor({ store, token, initialType, onClose }: { store: SceneStore; token?: DesignToken; initialType: TokenType; onClose: () => void }) {
  const [type, setType] = useState<TokenType>(token?.type ?? initialType)
  const uniqueName = (nextType: TokenType) => {
    const base = TOKEN_META[nextType].namespace
    let index = 1
    while (store.getSnapshot().tokens.some(value => tokenVariable(value) === tokenVariable({ type: nextType, name: `${base}-${index}` }))) index++
    return `${base}-${index}`
  }
  const [name, setName] = useState(token?.name ?? uniqueName(initialType))
  const [value, setValue] = useState(String(token?.value ?? TOKEN_META[initialType].defaultValue))
  const [error, setError] = useState('')
  const id = useRef(token?.id ?? crypto.randomUUID())
  const persisted = useRef(!!token)
  const stringValue = type === 'color' || type === 'fontFamily'
  function save(close = false, nextValue = value) {
    try {
      if (!stringValue && !nextValue.trim()) throw new Error('Enter a numeric value.')
      const draft = { id: id.current, type, name: name.trim(), value: stringValue ? nextValue.trim() : Number(nextValue) } as DesignToken
      validateToken(draft)
      if (persisted.current) store.updateToken(id.current, { name: draft.name, value: draft.value })
      else { store.addToken(draft as TokenInput); persisted.current = true }
      setError('')
      if (close) onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save token') }
  }
  return <Dialog className="token-dialog" labelledBy="token-editor-title" onClose={() => save(true)}>
    <form onSubmit={event => { event.preventDefault(); save(true) }}>
      <div className="token-dialog-heading"><div><span className="section-caption">THEME / TOKENS</span><h2 id="token-editor-title">{token ? 'Edit token' : 'New token'}</h2></div><button type="button" className="quiet-button" aria-label="Save and close token" onClick={() => save(true)}><X size={16} /></button></div>
      <label className="property-label">Type<select className="property-input" aria-label="Token type" value={type} disabled={!!token} onChange={event => { const next = event.currentTarget.value as TokenType; setType(next); setName(uniqueName(next)); setValue(String(TOKEN_META[next].defaultValue)); setError('') }}>{(Object.keys(TOKEN_META) as TokenType[]).map(key => <option key={key} value={key}>{TOKEN_META[key].label}</option>)}</select></label>
      <label className="property-label">Name<input autoFocus className="property-input property-mono" aria-label="Token name" value={name} placeholder="brand-blue" spellCheck={false} onChange={event => setName(event.currentTarget.value)} onBlur={() => { if (persisted.current) save() }} /></label>
      <label className="property-label">Value<span className="token-value-input">{type === 'color' && <input aria-label="Token color picker" type="color" value={/^#[\da-f]{6}$/i.test(value) ? value : '#81adec'} onChange={event => { const next = event.currentTarget.value; setValue(next); if (persisted.current) save(false, next) }} />}<input className="property-input property-mono" aria-label="Token value" type={stringValue ? 'text' : 'number'} step="any" value={value} spellCheck={false} onChange={event => setValue(event.currentTarget.value)} onBlur={() => { if (persisted.current) save() }} />{TOKEN_META[type].unit && <span>{TOKEN_META[type].unit}</span>}</span></label>
      <code className="token-variable-preview">{tokenVariable({ type, name } as DesignToken)}</code>
      {error && <p className="token-error" role="alert">{error}</p>}
      <div className="token-dialog-footer"><span>Saves when you click away.</span><button type="button" className="token-cancel" onClick={onClose}>Cancel</button><button type="submit" className="token-primary"><Check size={13} />Done</button></div>
    </form>
  </Dialog>
}

export function ThemePanel({ store }: { store: SceneStore }) {
  const tokens = useScene(store, snapshot => snapshot.tokens)
  const elements = useScene(store, snapshot => snapshot.elements)
  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of Object.values(elements)) {
      for (const id of new Set(Object.values(node.tokenBindings ?? {}))) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return counts
  }, [elements])
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ token?: DesignToken; type: TokenType } | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [menu, setMenu] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  const shown = tokens.filter(token => `${token.name} ${TOKEN_META[token.type].label}`.toLowerCase().includes(search.toLowerCase()))
  const chosen = (id?: string) => tokens.filter(token => selected.includes(token.id) || (!selected.length && token.id === id))
  function copy(id?: string) {
    const values = chosen(id)
    if (!values.length) return
    navigator.clipboard.writeText(tokensToCSS(values)).then(() => setNotice(`Copied ${values.length} token${values.length === 1 ? '' : 's'}.`)).catch(() => setNotice('Clipboard unavailable. Use Dev Mode to select and copy the CSS.'))
    setMenu(null)
  }
  useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent) => { if (!(event.target as Element).closest('.token-context-menu')) setMenu(null) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])
  return <div className="theme-panel" ref={panel} data-testid="theme-panel" tabIndex={0} aria-label="Design tokens" onKeyDown={event => {
    if ((event.target as Element).closest('input, textarea, select')) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); event.stopPropagation(); setSelected(shown.map(token => token.id)) }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') { event.preventDefault(); copy() }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); store.removeTokens(selected); setSelected([]); setMenu(null) }
    if (event.key === 'Escape') { setMenu(null); setSelected([]) }
  }}>
    <div className="theme-intro"><span className="section-caption">DESIGN SYSTEM</span><h3>One value. Everywhere.</h3><p>A shared language for your canvas and code.</p></div>
    <div className="theme-tools"><label className="token-search"><Search size={12} /><input aria-label="Search tokens" placeholder="Find a token…" value={search} onChange={event => setSearch(event.currentTarget.value)} /></label><button className="quiet-button" aria-label="Add token" title="Add token" onClick={() => setEditor({ type: 'color' })}><Plus size={15} /></button></div>
    <div className="token-groups">{groups.map(group => {
      const values = shown.filter(token => group.types.includes(token.type))
      return <section className="token-group" key={group.label}><div className="token-group-heading"><span>{group.label}</span><span>{values.length}</span><button className="quiet-button" aria-label={`Add ${group.label.toLowerCase()} token`} onClick={() => setEditor({ type: group.types[0] })}><Plus size={12} /></button></div>
        {!values.length ? <span className="token-group-empty">{search ? 'No matching tokens' : `Add ${group.label.toLowerCase()} tokens`}</span> : values.map(token => {
          const uses = usage.get(token.id) ?? 0
          return <div key={token.id} className={`token-item ${selected.includes(token.id) ? 'selected' : ''}`} onContextMenu={event => { event.preventDefault(); if (!selected.includes(token.id)) setSelected([token.id]); setMenu(token.id) }}>
            <button className="token-item-button" title={`${tokenVariable(token)} · ${uses} bound layer${uses === 1 ? '' : 's'}`} onClick={event => {
              if (event.shiftKey || event.metaKey || event.ctrlKey) { setSelected(ids => ids.includes(token.id) ? ids.filter(id => id !== token.id) : [...ids, token.id]); return }
              setSelected([token.id]); setEditor({ token, type: token.type })
            }}>
              <span className={`token-preview token-preview-${token.type}`} style={token.type === 'color' ? { background: token.value } : token.type === 'radius' ? { borderRadius: Math.min(token.value, 10) } : token.type === 'fontFamily' ? { fontFamily: token.value } : undefined}>{token.type === 'color' || token.type === 'radius' ? '' : group.label === 'Typography' ? 'Aa' : '↔'}</span>
              <span className="token-item-content"><strong>{token.name}</strong><code>{tokenCSSValue(token)}</code></span>{uses > 0 && <span className="token-usage">{uses}</span>}
            </button>
            {menu === token.id && <div className="token-context-menu" role="menu" aria-label="Token actions"><button role="menuitem" onClick={() => { const duplicate = store.duplicateToken(token.id); setEditor({ token: duplicate, type: duplicate.type }); setMenu(null) }}><Copy size={12} />Duplicate</button><button role="menuitem" onClick={() => copy(token.id)}><Copy size={12} />Copy{selected.length > 1 ? ` ${selected.length} tokens` : ''}</button><button role="menuitem" onClick={() => { store.removeTokens(chosen(token.id).map(value => value.id)); setSelected([]); setMenu(null) }}><Trash2 size={12} />Delete{selected.length > 1 ? ` ${selected.length} tokens` : ''}</button></div>}
          </div>
        })}
      </section>
    })}</div>
    {notice && <div className="token-notice" role="status">{notice}<button className="quiet-button" aria-label="Dismiss token message" onClick={() => setNotice('')}><X size={12} /></button></div>}
    <div className="theme-footer"><span>{tokens.length} tokens · Saved with this file</span><button className="text-action" disabled={!tokens.length} onClick={() => { setSelected(tokens.map(token => token.id)); navigator.clipboard.writeText(tokensToCSS(tokens)).then(() => setNotice('Theme CSS copied.')).catch(() => setNotice('Clipboard unavailable.')) }}>Copy theme CSS <Copy size={12} /></button></div>
    {editor && <TokenEditor store={store} token={editor.token} initialType={editor.type} onClose={() => setEditor(null)} />}
  </div>
}
