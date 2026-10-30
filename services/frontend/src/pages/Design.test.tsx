import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetCatalogue } from '../hooks/useCatalogue'
import { ApiError, type Api, type Catalogue, type Design as DesignType, type Layout } from '../lib/api'
import { renderWithApp } from '../testUtils'
import { Design } from './Design'

// WebGL doesn't exist in jsdom; the preview has its own tests.
vi.mock('../components/Preview', () => ({ Preview: () => <div>preview</div> }))

const user = { id: 'uid-1', email: 'a@b.com', name: 'Ada' }
const catalogue = { parts: [] } as unknown as Catalogue
const layout: Layout = { parts: [{ article: '80275887', x: 0, y: 0 }] }

function setup(createLayout: Api['createLayout'], createDesign?: Api['createDesign'], state?: unknown, updateDesign?: Api['updateDesign']) {
  const api = { createLayout, createDesign, updateDesign, getCatalogue: vi.fn().mockResolvedValue(catalogue) } as unknown as Api
  renderWithApp(<Design />, { context: { api, user }, route: '/design', state })
}

describe('Design', () => {
  beforeEach(resetCatalogue)

  it('asks a signed-out caller to sign in', () => {
    renderWithApp(<Design />, { context: { api: { getCatalogue: vi.fn(() => new Promise(() => {})) } as unknown as Api }, route: '/design' })
    expect(screen.getByText('Sign in to design something.')).toBeInTheDocument()
  })

  it('shows the layout, then refines it with the next prompt', async () => {
    const createLayout = vi.fn().mockResolvedValue({ layout, validation: { errors: [], notes: ['Fix to the wall.'] } })
    setup(createLayout)

    await userEvent.type(screen.getByLabelText('What do you want?'), 'A 2x2 KALLAX')
    await userEvent.click(screen.getByRole('button', { name: 'Design' }))
    expect(await screen.findByText('preview')).toBeInTheDocument()
    expect(screen.getByText('Fix to the wall.')).toBeInTheDocument()
    expect(createLayout).toHaveBeenCalledWith({ prompt: 'A 2x2 KALLAX', baseLayout: undefined })

    await userEvent.type(screen.getByLabelText('What should change?'), 'Taller')
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }))
    expect(createLayout).toHaveBeenLastCalledWith({ prompt: 'Taller', baseLayout: layout })
  })

  it('veils the current design while refining it', async () => {
    let resolve!: (v: unknown) => void
    const createLayout = vi.fn().mockResolvedValueOnce({ layout, validation: { errors: [], notes: [] } })
    createLayout.mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    setup(createLayout)

    await userEvent.type(screen.getByLabelText('What do you want?'), 'A 2x2 KALLAX')
    await userEvent.click(screen.getByRole('button', { name: 'Design' }))
    await userEvent.type(await screen.findByLabelText('What should change?'), 'Taller')
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Designing')
    expect(screen.getByText('preview')).toBeInTheDocument()

    resolve({ layout, validation: { errors: [], notes: [] } })
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('lists the remaining errors on a 422', async () => {
    const body = { errors: [{ message: 'Too tall' }], notes: [] }
    setup(vi.fn().mockRejectedValue(new ApiError(422, 'Request failed with 422', body)))

    await userEvent.type(screen.getByLabelText('What do you want?'), 'A 9 m tower')
    await userEvent.click(screen.getByRole('button', { name: 'Design' }))
    expect(await screen.findByText('Too tall')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Try rephrasing it.')
  })

  it('publishes the layout under the first prompt', async () => {
    const createLayout = vi.fn().mockResolvedValue({ layout, validation: { errors: [], notes: [] } })
    const createDesign = vi.fn().mockResolvedValue({ id: 'd9' })
    setup(createLayout, createDesign)

    await userEvent.type(screen.getByLabelText('What do you want?'), 'A 2x2 KALLAX')
    await userEvent.click(screen.getByRole('button', { name: 'Design' }))
    await userEvent.type(await screen.findByLabelText('What should change?'), 'Taller')
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    expect(createDesign).toHaveBeenCalledWith({ prompt: 'A 2x2 KALLAX', layout, forkedFrom: '' })
  })

  it('forks a design: refines its layout, then publishes with forkedFrom', async () => {
    const original = { id: 'd0', layout: { parts: [] }, notes: [] } as unknown as DesignType
    const createLayout = vi.fn().mockResolvedValue({ layout, validation: { errors: [], notes: [] } })
    const createDesign = vi.fn().mockResolvedValue({ id: 'd9' })
    setup(createLayout, createDesign, { fork: original })

    expect(await screen.findByText('preview')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('What should change?'), 'Add legs')
    await userEvent.click(screen.getByRole('button', { name: 'Refine' }))
    expect(createLayout).toHaveBeenCalledWith({ prompt: 'Add legs', baseLayout: original.layout })
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    expect(createDesign).toHaveBeenCalledWith({ prompt: 'Add legs', layout, forkedFrom: 'd0' })
  })

  it('edits a design: renames it and saves it in place', async () => {
    const original = { id: 'd0', prompt: 'A shelf', layout, notes: [] } as unknown as DesignType
    const createDesign = vi.fn()
    const updateDesign = vi.fn().mockResolvedValue({ id: 'd0' })
    setup(vi.fn(), createDesign, { edit: original }, updateDesign)

    const title = await screen.findByLabelText('Title')
    expect(title).toHaveValue('A shelf')
    await userEvent.clear(title)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await userEvent.type(title, 'My media wall')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(updateDesign).toHaveBeenCalledWith('d0', { prompt: 'My media wall', layout })
    expect(createDesign).not.toHaveBeenCalled()
  })
})
