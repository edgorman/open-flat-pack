import { render } from '@testing-library/react'
import type { Catalogue } from '../lib/api'
import { Thumbnail } from './Thumbnail'

const catalogue: Catalogue = {
  parts: [
    {
      article: 'frame',
      name: 'KALLAX shelving unit',
      finish: 'white',
      size: { w: 420, h: 410, d: 390 },
      restsOn: ['floor'],
      offers: [{ name: 'cube', kind: 'cell', x: 42, y: 37, w: 335, h: 335 }],
    },
  ],
}

describe('Thumbnail', () => {
  it('draws a frame with its cell cut out, flipped so the floor is at the bottom', () => {
    const { container } = render(<Thumbnail layout={{ parts: [{ article: 'frame', x: 0, y: 0 }] }} catalogue={catalogue} />)
    expect(container.querySelector('path')).toHaveAttribute('d', 'M0 0h420v410h-420zM42 38h335v335h-335z')
  })

  it('draws nothing for parts missing from the catalogue', () => {
    const { container } = render(<Thumbnail layout={{ parts: [{ article: 'gone', x: 0, y: 0 }] }} catalogue={catalogue} />)
    expect(container).toBeEmptyDOMElement()
  })
})
