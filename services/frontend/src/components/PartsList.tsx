import type { Catalogue, Part } from '../gen/app/v1/catalogue'
import type { Layout } from '../gen/app/v1/layout'
import { formatArticle } from '../lib/format'
import { articleList, partsLines } from '../lib/partsList'

/** The parts list under a design: what to buy, and the build notes from feasibility. */
export function PartsList({ layout, catalogue, notes }: { layout: Layout; catalogue: Catalogue; notes: string[] }) {
  const lines = partsLines(layout, catalogue)
  return (
    <section>
      <table className="parts-list">
        <thead>
          <tr>
            <th>Part</th>
            <th>Article number</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.article}>
              <td>
                <a href={`https://www.ikea.com/gb/en/p/-${line.article}/`} target="_blank" rel="noreferrer">
                  {partLabel(line.part)}
                </a>
              </td>
              <td>{formatArticle(line.article)}</td>
              <td>{line.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(articleList(lines))}>
        Copy article numbers
      </button>
      {notes.length > 0 && (
        <ul>
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
