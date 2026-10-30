import { Mesh, type MeshStandardMaterial } from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Catalogue, Layout } from './api'
import { buildBlueprint, finishColour, scramble, type Palette } from './blueprint'

const palette: Palette = { ink: '#000', paper: '#fff', accent: '#00f' }

// A 2x1 frame with two cells, a narrower underframe it stands on, an insert for a cell, and a
// bookcase with a door for its front.
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
    {
      article: 'insert',
      name: 'KALLAX insert with 2 drawers',
      finish: 'black-brown',
      size: { w: 330, h: 330, d: 370 },
      restsOn: ['cube'],
      offers: [],
    },
    {
      article: 'bookcase',
      name: 'BILLY bookcase',
      finish: 'white',
      size: { w: 400, h: 1060, d: 280 },
      restsOn: ['floor'],
      offers: [{ name: 'front', kind: 'front', x: 0, y: 0, w: 400, h: 1060 }],
    },
    {
      article: 'door',
      name: 'OXBERG door',
      finish: 'white',
      size: { w: 400, h: 970, d: 20 },
      restsOn: ['front'],
      offers: [],
    },
  ],
}

function labels(layout: Layout): string[] {
  const out: string[] = []
  buildBlueprint(layout, catalogue, palette).measures.traverse((o) => {
    if (o instanceof CSS2DObject) out.push(o.element.textContent!)
  })
  return out.sort()
}

describe('buildBlueprint', () => {
  it("hangs a door on its bookcase's front face and leaves it out of the measures", () => {
    const { object } = buildBlueprint(
      { parts: [{ article: 'door', x: 0, y: 0 }, { article: 'bookcase', x: 0, y: 0 }] },
      catalogue,
      palette,
    )
    expect(object.children.map((g) => g.position.z)).toEqual([20, 0])
    expect(labels({ parts: [{ article: 'bookcase', x: 0, y: 0 }, { article: 'door', x: 0, y: 0 }] })).toEqual(['106 cm', '40 cm'])
  })

  it('measures each structural part and the whole, in cm', () => {
    const layout: Layout = {
      parts: [
        { article: 'underframe', x: 5, y: 0 },
        { article: 'frame', x: 0, y: 180 },
        { article: 'insert', x: 42, y: 217 },
      ],
    }
    // Widths: underframe 76, overall 77 (the frame's width is the overall one). Heights: underframe
    // 18, frame 41, overall 59.
    expect(labels(layout)).toEqual(['18 cm', '41 cm', '59 cm', '76 cm', '77 cm'])
  })

  it('leaves out a lone part measured by the overall dimensions', () => {
    expect(labels({ parts: [{ article: 'frame', x: 0, y: 0 }] })).toEqual(['41 cm', '77 cm'])
  })

  it('skips articles missing from the catalogue', () => {
    const { object } = buildBlueprint({ parts: [{ article: 'gone', x: 0, y: 0 }] }, catalogue, palette)
    expect(object.children).toHaveLength(0)
  })

  it('colours each part by its finish, with a recessed back behind a frame', () => {
    const { object } = buildBlueprint({ parts: [{ article: 'frame', x: 0, y: 0 }, { article: 'insert', x: 42, y: 37 }] }, catalogue, palette)
    const meshes: Mesh[] = []
    object.traverse((o) => o instanceof Mesh && meshes.push(o))
    // The frame's back and body, then the insert.
    expect(meshes).toHaveLength(3)
    expect('#' + (meshes[2].material as MeshStandardMaterial).color.getHexString()).toBe(finishColour('black-brown'))
  })
})

describe('finishColour', () => {
  it('falls back to the first tone, then to grey', () => {
    expect(finishColour('black/off-white')).toBe(finishColour('black'))
    expect(finishColour('chartreuse')).toBe('#b5b5b5')
  })
})

describe('scramble', () => {
  it('stands random floor parts side by side', () => {
    const rolls = [0.99, 0, 0.99, 0, 0.99]
    const { parts } = scramble(catalogue, () => rolls.shift()!)
    expect(parts).toEqual([
      { article: 'frame', x: 0, y: 0 },
      { article: 'bookcase', x: 770, y: 0 },
      { article: 'frame', x: 1170, y: 0 },
      { article: 'bookcase', x: 1940, y: 0 },
    ])
  })
})
