import { lazy, Suspense, useState, type FormEvent } from 'react'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { PartsList } from '../components/PartsList'
import { useApp } from '../context/AppContext'
import { useCatalogue } from '../hooks/useCatalogue'
import { ApiError, errorMessage, type Layout, type Validation } from '../lib/api'

// Three.js is most of the bundle, so it loads only once there is something to draw.
const Preview = lazy(() => import('../components/Preview').then((m) => ({ default: m.Preview })))

type Result = { layout: Layout; notes: string[] }

/**
 * Where a signed-in user designs something: a prompt goes to `POST /layouts`, and the layout comes
 * back as a preview and parts list. It stays unpublished in the page; another prompt refines it.
 */
export function Design() {
  const { api, user, authError, authReady, renderSignInButton } = useApp()
  const { catalogue, error: catalogueError } = useCatalogue()
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<Result | null>(null)
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
        setResult({ layout: res.layout ?? { parts: [] }, notes: res.validation?.notes ?? [] })
        setPrompt('')
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 422) {
          setProblems(((e.body as Validation | undefined)?.errors ?? []).map((p) => p.message))
          setError("Couldn't make a buildable design from that. Try rephrasing it.")
        } else {
          setError(errorMessage(e, 'Failed to design'))
        }
      })
      .finally(() => setWorking(false))
  }

  return (
    <div className="page">
      <header className="page-header">
        <span className="page-kicker text-muted">Design</span>
        <h1 className="title-editor">{result ? 'Refine your design' : 'Describe your shelving'}</h1>
      </header>

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="design-prompt">{result ? 'What should change?' : 'What do you want?'}</label>
          <textarea
            id="design-prompt"
            className="input"
            rows={3}
            placeholder={result ? 'Make it one cube taller' : 'A white 4×4 KALLAX with two doors and legs'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button type="submit" className="btn btn-primary" disabled={working || !prompt.trim()}>
            {working ? 'Designing…' : result ? 'Refine' : 'Design'}
          </button>
          {result && (
            <button type="button" className="btn btn-ghost" onClick={() => setResult(null)} disabled={working}>
              Start over
            </button>
          )}
        </div>
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
        <>
          <Suspense fallback={<p className="text-muted">Loading preview…</p>}>
            <Preview layout={result.layout} catalogue={catalogue} />
          </Suspense>
          <PartsList layout={result.layout} catalogue={catalogue} notes={result.notes} />
        </>
      )}
    </div>
  )
}
