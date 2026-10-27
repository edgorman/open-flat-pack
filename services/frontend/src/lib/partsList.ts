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
