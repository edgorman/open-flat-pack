import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetCatalogue } from '../hooks/useCatalogue'
import { ApiError, type Api, type Catalogue, type CurrentUser, type Design } from '../lib/api'
import { renderWithApp } from '../testUtils'
import { DesignView } from './DesignView'

// WebGL doesn't exist in jsdom; the preview has its own tests.
vi.mock('../components/Preview', () => ({ Preview: () => <div>preview</div> }))

const catalogue = { parts: [] } as unknown as Catalogue

const design = (overrides: Partial<Design> = {}): Design => ({
  id: 'd1',
  authorUsername: 'calm-smiling-kestrel',
  prompt: 'A white 2x2 KALLAX',
  layout: { parts: [] },
  forkedFrom: '',
  createdAt: '2026-10-01T00:00:00Z',
  notes: ['Fix to the wall.'],
  ...overrides,
})

function renderDesign(getDesign: Api['getDesign'], extra: Partial<Api> = {}, username = '') {
  const api = { getDesign, getCatalogue: vi.fn().mockResolvedValue(catalogue), ...extra } as unknown as Api
  const profile = username ? ({ username } as CurrentUser) : null
  return renderWithApp(<DesignView />, { context: { api, profile }, route: '/designs/d1', path: '/designs/:id' })
}

describe('DesignView', () => {
  beforeEach(resetCatalogue)

  it('shows the prompt, author, preview and parts list signed out', async () => {
    renderDesign(vi.fn().mockResolvedValue(design()))

    expect(await screen.findByRole('heading', { level: 1, name: 'A white 2x2 KALLAX' })).toBeInTheDocument()
    expect(screen.getByText('by calm-smiling-kestrel')).toBeInTheDocument()
    expect(await screen.findByText('preview')).toBeInTheDocument()
    expect(screen.getByText('Fix to the wall.')).toBeInTheDocument()
  })

  it('links to the original of a fork', async () => {
    const getDesign = vi.fn((id: string) => Promise.resolve(design({ id, forkedFrom: id === 'd1' ? 'd0' : '' })))
    renderDesign(getDesign)
    expect(await screen.findByRole('link', { name: 'forked from the original' })).toHaveAttribute('href', '/designs/d0')
  })

  it('says when the original of a fork is deleted', async () => {
    const getDesign = vi.fn((id: string) =>
      id === 'd1' ? Promise.resolve(design({ forkedFrom: 'd0' })) : Promise.reject(new ApiError(404, 'design not found')),
    )
    renderDesign(getDesign)
    expect(await screen.findByText('forked · original deleted')).toBeInTheDocument()
  })

  it('says not found for a 404', async () => {
    renderDesign(vi.fn().mockRejectedValue(new ApiError(404, 'design not found')))
    expect(await screen.findByText('Design not found.')).toBeInTheDocument()
  })

  it('offers a fork to anyone but delete only to the owner', async () => {
    renderDesign(vi.fn().mockResolvedValue(design()), {}, 'someone-else')
    expect(await screen.findByRole('link', { name: 'Fork' })).toHaveAttribute('href', '/design')
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('deletes after the owner confirms', async () => {
    const deleteDesign = vi.fn().mockResolvedValue(undefined)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderDesign(vi.fn().mockResolvedValue(design()), { deleteDesign }, 'calm-smiling-kestrel')

    const button = await screen.findByRole('button', { name: 'Delete' })
    await userEvent.click(button)
    expect(deleteDesign).not.toHaveBeenCalled()
    await userEvent.click(button)
    expect(deleteDesign).toHaveBeenCalledWith('d1')
    confirm.mockRestore()
  })
})
