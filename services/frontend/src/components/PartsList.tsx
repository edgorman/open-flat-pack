import type { Catalogue, Part } from '../gen/app/v1/catalogue'
import type { Layout } from '../gen/app/v1/layout'
import { finishColour } from '../lib/finishes'
import { formatArticle } from '../lib/format'
import { articleList, partIcon, partsLines } from '../lib/partsList'

/** The parts list under a design: what to buy, and the build notes from feasibility. */
export function PartsList({ layout, catalogue, notes }: { layout: Layout; catalogue: Catalogue; notes: string[] }) {
  const lines = partsLines(layout, catalogue)
  return (
    <section className="card parts">
      <h2 className="parts-title">Parts</h2>
      <table className="parts-list">
        <thead>
          <tr>
            <th>Part</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.article}>
              <td>
                <div className="parts-name">
                  <span className="part-icon" aria-hidden="true">
                    <PartIcon name={line.part?.name ?? ''} />
                    <span className="swatch" style={{ background: finishColour(line.part?.finish ?? '') }} />
                  </span>
                  <span>
                    <a href={`https://www.ikea.com/gb/en/p/-${line.article}/`} target="_blank" rel="noreferrer">
                      {partLabel(line.part)}
                    </a>
                    <span className="parts-article">{formatArticle(line.article)}</span>
                  </span>
                </div>
              </td>
              <td className="parts-qty">{line.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(articleList(lines))}>
        Copy article numbers
      </button>
      {notes.length > 0 && (
        <ul className="notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** e.g. "KALLAX shelving unit, white, 77×147 cm" (width × height, as IKEA names it). */
function partLabel(part: Part | undefined): string {
  if (!part) return 'Unknown part'
  const size = part.size ? `, ${part.size.w / 10}×${part.size.h / 10} cm` : ''
  return `${part.name}, ${part.finish}${size}`
}

function PartIcon({ name }: { name: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={partIcon(name)} />
    </svg>
  )
}
