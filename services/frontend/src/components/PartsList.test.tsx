import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Catalogue } from '../gen/app/v1/catalogue'
import type { Layout } from '../gen/app/v1/layout'
import { articleList, partIcon, partsLines } from '../lib/partsList'
import { PartsList } from './PartsList'

const frame = { article: '80275887', name: 'KALLAX shelving unit', finish: 'white', size: { w: 770, h: 1470, d: 390 }, restsOn: ['floor'], offers: [] }
const box = { article: '10625714', name: 'DRÖNA box', finish: 'black', size: { w: 330, h: 330, d: 380 }, restsOn: ['cube'], offers: [] }
const catalogue: Catalogue = { parts: [frame, box] }
const layout: Layout = {
  parts: [
    { article: '80275887', x: 0, y: 0 },
    { article: '10625714', x: 45, y: 45 },
    { article: '10625714', x: 395, y: 45 },
  ],
}

describe('partsLines', () => {
  it('groups parts by article, counting each, in order of first use', () => {
    expect(partsLines(layout, catalogue)).toEqual([
      { article: '80275887', part: frame, quantity: 1 },
      { article: '10625714', part: box, quantity: 2 },
    ])
  })
})

describe('articleList', () => {
  it('lists one formatted article number and quantity per line', () => {
    expect(articleList(partsLines(layout, catalogue))).toBe('802.758.87 × 1\n106.257.14 × 2')
  })
})

describe('PartsList', () => {
  it('shows each part linked to its IKEA UK page, with its article number and quantity', () => {
    render(<PartsList layout={layout} catalogue={catalogue} notes={[]} />)
    const row = screen.getByRole('row', { name: /DRÖNA box/ })
    expect(within(row).getByRole('link', { name: 'DRÖNA box, black, 33×33 cm' })).toHaveAttribute(
      'href',
      'https://www.ikea.com/gb/en/p/-10625714/',
    )
    expect(within(row).getByText('106.257.14')).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
  })

  it('shows the build notes', () => {
    render(<PartsList layout={layout} catalogue={catalogue} notes={['Fix to the wall: this design is stacked.']} />)
    expect(screen.getByText('Fix to the wall: this design is stacked.')).toBeInTheDocument()
  })

  it('copies the article numbers', async () => {
    const user = userEvent.setup()
    render(<PartsList layout={layout} catalogue={catalogue} notes={[]} />)
    await user.click(screen.getByRole('button', { name: 'Copy article numbers' }))
    expect(await navigator.clipboard.readText()).toBe('802.758.87 × 1\n106.257.14 × 2')
  })
})

describe('partIcon', () => {
  it('draws doors, drawers and frames apart, with a parcel for anything else', () => {
    expect(partIcon('KALLAX insert with door')).toBe(partIcon('TONSTAD door'))
    expect(partIcon('KALLAX insert with 2 drawers')).toBe(partIcon('KOMPLEMENT drawer'))
    expect(partIcon('KALLAX shelving unit')).toBe(partIcon('PAX wardrobe frame'))
    expect(partIcon('KALLAX shelving unit')).not.toBe(partIcon('TONSTAD door'))
    expect(partIcon('')).not.toBe(partIcon('KALLAX shelving unit'))
  })
})
