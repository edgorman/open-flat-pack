import { Link } from 'react-router-dom'
import { PageMeta } from '../components/PageMeta'
import { useApp } from '../context/AppContext'

const STEPS = [
  ['Describe it', 'Say what you want in a sentence, like "a white 4×4 KALLAX with two doors".'],
  ['See it built', 'Get a 3D layout of real IKEA parts, checked to fit together and stand up.'],
  ['Buy the parts', 'Take the parts list to IKEA, with every article number ready to copy.'],
]

/** The front door: what the site does, and a way into the prompt page and the gallery. */
export function Landing() {
  const { config } = useApp()
  return (
    <div className="page page-wide">
      <PageMeta path="/" />
      <header className="hero">
        <span className="page-kicker text-muted">{config.siteName}</span>
        <h1 className="hero-title">Shelving from a sentence.</h1>
        <p className="hero-lede text-muted">Describe the KALLAX or BILLY furniture you want, and get a layout of real IKEA parts with a parts list.</p>
        <div className="hero-actions">
          <Link to="/design" className="btn btn-primary btn-lg">
            Start a design
          </Link>
          <Link to="/designs" className="btn btn-secondary btn-lg">
            Browse the gallery
          </Link>
        </div>
      </header>
      <ol className="steps">
        {STEPS.map(([title, body]) => (
          <li key={title} className="card">
            <h2>{title}</h2>
            <p className="text-muted">{body}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
