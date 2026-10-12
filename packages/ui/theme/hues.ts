// Project hues (Home v4, Figma 1737:2: "Flat colour blocks, no gradients"). Not Figma variables, so not generated:
// butter, slate and cool-grey are measured from the v4 frame (1737:140, 1737:75, 1737:129), sage from the project
// blocks (83:397); coral has no fill in the frames yet and matches their lightness. Each project carries one
// (projects.hue, 0039), assigned in this order as projects are made; My things is always cool-grey. The hue is an
// idea's block while a picture is being found, the chip's underline and the project's swatch. Ink text on every hue.

export const HUE_NAMES = ['coral', 'sage', 'butter', 'slate', 'cool-grey'] as const
export type HueName = (typeof HUE_NAMES)[number]

export const hues: Record<HueName, string> = {
  coral: '#F2CFC2',
  sage: '#DCE3D3',
  butter: '#F2E3B2',
  slate: '#C7CCD6',
  'cool-grey': '#DBE3EB',
}

/** A project's hue as a colour; anything unknown (a row from before 0039) is cool-grey. */
export function hueOf(name: string | null | undefined): string {
  return (name && hues[name as HueName]) || hues['cool-grey']
}

/**
 * Each hue at full colour, for a deck's link line (Figma 1743:14 draws coral's, #F5856B, 3 wide). The other four
 * aren't drawn in the frames yet; they're the same depth of their own hue.
 */
export const hueLines: Record<HueName, string> = {
  coral: '#F5856B',
  sage: '#8DB07F',
  butter: '#E2B53E',
  slate: '#7D88A6',
  'cool-grey': '#8CA2BA',
}

export function hueLineOf(name: string | null | undefined): string {
  return (name && hueLines[name as HueName]) || hueLines['cool-grey']
}
