/**
 * Builds the preview scene for a layout: parts as boxes in their finish colour with thin outlines,
 * dimension lines, and a floor with a 10 cm grid and a scale bar. See docs/design/v1/0005-preview.md.
 *
 * Units are mm. x runs right and y up, as in the layout; z points at the viewer, with every part's
 * front face at z = 0 since they all stand against the same wall, except doors, whose back is.
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
  MeshBasicMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  ShadowMaterial,
  Shape,
  Vector3,
} from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Catalogue, Layout, Part } from './api'
import { finishColour } from './finishes'

export { finishColour }

/** Gap between the drawing and its first dimension line, and between dimension lines. */
const DIM_GAP = 150

/** ink draws the floor grid and scale bar, paper fills the scale bar's light blocks, and accent
 * draws the dimensions. */
export interface Palette {
  ink: string
  paper: string
  accent: string
}

export interface Blueprint {
  /** The parts. */
  object: Group
  /** The dimension lines, shown or hidden together. */
  measures: Group
  /** The floor: grid, scale bar and the shadow the parts cast. */
  floor: Group
  /** The parts, dimensions and scale bar together, for framing the camera. */
  bounds: Box3
}

interface Placed {
  part: Part
  x: number
  y: number
  /** A door, which sits on its part's front face rather than behind it. */
  inFront: boolean
}

type Interval = [number, number]

export function buildBlueprint(layout: Layout, catalogue: Catalogue, palette: Palette): Blueprint {
  const parts = new Map(catalogue.parts.map((p) => [p.article, p]))
  const slotNames = (kind: string) =>
    new Set(catalogue.parts.flatMap((p) => p.offers.filter((s) => s.kind === kind).map((s) => s.name)))
  const heldSlots = new Set([...slotNames('cell'), ...slotNames('inside')])
  const frontSlots = slotNames('front')
  const placed: Placed[] = layout.parts.flatMap(({ article, x, y }) => {
    const part = parts.get(article)
    return part?.size ? [{ part, x, y, inFront: part.restsOn.some((name) => frontSlots.has(name)) }] : []
  })
  // Structure is everything that does not sit in a cell, a front or an inside: frames, underframes.
  const structure = placed.filter((p) => !p.inFront && !p.part.restsOn.some((name) => heldSlots.has(name)))

  const object = new Group()
  const measures = new Group()
  const floor = new Group()
  // A quiet outline in both themes, so a white part keeps its edges without looking drawn in pen.
  const outline = new LineBasicMaterial({ color: '#1d2129', transparent: true, opacity: 0.3 })
  for (const p of placed) object.add(drawPart(p, outline))
  if (placed.length === 0) return { object, measures, floor, bounds: new Box3(new Vector3(), new Vector3()) }

  const { min, max } = new Box3().setFromObject(object)
  const lines = new LineBasicMaterial({ color: palette.accent })
  const at = (x: number, y: number, z = 0) => new Vector3(x, y, z)

  // Each structural part's width in rows on the floor in front, then the overall width.
  const widths = rows(structure.map((p) => [p.x, p.x + p.part.size!.w] as Interval), [min.x, max.x])
  widths.forEach((row, i) =>
    row.forEach(([a, b]) => measures.add(dimension(at(a, 0), at(b, 0), at(0, 0, DIM_GAP * (i + 1)), lines))),
  )
  measures.add(dimension(at(min.x, 0), at(max.x, 0), at(0, 0, DIM_GAP * (widths.length + 1)), lines))

  // Each structural part's height in columns on the right, and the overall height on the left.
  const heights = rows(structure.map((p) => [p.y, p.y + p.part.size!.h] as Interval), [0, max.y])
  heights.forEach((column, i) =>
    column.forEach(([a, b]) => measures.add(dimension(at(max.x, a), at(max.x, b), at(DIM_GAP * (i + 1), 0), lines))),
  )
  measures.add(dimension(at(min.x, 0), at(min.x, max.y), at(-DIM_GAP, 0), lines))

  const drawing = new Box3().setFromObject(object).union(new Box3().setFromObject(measures))
  const [bar, ...rest] = drawFloor(drawing, min.x, DIM_GAP * (widths.length + 2.5), palette)
  floor.add(bar, ...rest)
  return { object, measures, floor, bounds: drawing.union(new Box3().setFromObject(bar)) }
}

/** A part as a box, or, when it offers cells or an inside, as a carcass with a recess at each. */
function drawPart({ part, x, y, inFront }: Placed, outline: LineBasicMaterial): Group {
  const { w, h, d } = part.size!
  const colour = new Color(finishColour(part.finish))
  const cells = part.offers.filter((s) => s.kind === 'cell' || s.kind === 'inside')
  const group = new Group()
  group.position.set(x, y, inFront ? d : 0)

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
    const back = new Mesh(new PlaneGeometry(w, h), finish(colour.clone().multiplyScalar(0.85)))
    back.position.set(w / 2, h / 2, -d + 1)
    back.receiveShadow = true
    group.add(back)
  }
  const body = new Mesh(geometry, finish(colour))
  body.castShadow = true
  body.receiveShadow = true
  group.add(body, new LineSegments(new EdgesGeometry(geometry, 20), outline))
  return group
}

function finish(color: Color): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.75, metalness: 0 })
}

/**
 * The floor under the drawing: a grid with a line every 10 cm and a stronger one every metre, a
 * plane that catches the parts' shadow, and a 0-100 cm scale bar `inFront` mm in front of the parts.
 * The scale bar comes first, since it is framed with the drawing.
 */
function drawFloor(bounds: Box3, left: number, inFront: number, { ink, paper }: Palette) {
  const span = Math.ceil((Math.max(bounds.max.x - bounds.min.x, bounds.max.y) + 3000) / 1000) * 1000
  const centre = Math.round((bounds.min.x + bounds.max.x) / 200) * 100
  const grid = (divisions: number, opacity: number) => {
    const g = new GridHelper(span, divisions, ink, ink)
    const m = g.material as LineBasicMaterial
    m.transparent = true
    m.opacity = opacity
    m.depthWrite = false
    g.position.set(centre, 0.5, 0)
    return g
  }

  const shadow = new Mesh(new PlaneGeometry(span, span).rotateX(-Math.PI / 2), new ShadowMaterial({ opacity: 0.16 }))
  shadow.position.set(centre, 0, 0)
  shadow.receiveShadow = true

  // Four 25 cm blocks, alternating ink and paper, outlined in ink.
  const bar = new Group()
  const blocks = [ink, paper, ink, paper].map((colour, i) => {
    const block = new Mesh(new BoxGeometry(250, 4, 40).translate(125 + i * 250, 2, 0), new MeshBasicMaterial({ color: colour }))
    return [block, new LineSegments(new EdgesGeometry(block.geometry), new LineBasicMaterial({ color: ink }))]
  })
  bar.add(...blocks.flat())
  for (const [x, text] of [[0, '0'], [500, '50'], [1000, '100 cm']] as const) bar.add(label(text, 'blueprint-scale', new Vector3(x, 0, 90)))
  bar.position.set(left, 0, inFront)

  return [bar, grid(span / 100, 0.08), grid(span / 1000, 0.18), shadow]
}

function label(text: string, className: string, position: Vector3): CSS2DObject {
  const el = document.createElement('span')
  el.className = className
  el.textContent = text
  const o = new CSS2DObject(el)
  o.position.copy(position)
  return o
}

/**
 * Sorts the distinct intervals into rows that do not overlap, so each row is one chain of
 * dimensions. An interval spanning the whole drawing is left to the overall dimension.
 */
function rows(intervals: Interval[], overall: Interval): Interval[][] {
  const distinct = [...new Map(intervals.map((i) => [i.join(), i])).values()]
    .filter((i) => i.join() !== overall.join())
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const out: Interval[][] = []
  for (const interval of distinct) {
    const row = out.find((r) => r[r.length - 1][1] <= interval[0])
    if (row) row.push(interval)
    else out.push([interval])
  }
  return out
}

/** A dimension line between two points, drawn `offset` away from them, with extension lines, end
 * ticks and its length in cm. */
function dimension(from: Vector3, to: Vector3, offset: Vector3, lines: LineBasicMaterial): Group {
  const unit = offset.clone().normalize()
  const a = from.clone().add(offset)
  const b = to.clone().add(offset)
  const points = [
    a, b,
    // Extension lines, from just off the drawing to just past the dimension line.
    from.clone().addScaledVector(unit, 20), a.clone().addScaledVector(unit, 30),
    to.clone().addScaledVector(unit, 20), b.clone().addScaledVector(unit, 30),
    // Short ticks across each end.
    a.clone().addScaledVector(unit, -25), a.clone().addScaledVector(unit, 25),
    b.clone().addScaledVector(unit, -25), b.clone().addScaledVector(unit, 25),
  ]
  const group = new Group()
  group.add(new LineSegments(new BufferGeometry().setFromPoints(points), lines))
  group.add(label(`${+(a.distanceTo(b) / 10).toFixed(1)} cm`, 'blueprint-label', a.clone().lerp(b, 0.5)))
  return group
}
