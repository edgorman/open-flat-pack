import { describe, expect, it } from 'vitest'
import type { Catalogue } from './api'
import { carried, drop } from './move'

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

describe('drop', () => {
  it('snaps an insert to the free cell nearest where it was dropped', () => {
    expect(drop({ parts: [frame, insert] }, catalogue, 1, 500, 100)?.parts[1]).toMatchObject({ x: 392, y: 37 })
  })

  it('skips a taken cell', () => {
    const layout = { parts: [frame, insert, { article: 'insert', x: 392, y: 37 }] }
    expect(drop(layout, catalogue, 1, 392, 37)?.parts[1]).toMatchObject({ x: 42, y: 37 })
  })

  it('carries what stands on a part, and stands it on the floor where it was dropped', () => {
    const layout = {
      parts: [{ article: 'underframe', x: 0, y: 0 }, { article: 'frame', x: 0, y: 180 }, { article: 'insert', x: 42, y: 217 }, { article: 'bookcase', x: 800, y: 0 }],
    }
    expect([...carried(layout, catalogue, 0)]).toEqual([0, 1, 2])
    expect(drop(layout, catalogue, 0, 1500, 300)?.parts).toEqual([
      { article: 'underframe', x: 1500, y: 0 },
      { article: 'frame', x: 1500, y: 180 },
      { article: 'insert', x: 1542, y: 217 },
      { article: 'bookcase', x: 800, y: 0 },
    ])
    // Dropped overlapping the bookcase, it snaps beside it instead.
    expect(drop(layout, catalogue, 0, 1000, 0)?.parts[0]).toMatchObject({ x: 1200, y: 0 })
  })
})
