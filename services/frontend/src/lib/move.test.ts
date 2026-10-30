import { describe, expect, it } from 'vitest'
import type { Catalogue } from './api'
import { move } from './move'

// A 2x1 frame, the underframe it stands on, an insert for its cells and a bookcase.
const catalogue: Catalogue = {
  parts: [
    {
      article: 'frame',
      name: 'KALLAX shelving unit',
      finish: 'white',
      size: { w: 770, h: 410, d: 390 },
      restsOn: ['floor', 'base'],
      offers: [
        { name: 'cube', kind: 'cell', x: 42, y: 37, w: 335, h: 335 },
        { name: 'cube', kind: 'cell', x: 392, y: 37, w: 335, h: 335 },
      ],
    },
    {
      article: 'underframe',
      name: 'KALLAX underframe',
      finish: 'black',
      size: { w: 760, h: 180, d: 390 },
      restsOn: ['floor'],
      offers: [{ name: 'base', kind: 'surface', x: 0, y: 180, w: 760, h: 0 }],
    },
    { article: 'insert', name: 'KALLAX insert', finish: 'white', size: { w: 330, h: 330, d: 370 }, restsOn: ['cube'], offers: [] },
    { article: 'bookcase', name: 'BILLY bookcase', finish: 'white', size: { w: 400, h: 1060, d: 280 }, restsOn: ['floor'], offers: [] },
  ],
}

const frame = { article: 'frame', x: 0, y: 0 }
const insert = { article: 'insert', x: 42, y: 37 }

describe('move', () => {
  it('steps an insert to the next free cell, and no further', () => {
    const moved = move({ parts: [frame, insert] }, catalogue, 1, 'right')
    expect(moved?.parts[1]).toMatchObject({ x: 392, y: 37 })
    expect(move(moved!, catalogue, 1, 'right')).toBeNull()
  })

  it('skips a taken cell', () => {
    expect(move({ parts: [frame, insert, { article: 'insert', x: 392, y: 37 }] }, catalogue, 1, 'right')).toBeNull()
  })

  it('carries what stands on a part, up to its neighbour on the floor and then past it', () => {
    const layout = {
      parts: [{ article: 'underframe', x: 0, y: 0 }, { article: 'frame', x: 0, y: 180 }, { article: 'insert', x: 42, y: 217 }, { article: 'bookcase', x: 800, y: 0 }],
    }
    const touching = move(layout, catalogue, 0, 'right')!
    expect(touching.parts.map((p) => p.x)).toEqual([40, 40, 82, 800])
    expect(move(touching, catalogue, 0, 'right')?.parts).toEqual([
      { article: 'underframe', x: 1200, y: 0 },
      { article: 'frame', x: 1200, y: 180 },
      { article: 'insert', x: 1242, y: 217 },
      { article: 'bookcase', x: 800, y: 0 },
    ])
  })
})
