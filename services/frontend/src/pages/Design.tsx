import { lazy, Suspense, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { PartsList } from '../components/PartsList'
import { useApp } from '../context/AppContext'
import { useCatalogue } from '../hooks/useCatalogue'
import { ApiError, designPath, errorMessage, type Design as DesignType, type Layout, type Validation } from '../lib/api'

// Three.js is most of the bundle, so it loads only once there is something to draw.
const Preview = lazy(() => import('../components/Preview').then((m) => ({ default: m.Preview })))

// prompt is the first one typed here, which is what a published design is titled by.
type Result = { layout: Layout; notes: string[]; prompt: string }

/** What a design page's Fork link passes: the design to start from. */
export type ForkState = { fork?: DesignType }

/** Why a layout was refused: a 422's remaining errors, or none for any other failure. */
function problemsOf(e: unknown): string[] {
  return e instanceof ApiError && e.status === 422 ? ((e.body as Validation | undefined)?.errors ?? []).map((p) => p.message) : []
}

/**
 * Where a signed-in user designs something: a prompt goes to `POST /layouts`, and the layout comes
 * back as a preview and parts list. It stays unpublished in the page; another prompt refines it,
 * and Publish saves it with `POST /designs`. Opened from a design's Fork link, it starts from that
 * design's layout and publishes with `forkedFrom` set.
 */
export function Design() {
  const { api, user, authError, authReady, renderSignInButton } = useApp()
  const { catalogue, error: catalogueError } = useCatalogue()
  const [prompt, setPrompt] = useState('')
  const navigate = useNavigate()
  const fork = (useLocation().state as ForkState | null)?.fork
  const [forkedFrom, setForkedFrom] = useState(fork?.id ?? '')
  const [result, setResult] = useState<Result | null>(
    fork ? { layout: fork.layout ?? { parts: [] }, notes: fork.notes, prompt: '' } : null,
  )
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])

  if (!api) {
    return (
      <div className="page">
        <p className="text-muted center-note">No backend deployed yet - no backend URL is configured.</p>
      </div>
    )
  }
  if (!user) {
    return (
      <div className="page center-note">
        <p className="text-muted">Sign in to design something.</p>
        {authError ? <p role="alert">{authError}</p> : <GoogleSignInButton ready={authReady} onRender={renderSignInButton} />}
      </div>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setWorking(true)
    setError(null)
    setProblems([])
    api
      .createLayout({ prompt, baseLayout: result?.layout })
      .then((res) => {
        setResult({ layout: res.layout ?? { parts: [] }, notes: res.validation?.notes ?? [], prompt: result?.prompt || prompt })
        setPrompt('')
      })
      .catch((e: unknown) => {
        setProblems(problemsOf(e))
        setError(problemsOf(e).length ? "Couldn't make a buildable design from that. Try rephrasing it." : errorMessage(e, 'Failed to design'))
      })
      .finally(() => setWorking(false))
  }

  const publish = () => {
    if (!result) return
    setWorking(true)
    setError(null)
    setProblems([])
    api
      .createDesign({ prompt: result.prompt, layout: result.layout, forkedFrom })
      .then((design) => navigate(designPath(design.id)))
      .catch((e: unknown) => {
        setProblems(problemsOf(e))
        setError(errorMessage(e, 'Failed to publish'))
        setWorking(false)
      })
  }

  return (
    <div className="page page-wide">
      <header className="page-header">
        <span className="page-kicker text-muted">{forkedFrom ? 'Fork' : 'Design'}</span>
        <h1 className="title-editor">{result ? 'Refine your design' : 'Describe your shelving'}</h1>
      </header>

      <form onSubmit={submit} className="prompt">
        <label htmlFor="design-prompt" className="prompt-label">
          {result ? 'What should change?' : 'What do you want?'}
        </label>
        <div className="prompt-bar">
          <textarea
            id="design-prompt"
            className="prompt-input"
            rows={2}
            placeholder={result ? 'Make it one cube taller' : 'A white 4×4 KALLAX with two doors and legs'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={working || !prompt.trim()}>
            {working ? 'Designing…' : result ? 'Refine' : 'Design'}
          </button>
        </div>
        {result && (
          <div className="prompt-actions">
            {/* A fork needs a change before it is a new design, and a design needs a prompt. */}
            {result.prompt && (
              <button type="button" className="btn btn-accent" onClick={publish} disabled={working}>
                Publish
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setResult(null)
                setForkedFrom('')
              }}
              disabled={working}
            >
              Start over
            </button>
          </div>
        )}
      </form>

      {working && <p className="text-muted">Designing - this can take a few seconds…</p>}
      {error && <p role="alert">{error}</p>}
      {problems.length > 0 && (
        <ul>
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {result && catalogueError && <p role="alert">{catalogueError}</p>}
      {result && catalogue && (
        <div className="design-grid">
          <Suspense fallback={<div className="blueprint text-muted center-note">Loading preview…</div>}>
            <Preview layout={result.layout} catalogue={catalogue} />
          </Suspense>
          <PartsList layout={result.layout} catalogue={catalogue} notes={result.notes} />
        </div>
      )}
    </div>
  )
}
