import type { Catalogue, Part } from '../gen/app/v1/catalogue'
import type { Layout } from '../gen/app/v1/layout'
import { formatArticle } from './format'

export interface PartsLine {
  article: string
  part?: Part
  quantity: number
}

/** One line per article in the layout, in order of first use - see docs/design/v1/0006-parts-list.md. */
export function partsLines(layout: Layout, catalogue: Catalogue): PartsLine[] {
  const lines = new Map<string, PartsLine>()
  for (const { article } of layout.parts) {
    const line = lines.get(article)
    if (line) line.quantity++
    else lines.set(article, { article, part: catalogue.parts.find((p) => p.article === article), quantity: 1 })
  }
  return [...lines.values()]
}

/** What Copy article numbers puts on the clipboard: one "802.758.87 × 2" line per part. */
export function articleList(lines: PartsLine[]): string {
  return lines.map((l) => `${formatArticle(l.article)} × ${l.quantity}`).join('\n')
}

/** Line drawings for each kind of part, matched against its name in order, e.g. "KALLAX insert with door" is a door. */
const icons: [RegExp, string][] = [
  [/rail|hanger/i, 'M3 6h18 M8 6v2 M16 6v2 M12 9l-7 7h14Z'],
  [/underframe|legs/i, 'M3 9h18 M5 9v10 M19 9v10 M9 9v6 M15 9v6'],
  [/door/i, 'M6 3h12v18H6Z M15 11v2'],
  [/drawer/i, 'M4 4h16v16H4Z M4 12h16 M10 8h4 M10 16h4'],
  [/box|basket|tray/i, 'M4 8h16v12H4Z M3 4h18v4H3Z M10 12h4'],
  [/shelf|top panel/i, 'M3 10h18v4H3Z M6 14v3 M18 14v3'],
  [/unit|bookcase|frame|cabinet|insert|bench/i, 'M4 3h16v18H4Z M4 9h16 M4 15h16 M12 3v18'],
]
/** Any other part: a plain parcel. */
const fallbackIcon = 'M4 7l8-4 8 4v10l-8 4-8-4Z M4 7l8 4 8-4 M12 11v10'

export function partIcon(name: string): string {
  return icons.find(([match]) => match.test(name))?.[1] ?? fallbackIcon
}
