import { tokens } from './design-system/tokens'

interface SwatchProps {
  name: string
  hex: string
  light?: boolean
}

function Swatch({ name, hex, light }: SwatchProps) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="w-full aspect-square rounded"
        style={{
          background: hex,
          border: light ? `1px solid ${tokens.color.border}` : 'none',
          borderRadius: tokens.radius.md,
          boxShadow: tokens.color.border,
        }}
      />
      <div>
        <p className="text-xs font-medium" style={{ color: tokens.color.charcoal }}>{name}</p>
        <p className="text-xs font-mono" style={{ color: tokens.color.ink, opacity: 0.4 }}>{hex}</p>
      </div>
    </div>
  )
}

interface TokenRowProps {
  label: string
  value: string | number
}

function TokenRow({ label, value }: TokenRowProps) {
  return (
    <div
      className="flex items-center justify-between py-3 px-0"
      style={{ borderBottom: `1px solid ${tokens.color.border}` }}
    >
      <span className="text-sm" style={{ color: tokens.color.charcoal }}>{label}</span>
      <code
        className="text-xs px-2 py-1"
        style={{
          background: tokens.color.surface,
          borderRadius: tokens.radius.sm,
          color: tokens.color.blueDeep,
          fontFamily: tokens.font.mono,
        }}
      >
        {String(value)}
      </code>
    </div>
  )
}

function GridDemo() {
  return (
    <div
      className="paper-grid relative w-full overflow-hidden"
      style={{
        height: 240,
        borderRadius: tokens.radius.lg,
        border: `1px solid ${tokens.color.border}`,
      }}
    >
      {/* Vertex markers */}
      {Array.from({ length: 3 }).map((_, row) =>
        Array.from({ length: 4 }).map((_, col) => (
          <div
            key={`${row}-${col}`}
            className="absolute"
            style={{
              left: col * 120,
              top: row * 120,
              width: 5,
              height: 5,
              background: tokens.color.blueDeep,
              opacity: 0.5,
              transform: 'translate(-2.5px, -2.5px)',
            }}
          />
        ))
      )}
      <div
        className="absolute bottom-4 left-4 text-xs font-mono"
        style={{ color: tokens.color.ink, opacity: 0.4 }}
      >
        120px engineering grid · 24px sub-grid
      </div>
    </div>
  )
}

export default function App() {
  return (
    <div
      className="min-h-screen"
      style={{ background: tokens.color.cream, fontFamily: tokens.font.sans }}
    >
      <div className="max-w-5xl mx-auto px-8 py-16">

        {/* Header */}
        <header className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div
              style={{
                width: 32,
                height: 32,
                background: tokens.color.ink,
                borderRadius: tokens.radius.sm,
              }}
            />
            <span className="text-sm font-medium tracking-widest uppercase" style={{ color: tokens.color.charcoal, opacity: 0.5, letterSpacing: '0.12em' }}>
              Paper
            </span>
          </div>
          <h1
            className="text-5xl font-semibold tracking-tight mb-3"
            style={{ color: tokens.color.ink, letterSpacing: '-0.03em', lineHeight: 1.05 }}
          >
            Design System
          </h1>
          <p className="text-base" style={{ color: tokens.color.charcoal, opacity: 0.6 }}>
            Foundation tokens for the Paper vector canvas tool.
          </p>
        </header>

        {/* Colour Palette */}
        <section className="mb-16">
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-6"
            style={{ color: tokens.color.ink, opacity: 0.4, letterSpacing: '0.1em' }}
          >
            Colour Palette
          </h2>
          <div className="grid grid-cols-6 gap-4">
            <Swatch name="Cream" hex={tokens.color.cream} light />
            <Swatch name="Ink" hex={tokens.color.ink} />
            <Swatch name="Blue" hex={tokens.color.blue} />
            <Swatch name="Blue Deep" hex={tokens.color.blueDeep} />
            <Swatch name="Charcoal" hex={tokens.color.charcoal} />
            <Swatch name="Surface" hex={tokens.color.surface} light />
          </div>
        </section>

        {/* Engineering Grid */}
        <section className="mb-16">
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-6"
            style={{ color: tokens.color.ink, opacity: 0.4, letterSpacing: '0.1em' }}
          >
            Engineering Grid
          </h2>
          <GridDemo />
        </section>

        {/* Typography */}
        <section className="mb-16">
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-6"
            style={{ color: tokens.color.ink, opacity: 0.4, letterSpacing: '0.1em' }}
          >
            Typography
          </h2>
          <div
            className="p-8 rounded-lg"
            style={{
              background: tokens.color.surface,
              border: `1px solid ${tokens.color.border}`,
              borderRadius: tokens.radius.lg,
            }}
          >
            <p
              className="text-5xl font-semibold mb-2"
              style={{ color: tokens.color.ink, letterSpacing: '-0.03em', lineHeight: 1.05 }}
            >
              Aa
            </p>
            <p className="text-sm mb-1" style={{ color: tokens.color.charcoal }}>Inter / Matter — Primary Sans</p>
            <p
              className="text-sm font-mono"
              style={{ color: tokens.color.blueDeep, fontFamily: tokens.font.mono }}
            >
              ABCDEFGHIJKLMNOPQRSTUVWXYZ
            </p>
            <p
              className="text-sm font-mono"
              style={{ color: tokens.color.blueDeep, fontFamily: tokens.font.mono }}
            >
              abcdefghijklmnopqrstuvwxyz 0123456789
            </p>
          </div>
        </section>

        {/* Design Tokens */}
        <section className="mb-16">
          <h2
            className="text-xs font-medium tracking-widest uppercase mb-6"
            style={{ color: tokens.color.ink, opacity: 0.4, letterSpacing: '0.1em' }}
          >
            Tokens
          </h2>
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.lg }}
          >
            <div className="px-6" style={{ background: tokens.color.surface }}>
              <TokenRow label="grid.tick" value={`${tokens.grid.tick}px`} />
              <TokenRow label="grid.sub" value={`${tokens.grid.sub}px`} />
              <TokenRow label="radius.sm" value={`${tokens.radius.sm}px`} />
              <TokenRow label="radius.md" value={`${tokens.radius.md}px`} />
              <TokenRow label="radius.lg" value={`${tokens.radius.lg}px`} />
              <TokenRow label="duration.snap" value={`${tokens.duration.snap}ms`} />
              <TokenRow label="duration.smooth" value={`${tokens.duration.smooth}ms`} />
              <TokenRow label="ease.paper" value={tokens.ease.paper} />
            </div>
          </div>
        </section>

        {/* Status bar */}
        <footer
          className="flex items-center gap-2"
          style={{ color: tokens.color.ink, opacity: 0.35 }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#22c55e',
              opacity: 1,
            }}
          />
          <span className="text-xs font-mono">T01 · Foundation ready · Vite + React + TypeScript + Tailwind CSS v4</span>
        </footer>
      </div>
    </div>
  )
}
