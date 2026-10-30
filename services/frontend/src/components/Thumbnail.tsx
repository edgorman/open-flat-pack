import type { Catalogue, Layout, Part } from '../lib/api'
import { finishColour } from '../lib/finishes'

/**
 * A flat front view of a layout for the gallery: each part a rectangle in its finish colour, with a
 * frame's cells and insides cut out and doors on top. SVG rather than the 3D preview, so a page of them costs nothing.
 */
export function Thumbnail({ layout, catalogue }: { layout: Layout; catalogue: Catalogue }) {
  const parts = new Map(catalogue.parts.map((p) => [p.article, p]))
  const fronts = new Set(catalogue.parts.flatMap((p) => p.offers.filter((s) => s.kind === 'front').map((s) => s.name)))
  const inFront = (part: Part) => part.restsOn.some((name) => fronts.has(name))
  const placed = layout.parts
    .flatMap(({ article, x, y }) => {
      const part = parts.get(article)
      return part?.size ? [{ part, x, y, ...part.size }] : []
    })
    // Doors go over the part they hang on, wherever the layout lists them.
    .sort((a, b) => Number(inFront(a.part)) - Number(inFront(b.part)))
  if (placed.length === 0) return null

  const left = Math.min(...placed.map((p) => p.x))
  const right = Math.max(...placed.map((p) => p.x + p.w))
  const top = Math.max(...placed.map((p) => p.y + p.h))
  const pad = 60
  // Layout y runs up and SVG y down, so each shape is drawn at top - y.
  const rect = (x: number, y: number, w: number, h: number) => `M${x} ${top - y - h}h${w}v${h}h${-w}z`

  return (
    <svg className="thumbnail" viewBox={`${left - pad} ${-pad} ${right - left + pad * 2} ${top + pad * 2}`} aria-hidden="true">
      {placed.map(({ part, x, y, w, h }, i) => {
        const cells = part.offers.filter((s) => s.kind === 'cell' || s.kind === 'inside').map((c) => rect(x + c.x, y + c.y, c.w, c.h))
        return (
          <path
            key={i}
            d={rect(x, y, w, h) + cells.join('')}
            fillRule="evenodd"
            fill={finishColour(part.finish)}
            stroke="#1d2129"
            strokeOpacity={0.5}
            strokeWidth={8}
          />
        )
      })}
    </svg>
  )
}
