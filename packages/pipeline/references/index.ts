// packages/pipeline/references/index.ts
// findReferences(card, { sources, limit }) — a small set of free visual references for More ideas to show beside a
// suggestion (Job H.0c). References steer: they are never a frame, a take or a generation input, and nothing here
// writes to the database or storage.
//
//   1. The query: the card's visual_query, else its title + gist, with names stripped (query.ts).
//   2. Sources fill in priority order (H.0c follow-up): Unsplash first; her Pinterest pins top up; Pixabay tops up
//      last. A lower source is called only while the results are still short of `limit`, so when Unsplash has 6,
//      nobody else is asked. One that's unavailable is skipped without a call; one that fails is skipped, never fatal.
//   3. Duplicates drop (same source+id, or the same image) and the first `limit` come back (default 6). Every source
//      returns only on-topic results (Pixabay filters by tags; Unsplash's own ranking is trusted), so nothing
//      off-topic is ever padding: fewer on-topic results than `limit` means fewer come back.
// Pinterest is a source only when the connector is configured and she has connected (pinterestReferences(token)).

import { refusePinterest } from '@ivywolf/schema'
import { orientationFor, referenceQuery } from './query'
import { unsplashReferences } from './unsplash'
import { pixabayReferences } from './pixabay'
import { pinterestReferences } from './pinterest'
import type { Reference, ReferenceCard, ReferenceProvider, ReferenceSource } from './types'

export type { Reference, ReferenceCard, ReferenceSource } from './types'
export { referenceQuery, orientationFor, contentWords, sharesWord } from './query'
export { trackReferenceUse } from './unsplash'
export { pinterestAvailable, pinterestReferences } from './pinterest'

export const DEFAULT_LIMIT = 6
export const DEFAULT_SOURCES: ReferenceSource[] = ['unsplash', 'pixabay', 'pinterest']
/** Who fills first. Pinterest's place (above Pixabay) is a choice: her own pins before stock. */
export const PRIORITY: ReferenceSource[] = ['unsplash', 'pinterest', 'pixabay']

export interface FindOptions {
  sources?: ReferenceSource[]
  limit?: number
  /** Names heard in the card's recording, stripped from the query (peopleFor()). */
  people?: string[]
  /** Her Pinterest access token for this request (from Vault, via the web app); null when she hasn't connected. */
  pinterestToken?: string | null
  /** For tests: the providers to use instead of the live ones. */
  providers?: Partial<Record<ReferenceSource, ReferenceProvider>>
}

/** One from each source in turn. (Not the fill order any more — see PRIORITY; kept for callers that want a mix.) */
export function interleave(lists: Reference[][]): Reference[] {
  const out: Reference[] = []
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i])
  return out
}

/** Drop repeats: the same source+id, or the same image (thumb or full URL) from anywhere. First one wins. */
export function dedupe(refs: Reference[]): Reference[] {
  const seen = new Set<string>()
  return refs.filter((r) => {
    const keys = [`${r.source}:${r.id}`, r.full_url, r.thumb_url]
    if (keys.some((k) => seen.has(k))) return false
    keys.forEach((k) => seen.add(k))
    return true
  })
}

export async function findReferences(card: ReferenceCard, opts: FindOptions = {}): Promise<Reference[]> {
  // A card that came from Pinterest is a pin: never used to search with (packages/schema/pinterest.ts).
  refusePinterest('findReferences', card.source)
  const limit = Math.max(1, Math.min(24, opts.limit ?? DEFAULT_LIMIT))
  const query = referenceQuery(card, opts.people)
  if (!query) return []
  const orientation = orientationFor(card.shape)
  const live: Record<ReferenceSource, ReferenceProvider> = {
    unsplash: unsplashReferences,
    pixabay: pixabayReferences,
    pinterest: pinterestReferences(opts.pinterestToken ?? null),
    ...opts.providers,
  }
  const asked = new Set(opts.sources ?? DEFAULT_SOURCES)
  let out: Reference[] = []
  for (const s of PRIORITY.filter((x) => asked.has(x))) {
    if (out.length >= limit) break // filled: lower sources aren't called
    const p = live[s]
    if (!p?.available()) continue
    try {
      out = dedupe([...out, ...(await p.find(query, { orientation, limit: limit - out.length }))])
    } catch (err) {
      console.warn(`[references] ${s} skipped: ${err instanceof Error ? err.message : err}`)
    }
  }
  return out.slice(0, limit)
}
