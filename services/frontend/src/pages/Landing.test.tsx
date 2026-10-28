import '@testing-library/jest-dom/vitest'
import { screen } from '@testing-library/react'
import { renderWithApp } from '../testUtils'
import { Landing } from './Landing'

describe('Landing', () => {
  it('links to the prompt page and the gallery', () => {
    renderWithApp(<Landing />)
    expect(screen.getByRole('link', { name: 'Start a design' })).toHaveAttribute('href', '/design')
    expect(screen.getByRole('link', { name: 'Browse the gallery' })).toHaveAttribute('href', '/designs')
  })
})
