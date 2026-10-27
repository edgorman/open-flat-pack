import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Api, Design } from '../lib/api'
import { renderWithApp } from '../testUtils'
import { Gallery } from './Gallery'

const design = (id: string, createdAt: string): Design => ({
  id,
  authorUsername: 'calm-smiling-kestrel',
  prompt: `A KALLAX ${id}`,
  forkedFrom: '',
  createdAt,
  notes: [],
})

describe('Gallery', () => {
  it('lists designs newest first and pages on from the last one', async () => {
    const listDesigns = vi
      .fn()
      .mockResolvedValueOnce({ designs: [design('d1', '2026-10-02T00:00:00Z')], hasMore: true })
      .mockResolvedValueOnce({ designs: [design('d2', '2026-10-01T00:00:00Z')], hasMore: false })
    renderWithApp(<Gallery />, { context: { api: { listDesigns } as unknown as Api }, route: '/designs' })

    expect(await screen.findByRole('link', { name: /A KALLAX d1/ })).toHaveAttribute('href', '/designs/d1')
    expect(screen.getByText('calm-smiling-kestrel')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('A KALLAX d2')).toBeInTheDocument()
    expect(listDesigns).toHaveBeenLastCalledWith({ limit: 10, startAfter: '2026-10-02T00:00:00Z' })
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('says when there are no designs yet', async () => {
    const listDesigns = vi.fn().mockResolvedValue({ designs: [], hasMore: false })
    renderWithApp(<Gallery />, { context: { api: { listDesigns } as unknown as Api }, route: '/designs' })
    expect(await screen.findByText(/No designs yet/)).toBeInTheDocument()
  })
})
