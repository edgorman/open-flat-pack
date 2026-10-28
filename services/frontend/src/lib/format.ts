const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/** e.g. "Aug 24, 2026", matching the feed's date label. */
export function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso))
}

/**
 * Text as one line of at most `max` characters, for a list row and a page description.
 * `public/_worker.js` keeps its own copy, since it ships as-is rather than through Vite; change both
 * together.
 */
export function snippetFrom(body: string, max = 160): string {
  const plain = body.replace(/\s+/g, ' ').trim()
  if (plain.length <= max) return plain
  return `${plain.slice(0, max - 1).trimEnd()}…`
}

/** Links a release tag (e.g. "v1.2.3", from config.json) to its GitHub Releases page. */
export function releaseUrl(githubRepo: string, tag: string): string {
  return `https://github.com/${githubRepo}/releases/tag/${tag}`
}

/** An IKEA article number as IKEA prints it, e.g. "80275887" -> "802.758.87". */
export function formatArticle(article: string): string {
  return article.replace(/^(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3')
}
