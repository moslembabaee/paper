import { useState } from 'react'
import { Layers, PanelLeftClose, Palette } from 'lucide-react'
import { LayerTree } from '../scene/LayerTree'
import type { SceneStore } from '../scene/store'
import { ThemePanel } from './ThemePanel'

export function DocumentSidebar({ store, onHide }: { store: SceneStore; onHide: () => void }) {
  const [tab, setTab] = useState<'layers' | 'theme'>('layers')
  return <aside className="layers-panel document-sidebar" aria-label="Document sidebar">
    <div className="sidebar-heading"><div role="tablist" aria-label="Document panels">
      <button role="tab" id="layers-tab" aria-controls="layers-pane" aria-selected={tab === 'layers'} tabIndex={tab === 'layers' ? 0 : -1} onClick={() => setTab('layers')} onKeyDown={event => { if (event.key === 'ArrowRight') { setTab('theme'); document.getElementById('theme-tab')?.focus() } }}><Layers size={12} />Layers</button>
      <button role="tab" aria-label="Theme / Tokens" title="Theme / Tokens" id="theme-tab" aria-controls="theme-pane" aria-selected={tab === 'theme'} tabIndex={tab === 'theme' ? 0 : -1} onClick={() => setTab('theme')} onKeyDown={event => { if (event.key === 'ArrowLeft') { setTab('layers'); document.getElementById('layers-tab')?.focus() } }}><Palette size={12} />Theme</button>
    </div><button className="quiet-button" aria-label="Hide layers" title="Hide sidebar" onClick={onHide}><PanelLeftClose size={14} /></button></div>
    <div className="sidebar-pane" id="layers-pane" role="tabpanel" aria-labelledby="layers-tab" hidden={tab !== 'layers'}>{tab === 'layers' && <LayerTree store={store} onHide={onHide} embedded />}</div>
    <div className="sidebar-pane" id="theme-pane" role="tabpanel" aria-labelledby="theme-tab" hidden={tab !== 'theme'} data-token-ui>{tab === 'theme' && <ThemePanel store={store} />}</div>
  </aside>
}
