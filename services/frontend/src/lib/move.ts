/**
 * Moving a part of a layout by hand. A move is a jump to the next spot in one direction where the
 * part could rest - a free cell, a surface, or the floor beside another part - carrying whatever
 * sits in or on it. The backend's validator still has the last word (`POST /layouts/check`).
 */
import type { Catalogue, Layout, Part } from './api'

export type Direction = 'left' | 'right' | 'up' | 'down'

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

/**
 * Moves part `index` and everything it holds to the nearest spot in `direction`, or returns null
 * when there is none. Sideways moves keep to the nearest row, up and down to the nearest column.
 *
 * ponytail: a part in a front or an inside only goes to that slot's bottom-left corner, so a shelf
 * can't be slid up a wardrobe; add steps inside those when a range needs them.
 */
export function move(layout: Layout, catalogue: Catalogue, index: number, direction: Direction): Layout | null {
  const parts = layout.parts.map((p) => catalogue.parts.find((c) => c.article === p.article))
  const part = parts[index]
  if (!part?.size) return null
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

  const { w, h } = part.size
  const from = layout.parts[index]
  const spots: (Box & { owner?: number; name: string })[] = offers
    .filter((s) => !carried.has(s.owner) && part.restsOn.includes(s.name))
    .flatMap((s) => (s.kind === 'surface' ? [s, { ...s, x: s.x + s.w - w }] : [s]).map((p) => ({ ...p, w, h })))
  // On the floor, beside any other part, so it can stand next to a frame on an underframe too.
  if (part.restsOn.includes('floor')) {
    layout.parts.forEach(({ x }, k) => {
      const other = parts[k]?.size
      if (!carried.has(k) && other) spots.push({ x: x - w, y: 0, w, h, name: 'floor' }, { x: x + other.w, y: 0, w, h, name: 'floor' })
    })
  }

  // A spot is free when nothing outside the move overlaps it but its host and what that holds in
  // a different slot, such as a door in front of an insert.
  const free = (spot: (typeof spots)[number]) =>
    layout.parts.every(({ x, y }, k) => {
      const size = parts[k]?.size
      if (carried.has(k) || !size || k === spot.owner) return true
      if (held[k] && held[k].owner === spot.owner && held[k].name !== spot.name) return true
      return !overlaps(spot, { x, y, w: size.w, h: size.h })
    })

  const sideways = direction === 'left' || direction === 'right'
  const sign = direction === 'right' || direction === 'up' ? 1 : -1
  const ahead = (s: Box) => sign * (sideways ? s.x - from.x : s.y - from.y)
  const across = (s: Box) => Math.abs(sideways ? s.y - from.y : s.x - from.x)
  const best = spots
    .filter((s) => ahead(s) > 0 && free(s))
    .sort((a, b) => across(a) - across(b) || ahead(a) - ahead(b))[0]
  if (!best) return null

  const dx = best.x - from.x
  const dy = best.y - from.y
  return { ...layout, parts: layout.parts.map((p, k) => (carried.has(k) ? { ...p, x: p.x + dx, y: p.y + dy } : p)) }
}
