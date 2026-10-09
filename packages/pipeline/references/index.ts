// packages/pipeline/references/index.ts
// findReferences(card, { sources, limit }) — a small set of free visual references for More ideas to show beside a
// suggestion (Job H.0c). References steer: they are never a frame, a take or a generation input, and nothing here
// writes to the database or storage.
//
//   1. The query: the card's visual_query, else its title + gist, with names stripped (query.ts).
//   2. Every requested source that's available runs in parallel; one that fails or times out is skipped, never fatal.
//   3. Results interleave across sources (one from each in turn), duplicates drop (same source+id, or the same image),
//      and the first `limit` come back (default 6).
// Pinterest is a source only when the connector is configured and she has connected (pinterestReferences(token)).

import { refusePinterest } from '@ivywolf/schema'
import { orientationFor, referenceQuery } from './query'
import { unsplashReferences } from './unsplash'
import { pixabayReferences } from './pixabay'
import { pinterestReferences } from './pinterest'
import type { Reference, ReferenceCard, ReferenceProvider, ReferenceSource } from './types'

export type { Reference, ReferenceCard, ReferenceSource } from './types'
export { referenceQuery, orientationFor, contentWords } from './query'
export { trackReferenceUse } from './unsplash'
export { pinterestAvailable, pinterestReferences } from './pinterest'

export const DEFAULT_LIMIT = 6
export const DEFAULT_SOURCES: ReferenceSource[] = ['unsplash', 'pixabay', 'pinterest']

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

/** One from each source in turn, in the order the sources were asked for. */
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
  const sources = [...new Set(opts.sources ?? DEFAULT_SOURCES)]
  const lists = await Promise.all(
    sources.map(async (s) => {
      const p = live[s]
      if (!p?.available()) return []
      try {
        return await p.find(query, { orientation, limit })
      } catch (err) {
        console.warn(`[references] ${s} skipped: ${err instanceof Error ? err.message : err}`)
        return []
      }
    })
  )
  return dedupe(interleave(lists)).slice(0, limit)
}
