// Card gradients (Figma 1462:4, "Card gradients · palette"). Not Figma variables, so not generated: copied from the
// frame. Each project carries one (projects.gradient, 0034), assigned round-robin in this order; a non-photo card
// renders its project's gradient top to bottom, with white or ink text as the palette lists. Lime is never a card
// colour.

export const GRADIENT_NAMES = ['ember', 'peach', 'lagoon', 'dusk', 'sky', 'orchid', 'meadow', 'honey', 'blaze', 'ice'] as const
export type GradientName = (typeof GRADIENT_NAMES)[number]

export interface CardGradient {
  name: GradientName
  label: string
  /** Top, then bottom. */
  colors: readonly [string, string]
  /** The palette's "white text" or "ink text". */
  ink: boolean
}

export const gradients: Record<GradientName, CardGradient> = {
  ember: { name: 'ember', label: 'Ember', colors: ['#EE6A5F', '#A8322F'], ink: false },
  peach: { name: 'peach', label: 'Peach', colors: ['#F6CF72', '#EE5DBE'], ink: true },
  lagoon: { name: 'lagoon', label: 'Lagoon', colors: ['#7EDFC7', '#4A9A8E'], ink: true },
  dusk: { name: 'dusk', label: 'Dusk', colors: ['#63AAD6', '#252670'], ink: false },
  sky: { name: 'sky', label: 'Sky', colors: ['#B4D4FB', '#6E8EF5'], ink: true },
  orchid: { name: 'orchid', label: 'Orchid', colors: ['#8E4CF0', '#E668A8'], ink: false },
  meadow: { name: 'meadow', label: 'Meadow', colors: ['#6CB86A', '#EEF06A'], ink: true },
  honey: { name: 'honey', label: 'Honey', colors: ['#F8D467', '#EDA45E'], ink: true },
  blaze: { name: 'blaze', label: 'Blaze', colors: ['#EEA94C', '#D12E1F'], ink: false },
  ice: { name: 'ice', label: 'Ice', colors: ['#8BF0FC', '#63AEF5'], ink: true },
}

/** A project's gradient; anything unknown (a row from before 0034) falls back to the first. */
export function gradientOf(name: string | null | undefined): CardGradient {
  return (name && gradients[name as GradientName]) || gradients.ember
}
