export const tokens = {
  color: {
    cream: '#edebe1',
    ink: '#080808',
    blue: '#81adec',
    blueDeep: '#4c8eef',
    charcoal: '#222222',
    surface: '#f5f4ee',
    border: 'rgba(8, 8, 8, 0.08)',
    borderStrong: 'rgba(8, 8, 8, 0.16)',
  },
  grid: {
    tick: 120,
    sub: 24,
  },
  font: {
    sans: '"Inter", "Matter", ui-sans-serif, system-ui, sans-serif',
    mono: 'ui-monospace, "Fira Code", monospace',
  },
  radius: {
    sm: 2,
    md: 4,
    lg: 8,
    xl: 12,
  },
  ease: {
    paper: 'cubic-bezier(0.16, 1, 0.3, 1)',
    snap: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  duration: {
    snap: 120,
    smooth: 240,
    slow: 400,
  },
} as const

export type PaperColor = keyof typeof tokens.color
