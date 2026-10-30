import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageMeta } from '../components/PageMeta'
import { PartsList } from '../components/PartsList'
import { useApp } from '../context/AppContext'
import { useCatalogue } from '../hooks/useCatalogue'
import { ApiError, designPath, errorMessage, isAuthor, type Design } from '../lib/api'
import type { ForkState } from './Design'
import { formatDate, snippetFrom } from '../lib/format'

// Three.js is most of the bundle, so it loads only on a page that draws something.
const Preview = lazy(() => import('../components/Preview').then((m) => ({ default: m.Preview })))

type State =
  | { phase: 'unconfigured' }
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; design: Design }

function Message({ children, alert }: { children: string; alert?: boolean }) {
  return (
    <div className="page">
      <p className={alert ? 'center-note' : 'text-muted center-note'} role={alert ? 'alert' : undefined}>
        {children}
      </p>
      <Link to="/designs">← Back to gallery</Link>
    </div>
  )
}

/**
 * One published design: its prompt, author, preview and parts list. Readable signed out. Anyone can
 * fork it into the design page, and its owner can edit or delete it.
 */
export function DesignView() {
  const { id } = useParams<{ id: string }>()
  const { api, profile } = useApp()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const { catalogue, error: catalogueError } = useCatalogue()
  const [state, setState] = useState<State>(api ? { phase: 'loading' } : { phase: 'unconfigured' })

  useEffect(() => {
    if (!api || !id) return
    setState({ phase: 'loading' })
    let current = true
    api
      .getDesign(id)
      .then((design) => current && setState({ phase: 'ready', design }))
      .catch((e: unknown) => {
        if (!current) return
        if (e instanceof ApiError && e.status === 404) return setState({ phase: 'not-found' })
        setState({ phase: 'error', message: errorMessage(e, 'Failed to load design') })
      })
    return () => {
      current = false
    }
  }, [api, id])

  if (state.phase === 'unconfigured') return <Message>No backend deployed yet - no backend URL is configured.</Message>
  if (state.phase === 'loading') return <Message>Loading…</Message>
  if (state.phase === 'not-found') return <Message alert>Design not found.</Message>
  if (state.phase === 'error') return <Message alert>{state.message}</Message>

  const { design } = state
  const layout = design.layout ?? { parts: [] }

  const remove = () => {
    if (!api || !window.confirm('Delete this design? This cannot be undone.')) return
    setDeleting(true)
    setDeleteError(null)
    api
      .deleteDesign(design.id)
      .then(() => navigate('/designs', { replace: true }))
      .catch((e: unknown) => {
        setDeleteError(errorMessage(e, 'Failed to delete'))
        setDeleting(false)
      })
  }

  return (
    <div className="page page-wide">
      <PageMeta title={snippetFrom(design.prompt, 60)} description={snippetFrom(design.prompt)} path={designPath(design.id)} />
      <div className="view-bar">
        <Link to="/designs" className="text-muted back-link">
          ← Back to gallery
        </Link>
        <div className="view-actions">
          <Link to="/design" state={{ fork: design } satisfies ForkState} className="btn btn-secondary">
            Fork
          </Link>
          {isAuthor(profile, design.authorUsername) && (
            <Link to="/design" state={{ edit: design } satisfies ForkState} className="btn btn-secondary">
              Edit
            </Link>
          )}
          {isAuthor(profile, design.authorUsername) && (
            <button type="button" className="btn btn-ghost" onClick={remove} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      </div>
      {deleteError && <p role="alert">{deleteError}</p>}
      <header className="view-header">
        <div className="post-meta">
          {design.createdAt && <span className="text-muted">{formatDate(design.createdAt)}</span>}
          {design.forkedFrom && <ForkedFrom key={design.forkedFrom} id={design.forkedFrom} />}
        </div>
        <h1 className="title-post">{design.prompt}</h1>
        <span className="text-muted post-author">by {design.authorUsername || 'an unnamed author'}</span>
      </header>

      {catalogueError && <p role="alert">{catalogueError}</p>}
      {catalogue && (
        <div className="design-grid">
          <Suspense fallback={<div className="blueprint text-muted center-note">Loading preview…</div>}>
            <Preview layout={layout} catalogue={catalogue} />
          </Suspense>
          <PartsList layout={layout} catalogue={catalogue} notes={design.notes} />
        </div>
      )}
    </div>
  )
}

/** A link to the design this one was forked from, or a note that it has since been deleted. */
function ForkedFrom({ id }: { id: string }) {
  const { api } = useApp()
  const [deleted, setDeleted] = useState(false)

  useEffect(() => {
    if (!api) return
    let current = true
    api.getDesign(id).catch((e: unknown) => current && e instanceof ApiError && e.status === 404 && setDeleted(true))
    return () => {
      current = false
    }
  }, [api, id])

  if (deleted) return <span className="text-muted">forked · original deleted</span>
  return (
    <Link to={designPath(id)} className="text-muted">
      forked from the original
    </Link>
  )
}
