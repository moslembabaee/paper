import { memo } from 'react'
import type { Camera } from '../canvas/types'
import type { SnapGuide } from './snapEngine'

export const SnapGuides = memo(function SnapGuides({ guides, camera }: { guides: readonly SnapGuide[]; camera: Camera }) {
  if (!guides.length) return null
  return <svg className="snap-guides-svg" aria-hidden="true">
    {guides.map((guide, i) => {
      const horizontal = guide.axis === 'h'
      const value = guide.value * camera.zoom + (horizontal ? camera.y : camera.x)
      const start = guide.span[0] * camera.zoom + (horizontal ? camera.x : camera.y)
      const end = guide.span[1] * camera.zoom + (horizontal ? camera.x : camera.y)
      const x1 = horizontal ? start : value, y1 = horizontal ? value : start
      const x2 = horizontal ? end : value, y2 = horizontal ? value : end
      return <g key={i} data-guide={guide.distance === undefined ? 'alignment' : 'distance'}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray={guide.distance === undefined ? '3 2' : undefined} />
        {guide.distance !== undefined && <>
          <path d={horizontal ? `M${x1} ${y1 - 3}v6 M${x2} ${y2 - 3}v6` : `M${x1 - 3} ${y1}h6 M${x2 - 3} ${y2}h6`} />
          <text x={(x1 + x2) / 2 + (horizontal ? 0 : 8)} y={(y1 + y2) / 2 - (horizontal ? 7 : 0)} textAnchor={horizontal ? 'middle' : 'start'}>{Number(guide.distance.toFixed(1))}</text>
        </>}
      </g>
    })}
  </svg>
})
