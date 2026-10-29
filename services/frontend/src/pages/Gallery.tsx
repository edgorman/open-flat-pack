import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageMeta } from '../components/PageMeta'
import { Thumbnail } from '../components/Thumbnail'
import { useApp } from '../context/AppContext'
import { useCatalogue } from '../hooks/useCatalogue'
import { designPath, errorMessage, type Design } from '../lib/api'
import { formatDate, snippetFrom } from '../lib/format'

const PAGE_SIZE = 10

type State =
  | { phase: 'unconfigured' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; designs: Design[]; hasMore: boolean; loadingMore: boolean; loadMoreError?: string }

/** Every published design, newest first, one page of `GET /designs` at a time. Readable signed out. */
export function Gallery() {
  const { api } = useApp()
  // Only for the thumbnails: without it the cards still list every design.
  const { catalogue } = useCatalogue()
  const [state, setState] = useState<State>(api ? { phase: 'loading' } : { phase: 'unconfigured' })

  useEffect(() => {
    if (!api) return
    let current = true
    api
      .listDesigns({ limit: PAGE_SIZE })
      .then((page) => current && setState({ phase: 'ready', designs: page.designs, hasMore: page.hasMore, loadingMore: false }))
      .catch((e: unknown) => current && setState({ phase: 'error', message: errorMessage(e, 'Failed to load the gallery') }))
    return () => {
      current = false
    }
  }, [api])

  const loadMore = () => {
    if (!api || state.phase !== 'ready' || state.loadingMore) return
    const cursor = state.designs.at(-1)?.createdAt
    setState({ ...state, loadingMore: true, loadMoreError: undefined })

    api
      .listDesigns({ limit: PAGE_SIZE, startAfter: cursor })
      .then((page) =>
        setState((prev) =>
          prev.phase === 'ready'
            ? { phase: 'ready', designs: [...prev.designs, ...page.designs], hasMore: page.hasMore, loadingMore: false }
            : prev,
        ),
      )
      .catch((e: unknown) =>
        setState((prev) =>
          prev.phase === 'ready'
            ? { ...prev, loadingMore: false, loadMoreError: errorMessage(e, 'Failed to load more designs') }
            : prev,
        ),
      )
  }

  return (
    <div className="page page-wide">
      <PageMeta title="Gallery" path="/designs" />
      <header className="page-header">
        <span className="page-kicker text-muted">Gallery</span>
        <h1 className="title-feed">Recent designs</h1>
      </header>

      {state.phase === 'unconfigured' && (
        <p className="text-muted">No backend deployed yet - no backend URL is configured.</p>
      )}
      {state.phase === 'loading' && <p className="text-muted">Loading…</p>}
      {state.phase === 'error' && <p role="alert">{state.message}</p>}
      {state.phase === 'ready' && state.designs.length === 0 && (
        <p className="text-muted">
          No designs yet. <Link to="/design">Design the first one.</Link>
        </p>
      )}
      {state.phase === 'ready' && state.designs.length > 0 && (
        <>
          <div className="gallery">
            {state.designs.map((design, i) => (
              <Link key={design.id} to={designPath(design.id)} className="gallery-card" style={{ animationDelay: `${i * 20}ms` }}>
                <div className="gallery-thumb">{catalogue && design.layout && <Thumbnail layout={design.layout} catalogue={catalogue} />}</div>
                <h2 className="gallery-title">{snippetFrom(design.prompt, 90)}</h2>
                <div className="gallery-meta text-muted">
                  {design.authorUsername && <span>{design.authorUsername}</span>}
                  {design.createdAt && <span>{formatDate(design.createdAt)}</span>}
                </div>
              </Link>
            ))}
          </div>
          {(state.hasMore || state.loadMoreError) && (
            <div className="feed-load-more">
              {state.loadMoreError && <p role="alert">{state.loadMoreError}</p>}
              {state.hasMore && (
                <button type="button" className="btn btn-ghost" onClick={loadMore} disabled={state.loadingMore}>
                  {state.loadingMore ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
