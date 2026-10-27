import { screen } from '@testing-library/react'
import type { Api } from '../lib/api'
import { renderWithApp } from '../testUtils'
import { resetCatalogue, useCatalogue } from './useCatalogue'

function Count() {
  const { catalogue, error } = useCatalogue()
  return <p>{error ?? (catalogue ? `${catalogue.parts.length} parts` : 'loading')}</p>
}

afterEach(resetCatalogue)

describe('useCatalogue', () => {
  it('fetches the catalogue once for every caller', async () => {
    const getCatalogue = vi.fn().mockResolvedValue({ parts: [] })
    const api = { getCatalogue } as unknown as Api
    renderWithApp(
      <>
        <Count />
        <Count />
      </>,
      { context: { api } },
    )

    expect(await screen.findAllByText('0 parts')).toHaveLength(2)
    expect(getCatalogue).toHaveBeenCalledTimes(1)
  })

  it('reports a failure and tries again on the next mount', async () => {
    const getCatalogue = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue({ parts: [] })
    const api = { getCatalogue } as unknown as Api
    const { unmount } = renderWithApp(<Count />, { context: { api } })
    expect(await screen.findByText('down')).toBeInTheDocument()
    unmount()

    renderWithApp(<Count />, { context: { api } })
    expect(await screen.findByText('0 parts')).toBeInTheDocument()
  })
})
