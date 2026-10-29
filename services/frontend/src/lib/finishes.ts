/** Preview colours for the catalogue's finishes. A two-tone finish ("black/off-white") not listed
 * here takes its first colour; anything else unknown is grey. Kept apart from lib/blueprint so the
 * gallery and parts list can use it without pulling in Three.js. */
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
