/**
 * Builds the blueprint scene for a layout: plain boxes in their finish colour, outlined in black,
 * with a floor grid, dimension lines and a person for scale. See docs/design/v1/0005-preview.md.
 *
 * Units are mm. x runs right and y up, as in the layout; z points at the viewer, with every part's
 * front face at z = 0 since they all stand against the same wall.
 */
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  EdgesGeometry,
  ExtrudeGeometry,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  Path,
  PlaneGeometry,
  Shape,
  Vector3,
} from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Catalogue, Layout, Part } from './api'

/** Preview colours for the catalogue's finishes. A two-tone finish ("black/off-white") not listed
 * here takes its first colour; anything else unknown is grey. */
const FINISHES: Record<string, string> = {
  white: '#f4f4f1',
  'high-gloss white': '#ffffff',
  black: '#2a2a2a',
  'black-brown': '#3d2d26',
  'brown walnut effect': '#6e4b34',
  'brown-red': '#8c3b2c',
  'grey/wood effect': '#9b958c',
  'white stained oak effect': '#e3d7c3',
  'pine/woven poplar': '#cfa974',
  blue: '#3b64a8',
  'dark blue/white': '#24395c',
  'dark grey': '#555555',
  'dotted/beige': '#d9c9a9',
  'wave shaped/light grey-blue': '#a9b8c6',
}

export function finishColour(finish: string): string {
  return FINISHES[finish] ?? FINISHES[finish.split('/')[0]] ?? '#b5b5b5'
}

/** Gap between the drawing and its first dimension line, and between dimension lines. */
const DIM_GAP = 150

export interface Blueprint {
  object: Group
  /** The drawing's extent without the floor grid, for framing the camera. */
  bounds: Box3
}

interface Placed {
  part: Part
  x: number
  y: number
}

type Interval = [number, number]

export function buildBlueprint(layout: Layout, catalogue: Catalogue, ink: string): Blueprint {
  const parts = new Map(catalogue.parts.map((p) => [p.article, p]))
  const cellSlots = new Set(catalogue.parts.flatMap((p) => p.offers.filter((s) => s.kind === 'cell').map((s) => s.name)))
  const placed: Placed[] = layout.parts.flatMap(({ article, x, y }) => {
    const part = parts.get(article)
    return part?.size ? [{ part, x, y }] : []
  })
  // Structure is everything that does not sit in a cell: frames, underframes, legs.
  const structure = placed.filter((p) => !p.part.restsOn.some((name) => cellSlots.has(name)))

  const object = new Group()
  const lines = new LineBasicMaterial({ color: ink })
  // Parts keep a black outline in dark mode too, so a white part does not lose its edges.
  const outline = new LineBasicMaterial({ color: '#111111' })
  for (const p of placed) object.add(drawPart(p, outline))
  if (placed.length === 0) return { object, bounds: new Box3(new Vector3(), new Vector3()) }

  const extent = new Box3().setFromObject(object)
  const { min, max } = extent
  const ticks: Group[] = []

  // Each structural part's width in rows under the floor, then the overall width.
  const widths = rows(structure.map((p) => [p.x, p.x + p.part.size!.w] as Interval), [min.x, max.x])
  widths.forEach((row, i) =>
    row.forEach(([a, b]) => ticks.push(dimension([a, 0], [b, 0], [0, -DIM_GAP * (i + 1)], lines))),
  )
  ticks.push(dimension([min.x, 0], [max.x, 0], [0, -DIM_GAP * (widths.length + 1)], lines))

  // Each structural part's height in columns on the right, and the overall height on the left.
  const heights = rows(structure.map((p) => [p.y, p.y + p.part.size!.h] as Interval), [0, max.y])
  heights.forEach((column, i) =>
    column.forEach(([a, b]) => ticks.push(dimension([max.x, a], [max.x, b], [DIM_GAP * (i + 1), 0], lines))),
  )
  ticks.push(dimension([min.x, 0], [min.x, max.y], [-DIM_GAP, 0], lines))

  object.add(...ticks, person(min.x - DIM_GAP * 2 - 300, lines))
  const bounds = new Box3().setFromObject(object)

  // A line every 100 mm, reaching well past the drawing in every direction.
  const span = Math.ceil((Math.max(bounds.max.x - bounds.min.x, max.y) + 2000) / 1000) * 1000
  const grid = new GridHelper(span, span / 100, ink, ink)
  grid.position.x = Math.round((bounds.min.x + bounds.max.x) / 200) * 100
  const gridMaterial = grid.material as LineBasicMaterial
  gridMaterial.transparent = true
  gridMaterial.opacity = 0.12
  object.add(grid)

  return { object, bounds }
}

/** A part as a box, or, when it offers cells, as a carcass with a recessed cell at each. */
function drawPart({ part, x, y }: Placed, outline: LineBasicMaterial): Group {
  const { w, h, d } = part.size!
  const colour = new Color(finishColour(part.finish))
  const cells = part.offers.filter((s) => s.kind === 'cell')
  const group = new Group()
  group.position.set(x, y, 0)

  let geometry: BufferGeometry
  if (cells.length === 0) {
    geometry = new BoxGeometry(w, h, d).translate(w / 2, h / 2, -d / 2)
  } else {
    const shape = new Shape().moveTo(0, 0).lineTo(w, 0).lineTo(w, h).lineTo(0, h).closePath()
    for (const c of cells) {
      shape.holes.push(new Path().moveTo(c.x, c.y).lineTo(c.x, c.y + c.h).lineTo(c.x + c.w, c.y + c.h).lineTo(c.x + c.w, c.y).closePath())
    }
    geometry = new ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }).translate(0, 0, -d)
    // A shaded back, so an empty cell reads as a recess rather than a hole.
    const back = new Mesh(new PlaneGeometry(w, h), new MeshLambertMaterial({ color: colour.clone().multiplyScalar(0.7) }))
    back.position.set(w / 2, h / 2, -d + 1)
    group.add(back)
  }
  group.add(new Mesh(geometry, new MeshLambertMaterial({ color: colour })), new LineSegments(new EdgesGeometry(geometry), outline))
  return group
}

/**
 * Sorts the distinct intervals into rows that do not overlap, so each row is one chain of
 * dimensions. A lone interval spanning the whole drawing is left to the overall dimension.
 */
function rows(intervals: Interval[], overall: Interval): Interval[][] {
  const distinct = [...new Map(intervals.map((i) => [i.join(), i])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (distinct.length === 1 && distinct[0].join() === overall.join()) return []
  const out: Interval[][] = []
  for (const interval of distinct) {
    const row = out.find((r) => r[r.length - 1][1] <= interval[0])
    if (row) row.push(interval)
    else out.push([interval])
  }
  return out
}

/** A dimension line between two points in the front plane, drawn offset from them, with
 * extension lines, slash ticks and its length in cm. */
function dimension(from: [number, number], to: [number, number], offset: [number, number], lines: LineBasicMaterial): Group {
  const [ox, oy] = offset
  const length = Math.hypot(ox, oy)
  const [ux, uy] = [ox / length, oy / length]
  const a = new Vector3(from[0] + ox, from[1] + oy, 0)
  const b = new Vector3(to[0] + ox, to[1] + oy, 0)
  const tick = new Vector3(30, 30, 0)
  const points = [
    a, b,
    // Extension lines, from just off the drawing to just past the dimension line.
    new Vector3(from[0] + ux * 20, from[1] + uy * 20, 0), new Vector3(a.x + ux * 30, a.y + uy * 30, 0),
    new Vector3(to[0] + ux * 20, to[1] + uy * 20, 0), new Vector3(b.x + ux * 30, b.y + uy * 30, 0),
    a.clone().sub(tick), a.clone().add(tick),
    b.clone().sub(tick), b.clone().add(tick),
  ]
  const group = new Group()
  group.add(new LineSegments(new BufferGeometry().setFromPoints(points), lines))

  const label = document.createElement('span')
  label.className = 'blueprint-label'
  label.textContent = `${+(a.distanceTo(b) / 10).toFixed(1)} cm`
  const text = new CSS2DObject(label)
  text.position.copy(a).lerp(b, 0.5)
  group.add(text)
  return group
}

/** A stick figure 1.75 m tall, standing on the floor at x, for scale. */
function person(x: number, lines: LineBasicMaterial): LineSegments {
  const p = (px: number, py: number) => new Vector3(x + px, py, 0)
  const head: Vector3[] = []
  for (let i = 0; i < 24; i++) {
    const t0 = (i / 24) * Math.PI * 2
    const t1 = ((i + 1) / 24) * Math.PI * 2
    head.push(p(Math.cos(t0) * 110, 1640 + Math.sin(t0) * 110), p(Math.cos(t1) * 110, 1640 + Math.sin(t1) * 110))
  }
  const body = [
    p(0, 1530), p(0, 850), // spine
    p(0, 850), p(-180, 0), // legs
    p(0, 850), p(180, 0),
    p(0, 1420), p(-260, 900), // arms
    p(0, 1420), p(260, 900),
  ]
  return new LineSegments(new BufferGeometry().setFromPoints([...head, ...body]), lines)
}
