import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  RotateCcw,
  Sliders,
  Sparkles,
  Spline,
  Type,
  Unlink,
} from 'lucide-react'
import type { SceneStore } from './store.ts'
import type {
  FontKerningMode,
  OpenTypeFeatures,
  SceneElement,
  TextElement,
  TextPathPreset,
  VariableFontAxes,
} from './types.ts'
import {
  OPENTYPE_CATALOG,
  VARIABLE_AXES_META,
  VARIABLE_AXIS_PRESETS,
  compileFontFeatureSettings,
  compileFontVariationSettings,
} from './typography.ts'
import './typography.css'

interface TypographyStudioProps {
  readonly store: SceneStore
  readonly node: TextElement
  readonly binding?: (property: 'fontSize' | 'fontFamily' | 'fontWeight' | 'lineHeight' | 'letterSpacing', label: string) => ReactNode
}

type StudioTab = 'type' | 'axes' | 'opentype' | 'kerning' | 'path'

const CURATED_FONTS = [
  { label: 'Inter (Variable)', value: 'Inter, Matter, ui-sans-serif, system-ui, sans-serif' },
  { label: 'Roboto Flex (Variable)', value: '"Roboto Flex", sans-serif' },
  { label: 'Recursive (Variable)', value: 'Recursive, monospace, sans-serif' },
  { label: 'Space Grotesk (Variable)', value: '"Space Grotesk", sans-serif' },
  { label: 'Playfair Display (Variable)', value: '"Playfair Display", Georgia, serif' },
  { label: 'Fira Code (Ligatures)', value: '"Fira Code", ui-monospace, monospace' },
  { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Monospace Code', value: 'ui-monospace, "Cascadia Code", monospace' },
  { label: 'Serif Classic', value: 'Georgia, Cambria, "Times New Roman", serif' },
]

const PATH_PRESETS: readonly { id: TextPathPreset; label: string; icon: string }[] = [
  { id: 'wave', label: 'Wave', icon: '〰' },
  { id: 'arc', label: 'Arc', icon: '⌒' },
  { id: 'circle', label: 'Circle', icon: '○' },
  { id: 'scurve', label: 'S-Curve', icon: '∿' },
  { id: 'spiral', label: 'Spiral', icon: '◎' },
  { id: 'banner', label: 'Banner', icon: '⌢' },
  { id: 'zigzag', label: 'Zigzag', icon: '⋀' },
]

export function TypographyStudio({ store, node, binding }: TypographyStudioProps) {
  const [tab, setTab] = useState<StudioTab>('type')
  const [customFont, setCustomFont] = useState(false)
  const [sampleText, setSampleText] = useState('0 1/2 fi fl $1,420 -> !=')

  const update = (patch: Partial<TextElement>) => {
    store.update(node.id, 'text', patch)
  }

  // Active variable axes
  const axes: VariableFontAxes = node.variableAxes ?? {
    wght: node.fontWeight,
    wdth: 100,
    slnt: 0,
    opsz: node.fontSize,
  }

  const updateAxis = (axis: string, value: number) => {
    const nextAxes = { ...axes, [axis]: value }
    update({
      variableAxes: nextAxes,
      ...(axis === 'wght' ? { fontWeight: Math.round(value) } : {}),
    })
  }

  // OpenType features
  const otFeatures: OpenTypeFeatures = node.openTypeFeatures ?? { liga: true }
  const activeOtCount = Object.values(otFeatures).filter(Boolean).length

  const toggleOtFeature = (tag: string) => {
    const current = otFeatures[tag] ?? false
    const nextFeatures = { ...otFeatures, [tag]: !current }
    update({ openTypeFeatures: nextFeatures })
  }

  const resetOtFeatures = () => {
    update({ openTypeFeatures: { liga: true } })
  }

  // Kerning
  const currentKerning: FontKerningMode = node.fontKerning ?? 'auto'

  // Text-on-Path
  const top = node.textOnPath ?? {
    enabled: false,
    preset: 'wave',
    offset: 0,
    side: 'left',
    align: 'start',
    spacing: 0,
  }

  // Available vector path layers on canvas for linking
  const snapshot = store.getSnapshot()
  const canvasPathLayers = Object.values(snapshot.elements).filter(
    (el): el is Extract<SceneElement, { type: 'path' }> => el.type === 'path' && el.id !== node.id
  )

  return (
    <div className="inspector-section">
      <div className="property-heading">
        <span className="section-caption">VARIABLE TYPOGRAPHY STUDIO</span>
        {top.enabled && <span className="axis-tag-badge">Path Active</span>}
      </div>

      {/* Tabs */}
      <div className="typography-tabs" role="tablist">
        <button
          type="button"
          className={`typography-tab-btn ${tab === 'type' ? 'is-active' : ''}`}
          onClick={() => setTab('type')}
          title="Typeface, Content & Alignment"
        >
          <Type size={11} />
          <span>Type</span>
        </button>
        <button
          type="button"
          className={`typography-tab-btn ${tab === 'axes' ? 'is-active' : ''}`}
          onClick={() => setTab('axes')}
          title="Variable Font Axes"
        >
          <Sliders size={11} />
          <span>Axes</span>
        </button>
        <button
          type="button"
          className={`typography-tab-btn ${tab === 'opentype' ? 'is-active' : ''}`}
          onClick={() => setTab('opentype')}
          title="OpenType Features"
        >
          <Sparkles size={11} />
          <span>OT{activeOtCount > 0 ? ` (${activeOtCount})` : ''}</span>
        </button>
        <button
          type="button"
          className={`typography-tab-btn ${tab === 'kerning' ? 'is-active' : ''}`}
          onClick={() => setTab('kerning')}
          title="Optical Kerning & Tracking"
        >
          <span>Kern</span>
        </button>
        <button
          type="button"
          className={`typography-tab-btn ${tab === 'path' ? 'is-active' : ''}`}
          onClick={() => setTab('path')}
          title="Text-on-Vector Path Deformation"
        >
          <Spline size={11} />
          <span>Path</span>
        </button>
      </div>

      {/* Tab 1: Typeface & Core Settings */}
      {tab === 'type' && (
        <div className="typography-tab-pane">
          <textarea
            className="property-textarea"
            key={node.id + node.text}
            aria-label="Text content"
            defaultValue={node.text}
            placeholder="Type your copy here..."
            onBlur={event => update({ text: event.currentTarget.value })}
          />

          <label className="property-label">
            Font family
            {!customFont ? (
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <select
                  className="property-input"
                  aria-label="Font family selector"
                  value={CURATED_FONTS.some(f => f.value === node.fontFamily) ? node.fontFamily : 'custom'}
                  onChange={event => {
                    if (event.currentTarget.value === 'custom') {
                      setCustomFont(true)
                    } else {
                      update({ fontFamily: event.currentTarget.value })
                    }
                  }}
                >
                  {CURATED_FONTS.map(font => (
                    <option key={font.value} value={font.value}>{font.label}</option>
                  ))}
                  <option value="custom">Custom Font Name...</option>
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                <input
                  className="property-input"
                  aria-label="Custom font family"
                  defaultValue={node.fontFamily}
                  onBlur={event => {
                    const next = event.currentTarget.value.trim()
                    if (next) update({ fontFamily: next })
                  }}
                  onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
                />
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => setCustomFont(false)}
                  title="Choose from presets"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            )}
          </label>
          {binding?.('fontFamily', 'Font family')}

          <div className="property-pair">
            <div className="token-number-field" style={{ flex: 1 }}>
              <label className="property-number">
                <span>Size</span>
                <input
                  type="number"
                  aria-label="Font size"
                  value={node.fontSize}
                  min={1}
                  onChange={event => {
                    const next = event.currentTarget.valueAsNumber
                    if (Number.isFinite(next) && next >= 1) update({ fontSize: next })
                  }}
                />
              </label>
              {binding?.('fontSize', 'Font size')}
            </div>
            <div className="token-number-field" style={{ flex: 1 }}>
              <label className="property-number">
                <span>Weight</span>
                <input
                  type="number"
                  aria-label="Font weight"
                  value={axes.wght ?? node.fontWeight}
                  min={1}
                  max={1000}
                  step={50}
                  onChange={event => {
                    const next = event.currentTarget.valueAsNumber
                    if (Number.isFinite(next) && next >= 1 && next <= 1000) updateAxis('wght', next)
                  }}
                />
              </label>
              {binding?.('fontWeight', 'Weight')}
            </div>
          </div>

          <div className="property-pair">
            <div className="token-number-field" style={{ flex: 1 }}>
              <label className="property-number">
                <span>Leading</span>
                <input
                  type="number"
                  aria-label="Line height"
                  value={node.lineHeight}
                  min={0.1}
                  step={0.1}
                  onChange={event => {
                    const next = event.currentTarget.valueAsNumber
                    if (Number.isFinite(next) && next >= 0.1) update({ lineHeight: next })
                  }}
                />
              </label>
              {binding?.('lineHeight', 'Line height')}
            </div>
            <div className="token-number-field" style={{ flex: 1 }}>
              <label className="property-number">
                <span>Tracking</span>
                <input
                  type="number"
                  aria-label="Letter spacing"
                  value={node.letterSpacing}
                  step={0.5}
                  onChange={event => {
                    const next = event.currentTarget.valueAsNumber
                    if (Number.isFinite(next)) update({ letterSpacing: next })
                  }}
                />
              </label>
              {binding?.('letterSpacing', 'Tracking')}
            </div>
          </div>

          {/* Alignment & Transform */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div className="kerning-mode-group" style={{ flex: 1 }}>
              <button
                type="button"
                className={`kerning-mode-btn ${node.textAlign === 'left' ? 'is-active' : ''}`}
                onClick={() => update({ textAlign: 'left' })}
                title="Left Align"
                aria-label="Align left"
              >
                <AlignLeft size={12} style={{ margin: '0 auto' }} />
              </button>
              <button
                type="button"
                className={`kerning-mode-btn ${node.textAlign === 'center' ? 'is-active' : ''}`}
                onClick={() => update({ textAlign: 'center' })}
                title="Center Align"
                aria-label="Align center"
              >
                <AlignCenter size={12} style={{ margin: '0 auto' }} />
              </button>
              <button
                type="button"
                className={`kerning-mode-btn ${node.textAlign === 'right' ? 'is-active' : ''}`}
                onClick={() => update({ textAlign: 'right' })}
                title="Right Align"
                aria-label="Align right"
              >
                <AlignRight size={12} style={{ margin: '0 auto' }} />
              </button>
            </div>

            <div className="text-transform-group" style={{ flex: 1 }}>
              {(['none', 'uppercase', 'lowercase', 'capitalize'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={`text-transform-btn ${(node.textTransform ?? 'none') === mode ? 'is-active' : ''}`}
                  onClick={() => update({ textTransform: mode })}
                  title={`Transform: ${mode}`}
                >
                  {mode === 'none' ? '—' : mode === 'uppercase' ? 'AA' : mode === 'lowercase' ? 'aa' : 'Aa'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Variable Font Axis Sliders */}
      {tab === 'axes' && (
        <div className="typography-tab-pane">
          <div className="typo-chips-scroll" role="toolbar" aria-label="Variable Axis Presets">
            {VARIABLE_AXIS_PRESETS.map(preset => {
              const matches = preset.axes.wght === axes.wght && preset.axes.wdth === axes.wdth && preset.axes.slnt === axes.slnt
              return (
                <button
                  key={preset.name}
                  type="button"
                  className={`typo-chip ${matches ? 'is-active' : ''}`}
                  onClick={() => {
                    update({
                      variableAxes: { ...preset.axes },
                      fontWeight: preset.axes.wght ?? node.fontWeight,
                    })
                  }}
                  title={preset.description}
                >
                  {preset.name}
                </button>
              )
            })}
          </div>

          {/* Weight axis (wght) */}
          <div className="axis-slider-row">
            <div className="axis-slider-header">
              <span className="axis-label-name">Weight</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="axis-tag-badge">wght</span>
                <span className="axis-val-display">{Math.round(axes.wght ?? node.fontWeight)}</span>
              </div>
            </div>
            <div className="axis-slider-track">
              <input
                type="range"
                className="axis-slider-input"
                aria-label="Variable weight axis"
                min={VARIABLE_AXES_META.wght.min}
                max={VARIABLE_AXES_META.wght.max}
                step={VARIABLE_AXES_META.wght.step}
                value={axes.wght ?? node.fontWeight}
                onChange={event => updateAxis('wght', event.currentTarget.valueAsNumber)}
              />
              <input
                type="number"
                className="axis-num-input"
                aria-label="Weight value"
                value={Math.round(axes.wght ?? node.fontWeight)}
                min={1}
                max={1000}
                onChange={event => {
                  const val = event.currentTarget.valueAsNumber
                  if (Number.isFinite(val)) updateAxis('wght', val)
                }}
              />
            </div>
          </div>

          {/* Width axis (wdth) */}
          <div className="axis-slider-row">
            <div className="axis-slider-header">
              <span className="axis-label-name">Width</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="axis-tag-badge">wdth</span>
                <span className="axis-val-display">{Math.round(axes.wdth ?? 100)}%</span>
              </div>
            </div>
            <div className="axis-slider-track">
              <input
                type="range"
                className="axis-slider-input"
                aria-label="Variable width axis"
                min={VARIABLE_AXES_META.wdth.min}
                max={VARIABLE_AXES_META.wdth.max}
                step={VARIABLE_AXES_META.wdth.step}
                value={axes.wdth ?? 100}
                onChange={event => updateAxis('wdth', event.currentTarget.valueAsNumber)}
              />
              <input
                type="number"
                className="axis-num-input"
                aria-label="Width percentage value"
                value={Math.round(axes.wdth ?? 100)}
                min={25}
                max={200}
                onChange={event => {
                  const val = event.currentTarget.valueAsNumber
                  if (Number.isFinite(val)) updateAxis('wdth', val)
                }}
              />
            </div>
          </div>

          {/* Slant axis (slnt) */}
          <div className="axis-slider-row">
            <div className="axis-slider-header">
              <span className="axis-label-name">Slant</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="axis-tag-badge">slnt</span>
                <span className="axis-val-display">{(axes.slnt ?? 0).toFixed(1)}°</span>
              </div>
            </div>
            <div className="axis-slider-track">
              <input
                type="range"
                className="axis-slider-input"
                aria-label="Variable slant axis"
                min={VARIABLE_AXES_META.slnt.min}
                max={VARIABLE_AXES_META.slnt.max}
                step={VARIABLE_AXES_META.slnt.step}
                value={axes.slnt ?? 0}
                onChange={event => updateAxis('slnt', event.currentTarget.valueAsNumber)}
              />
              <input
                type="number"
                className="axis-num-input"
                aria-label="Slant degrees value"
                value={Number((axes.slnt ?? 0).toFixed(1))}
                step={0.5}
                onChange={event => {
                  const val = event.currentTarget.valueAsNumber
                  if (Number.isFinite(val)) updateAxis('slnt', val)
                }}
              />
            </div>
          </div>

          {/* Optical Size axis (opsz) */}
          <div className="axis-slider-row">
            <div className="axis-slider-header">
              <span className="axis-label-name">Optical Size</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="axis-tag-badge">opsz</span>
                <span className="axis-val-display">{Math.round(axes.opsz ?? node.fontSize)}pt</span>
              </div>
            </div>
            <div className="axis-slider-track">
              <input
                type="range"
                className="axis-slider-input"
                aria-label="Variable optical size axis"
                min={VARIABLE_AXES_META.opsz.min}
                max={VARIABLE_AXES_META.opsz.max}
                step={VARIABLE_AXES_META.opsz.step}
                value={axes.opsz ?? node.fontSize}
                onChange={event => updateAxis('opsz', event.currentTarget.valueAsNumber)}
              />
              <button
                type="button"
                className="quiet-button"
                title="Match font size"
                onClick={() => updateAxis('opsz', node.fontSize)}
              >
                Auto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: OpenType Feature Toggles */}
      {tab === 'opentype' && (
        <div className="typography-tab-pane">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--paper-text-secondary)' }}>
              {activeOtCount} active feature{activeOtCount === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className="quiet-button"
              onClick={resetOtFeatures}
              title="Reset to standard ligatures"
              style={{ fontSize: 10 }}
            >
              <RotateCcw size={10} style={{ marginRight: 3 }} />
              Reset
            </button>
          </div>

          {/* Feature Grid */}
          <div className="opentype-grid" role="group" aria-label="OpenType Feature Toggles">
            {OPENTYPE_CATALOG.map(feat => {
              const active = otFeatures[feat.tag] ?? false
              return (
                <div
                  key={feat.tag}
                  className={`opentype-toggle-card ${active ? 'is-active' : ''}`}
                  onClick={() => toggleOtFeature(feat.tag)}
                  title={`${feat.name}: ${feat.description}`}
                  role="checkbox"
                  aria-checked={active}
                  tabIndex={0}
                  onKeyDown={event => {
                    if (event.key === ' ' || event.key === 'Enter') {
                      event.preventDefault()
                      toggleOtFeature(feat.tag)
                    }
                  }}
                >
                  <div className="opentype-toggle-left">
                    <span className="opentype-tag">{feat.tag}</span>
                    <span className="opentype-name">{feat.name}</span>
                    <span className="opentype-sample">{feat.sample}</span>
                  </div>
                  <div className="opentype-switch">
                    {active && <Check size={10} />}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Interactive OpenType Preview Sandbox */}
          <div className="opentype-preview-box">
            <span className="opentype-preview-label">Live OpenType Sandbox</span>
            <div
              className="opentype-preview-text"
              style={{
                fontFamily: node.fontFamily,
                fontVariationSettings: compileFontVariationSettings(axes, node.fontWeight),
                fontFeatureSettings: compileFontFeatureSettings(otFeatures),
              }}
            >
              {sampleText}
            </div>
            <input
              type="text"
              className="property-input"
              style={{ padding: '3px 6px', fontSize: 10, marginTop: 4 }}
              value={sampleText}
              onChange={event => setSampleText(event.currentTarget.value)}
              placeholder="Test glyphs..."
            />
          </div>
        </div>
      )}

      {/* Tab 4: Optical Kerning & Tracking */}
      {tab === 'kerning' && (
        <div className="typography-tab-pane">
          <label className="property-label">
            Kerning Mode
            <div className="kerning-mode-group" style={{ marginTop: 4 }}>
              {(['auto', 'normal', 'optical', 'none'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={`kerning-mode-btn ${currentKerning === mode ? 'is-active' : ''}`}
                  onClick={() => update({ fontKerning: mode })}
                >
                  {mode === 'auto' ? 'Auto' : mode === 'normal' ? 'Metric' : mode === 'optical' ? 'Optical' : 'None'}
                </button>
              ))}
            </div>
          </label>

          {currentKerning === 'optical' && (
            <div className="axis-slider-row">
              <div className="axis-slider-header">
                <span className="axis-label-name">Optical Adjustment</span>
                <span className="axis-val-display">{(node.opticalKerning ?? 0).toFixed(0)}</span>
              </div>
              <div className="axis-slider-track">
                <input
                  type="range"
                  className="axis-slider-input"
                  min={-50}
                  max={50}
                  step={1}
                  value={node.opticalKerning ?? 0}
                  onChange={event => update({ opticalKerning: event.currentTarget.valueAsNumber })}
                />
              </div>
            </div>
          )}

          <div className="axis-slider-row">
            <div className="axis-slider-header">
              <span className="axis-label-name">Letter Spacing (Tracking)</span>
              <span className="axis-val-display">{node.letterSpacing.toFixed(1)}px</span>
            </div>
            <div className="axis-slider-track">
              <input
                type="range"
                className="axis-slider-input"
                min={-10}
                max={30}
                step={0.5}
                value={node.letterSpacing}
                onChange={event => update({ letterSpacing: event.currentTarget.valueAsNumber })}
              />
            </div>
          </div>

          <div className="opentype-preview-box">
            <span className="opentype-preview-label">Pairwise Kerning Preview</span>
            <div
              className="opentype-preview-text"
              style={{
                fontFamily: node.fontFamily,
                letterSpacing: `${node.letterSpacing + (currentKerning === 'optical' ? (node.opticalKerning ?? 0) * 0.1 : 0)}px`,
                fontKerning: currentKerning === 'optical' ? 'normal' : currentKerning,
              }}
            >
              AV WA To Ly 1984
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Dynamic Text-on-Vector Path Deformation */}
      {tab === 'path' && (
        <div className="typography-tab-pane">
          <div className="path-deformation-toggle">
            <span>Flow Text along Vector Path</span>
            <button
              type="button"
              className={`grid-switch ${top.enabled ? 'on' : ''}`}
              role="switch"
              aria-checked={top.enabled}
              aria-label="Toggle text-on-path deformation"
              onClick={() => {
                update({
                  textOnPath: {
                    ...top,
                    enabled: !top.enabled,
                  },
                })
              }}
            >
              <span />
            </button>
          </div>

          {top.enabled && (
            <>
              {/* Curve Presets */}
              <label className="property-label">
                Curve Presets
                <div className="path-presets-grid" style={{ marginTop: 4 }}>
                  {PATH_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`path-preset-btn ${top.preset === preset.id && !top.pathId ? 'is-active' : ''}`}
                      onClick={() => {
                        update({
                          textOnPath: {
                            ...top,
                            preset: preset.id,
                            pathId: null,
                          },
                        })
                      }}
                    >
                      <span style={{ fontSize: 13 }}>{preset.icon}</span>
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </label>

              {/* Attach to Canvas Path layer */}
              {canvasPathLayers.length > 0 && (
                <label className="property-label">
                  Link Canvas Path Layer
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <select
                      className="property-input"
                      aria-label="Target canvas vector path"
                      value={top.pathId ?? ''}
                      onChange={event => {
                        const targetId = event.currentTarget.value || null
                        update({
                          textOnPath: {
                            ...top,
                            pathId: targetId,
                          },
                        })
                      }}
                    >
                      <option value="">None (Use Preset Curve)</option>
                      {canvasPathLayers.map(path => (
                        <option key={path.id} value={path.id}>{path.name}</option>
                      ))}
                    </select>
                    {top.pathId && (
                      <button
                        type="button"
                        className="quiet-button"
                        title="Detach from vector layer"
                        onClick={() => {
                          update({
                            textOnPath: {
                              ...top,
                              pathId: null,
                            },
                          })
                        }}
                      >
                        <Unlink size={12} />
                      </button>
                    )}
                  </div>
                </label>
              )}

              {/* Start Offset Slider */}
              <div className="axis-slider-row">
                <div className="axis-slider-header">
                  <span className="axis-label-name">Start Offset</span>
                  <span className="axis-val-display">{Math.round(top.offset ?? 0)}%</span>
                </div>
                <div className="axis-slider-track">
                  <input
                    type="range"
                    className="axis-slider-input"
                    aria-label="Text on path start offset"
                    min={0}
                    max={100}
                    step={1}
                    value={top.offset ?? 0}
                    onChange={event => {
                      update({
                        textOnPath: {
                          ...top,
                          offset: event.currentTarget.valueAsNumber,
                        },
                      })
                    }}
                  />
                </div>
              </div>

              {/* Side & Direction */}
              <div style={{ display: 'flex', gap: 6 }}>
                <div className="kerning-mode-group" style={{ flex: 1 }}>
                  <button
                    type="button"
                    className={`kerning-mode-btn ${(top.side ?? 'left') === 'left' ? 'is-active' : ''}`}
                    onClick={() => update({ textOnPath: { ...top, side: 'left' } })}
                    title="Normal side"
                  >
                    Top Side
                  </button>
                  <button
                    type="button"
                    className={`kerning-mode-btn ${top.side === 'right' ? 'is-active' : ''}`}
                    onClick={() => update({ textOnPath: { ...top, side: 'right' } })}
                    title="Invert to bottom side"
                  >
                    Bottom Side
                  </button>
                </div>

                <button
                  type="button"
                  className={`text-transform-btn ${top.reverse ? 'is-active' : ''}`}
                  style={{ flex: '0 0 auto', padding: '0 8px' }}
                  onClick={() => update({ textOnPath: { ...top, reverse: !top.reverse } })}
                  title="Reverse path trajectory"
                >
                  Reverse
                </button>
              </div>

              {/* Path Alignment */}
              <div className="kerning-mode-group">
                <button
                  type="button"
                  className={`kerning-mode-btn ${(top.align ?? 'start') === 'start' ? 'is-active' : ''}`}
                  onClick={() => update({ textOnPath: { ...top, align: 'start' } })}
                >
                  Start Align
                </button>
                <button
                  type="button"
                  className={`kerning-mode-btn ${top.align === 'center' ? 'is-active' : ''}`}
                  onClick={() => update({ textOnPath: { ...top, align: 'center' } })}
                >
                  Center Align
                </button>
                <button
                  type="button"
                  className={`kerning-mode-btn ${top.align === 'end' ? 'is-active' : ''}`}
                  onClick={() => update({ textOnPath: { ...top, align: 'end' } })}
                >
                  End Align
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
