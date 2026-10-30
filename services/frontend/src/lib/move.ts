/**
 * Moving a part of a layout by hand. A part dragged and dropped snaps to the nearest spot where it
 * could rest - a free cell, a surface, or the floor beside another part - carrying whatever sits in
 * or on it. The backend's validator still has the last word (`POST /layouts/check`).
 */
import type { Catalogue, Layout, Part } from './api'

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface Offer extends Box {
  owner: number
  name: string
  kind: string
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** The part each placed part sits in or on, and that slot's name, or undefined for the floor. */
function holders(layout: Layout, parts: (Part | undefined)[], offers: Offer[]): ({ owner: number; name: string } | undefined)[] {
  return layout.parts.map(({ x, y }, j) => {
    const part = parts[j]
    if (!part?.size) return undefined
    const box = { x, y, w: part.size.w, h: part.size.h }
    const s = offers.find((s) => {
      if (s.owner === j || !part.restsOn.includes(s.name)) return false
      if (s.kind === 'cell') return s.x === x && s.y === y
      if (s.kind === 'surface') return s.y === y && x < s.x + s.w && s.x < x + box.w
      return x >= s.x && y >= s.y && x + box.w <= s.x + s.w && y + box.h <= s.y + s.h
    })
    return s && { owner: s.owner, name: s.name }
  })
}

function setUp(layout: Layout, catalogue: Catalogue, index: number) {
  const parts = layout.parts.map((p) => catalogue.parts.find((c) => c.article === p.article))
  const offers: Offer[] = layout.parts.flatMap(({ x, y }, owner) =>
    (parts[owner]?.offers ?? []).map((s) => ({ owner, name: s.name, kind: s.kind, x: x + s.x, y: y + s.y, w: s.w, h: s.h })),
  )
  const held = holders(layout, parts, offers)

  // The part and, in turn, everything resting in or on what is already carried.
  const carried = new Set([index])
  for (let grew = true; grew; ) {
    grew = false
    held.forEach((h, j) => {
      if (h && carried.has(h.owner) && !carried.has(j)) {
        carried.add(j)
        grew = true
      }
    })
  }
  return { parts, offers, held, carried }
}

/** Part `index` and everything resting in or on it, in turn: what moves when it does. */
export function carried(layout: Layout, catalogue: Catalogue, index: number): Set<number> {
  return setUp(layout, catalogue, index).carried
}

/**
 * Moves part `index` and everything it holds to the free spot nearest to having its bottom-left
 * corner at `x`, `y`, or returns null when there is none.
 *
 * ponytail: a part in a front or an inside only goes to that slot's bottom-left corner, so a shelf
 * can't be slid up a wardrobe; add positions inside those when a range needs them.
 */
export function drop(layout: Layout, catalogue: Catalogue, index: number, x: number, y: number): Layout | null {
  const { parts, offers, held, carried } = setUp(layout, catalogue, index)
  const part = parts[index]
  if (!part?.size) return null

  const { w, h } = part.size
  const spots: (Box & { owner?: number; name: string })[] = offers
    .filter((s) => !carried.has(s.owner) && part.restsOn.includes(s.name))
    .flatMap((s) => (s.kind === 'surface' ? [s, { ...s, x: s.x + s.w - w }] : [s]).map((p) => ({ ...p, w, h })))
  // On the floor where it was dropped, or beside any other part, so it can stand next to a frame on
  // an underframe too.
  if (part.restsOn.includes('floor')) {
    spots.push({ x: Math.round(x), y: 0, w, h, name: 'floor' })
    layout.parts.forEach(({ x }, k) => {
      const other = parts[k]?.size
      if (!carried.has(k) && other) spots.push({ x: x - w, y: 0, w, h, name: 'floor' }, { x: x + other.w, y: 0, w, h, name: 'floor' })
    })
  }

  // A spot is free when nothing outside the move overlaps it but its host and what that holds in
  // a different slot, such as a door in front of an insert.
  const free = (spot: (typeof spots)[number]) =>
    layout.parts.every((p, k) => {
      const size = parts[k]?.size
      if (carried.has(k) || !size || k === spot.owner) return true
      if (held[k] && held[k].owner === spot.owner && held[k].name !== spot.name) return true
      return !overlaps(spot, { x: p.x, y: p.y, w: size.w, h: size.h })
    })

  const distance = (s: Box) => Math.hypot(s.x - x, s.y - y)
  const best = spots.filter(free).sort((a, b) => distance(a) - distance(b))[0]
  if (!best) return null

  const from = layout.parts[index]
  const dx = best.x - from.x
  const dy = best.y - from.y
  return { ...layout, parts: layout.parts.map((p, k) => (carried.has(k) ? { ...p, x: p.x + dx, y: p.y + dy } : p)) }
}
