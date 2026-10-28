import { Link } from 'react-router-dom'
import { PageMeta } from '../components/PageMeta'
import { useApp } from '../context/AppContext'

/** The front door: what the site does, and a way into the prompt page and the gallery. */
export function Landing() {
  const { config } = useApp()
  return (
    <div className="page">
      <PageMeta path="/" />
      <header className="page-header">
        <h1 className="title-feed">{config.siteName}</h1>
      </header>
      <p className="text-muted">Describe the KALLAX furniture you want, and get a layout of real IKEA parts with a parts list.</p>
      <p>
        <Link to="/design" className="btn btn-primary">
          Start a design
        </Link>{' '}
        <Link to="/designs" className="btn btn-ghost">
          Browse the gallery
        </Link>
      </p>
    </div>
  )
}
