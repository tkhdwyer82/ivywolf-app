// packages/pipeline/references/query.ts
// The search words for a card's references. Job B revised's Unsplash lane searches with the card's visual_query (the
// classifier's 2–6 plain words) after the name guard; references do the same, and fall back to the card's own title
// and gist, reduced to its content words, when it has no visual_query. The names of anyone heard are stripped before
// the words leave (redact.ts), as for photo cards.

import { stripPeople } from '../redact'
import type { Orientation, ReferenceCard } from './types'

/** At most this many words go to a search — the same budget the classifier gives a visual_query. */
export const MAX_QUERY_WORDS = 6

const STOP = new Set(
  `a an the and or but of to in on at by for with from into onto over under about as is are was were be been being it
  its this that these those there here we i you he she they them our my your his her their me us so then than too very
  just also only even not no do does did done doing have has had having will would should could can may might must
  shall what which who whom whose when where why how all any each every some such more most other another same own
  get got make made like want wants wanted need needs idea ideas video videos thing things something maybe really
  one two lot lots kind sort way ends end ending saying says said`.split(/\s+/)
)

/** Content words, in order, de-duplicated: lowercase letters and digits, no stop words, no quoted speech. */
export function contentWords(text: string): string[] {
  const out: string[] = []
  for (const w of text.replace(/["“”][^"“”]*["“”]/g, ' ').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w) || out.includes(w)) continue
    out.push(w)
  }
  return out
}

/** The query for a card: its visual_query, else its title then gist, guarded and capped. Empty when nothing is left. */
export function referenceQuery(card: ReferenceCard, people: string[] = []): string {
  const base = card.visual_query?.trim() ? card.visual_query : [card.title, card.gist ?? ''].join(' ')
  const guarded = stripPeople(base, people).text
  return contentWords(guarded).slice(0, MAX_QUERY_WORDS).join(' ')
}

/**
 * The orientation that suits the card's form: a photo card and a text card stand tall in the masonry (portrait); a
 * board or a comparison reads across (landscape); a quote takes either.
 */
export function orientationFor(shape: ReferenceCard['shape']): Orientation {
  if (shape === 'photo' || shape === 'text' || shape == null) return 'portrait'
  if (shape === 'board' || shape === 'diagram') return 'landscape'
  return 'any'
}
