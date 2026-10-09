// packages/pipeline/references/pixabay.ts
// Pixabay references (pixabay.com/api). PIXABAY_API_KEY (Vercel ivywolf-api). Photos only, safesearch on, the
// orientation the card's form suits. Credit "via Pixabay", linking to the image's Pixabay page. Pixabay's image URLs
// are served for a limited time, which suits references: they're fetched live on every call and never kept.
//
// Relevance (H.0c follow-up): Pixabay matches loosely, so it gets only the first 3 query words, joined with "+" so it
// ANDs them, and a result is kept only if its tags share at least MIN_SHARED words with the query, generic words
// ("person", "woman", "background" …) not counting. It's never kept as padding, and it's only asked at all when
// Unsplash (and her pins) came up short (index.ts). It asks for more than it needs so the filter has room.

import { sharedWords } from './query'
import type { Reference, ReferenceProvider } from './types'

const API = 'https://pixabay.com/api/'
/** Non-generic words a result's tags must share with the query. */
export const MIN_SHARED = 2
/** Words of the query Pixabay gets, ANDed. */
export const PIXABAY_WORDS = 3
/** Candidates fetched so the tag filter can still find `limit` on-topic ones. */
const CANDIDATES = 20

/** Pixabay's q: the first PIXABAY_WORDS words, each URL-encoded, joined by a literal "+" (its AND). */
export function pixabayQ(query: string): string {
  return query.split(/\s+/).filter(Boolean).slice(0, PIXABAY_WORDS).map(encodeURIComponent).join('+')
}

export interface Hit {
  id: number
  /** Comma-separated, e.g. "kitchen scale, kitchen scales, weighing". */
  tags: string
  pageURL: string
  webformatURL: string
  largeImageURL: string
  imageWidth: number
  imageHeight: number
}

export const pixabayReferences: ReferenceProvider = {
  source: 'pixabay',
  available: () => !!process.env.PIXABAY_API_KEY,
  async find(query, { orientation, limit }) {
    const params = new URLSearchParams({
      key: process.env.PIXABAY_API_KEY ?? '',
      image_type: 'photo',
      safesearch: 'true',
      orientation: orientation === 'portrait' ? 'vertical' : orientation === 'landscape' ? 'horizontal' : 'all',
      per_page: String(Math.min(200, Math.max(3, CANDIDATES))), // Pixabay takes 3–200
    })
    // q is added by hand: URLSearchParams would turn the "+" that ANDs the words into %2B.
    const res = await fetch(`${API}?${params}&q=${pixabayQ(query)}`, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`pixabay ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const body = (await res.json()) as { hits?: Hit[] }
    return onTopic(body.hits ?? [], query).slice(0, limit).map(
      (h): Reference => ({
        source: 'pixabay',
        id: String(h.id),
        thumb_url: h.webformatURL,
        full_url: h.largeImageURL,
        link_url: h.pageURL,
        credit: { name: 'via Pixabay', url: h.pageURL },
        width: h.imageWidth,
        height: h.imageHeight,
      })
    )
  },
}

/** Only hits whose tags share MIN_SHARED non-generic words with the query (plurals count: "scales" ~ "scale"). */
export function onTopic(hits: Hit[], query: string): Hit[] {
  return hits.filter((h) => sharedWords(h.tags ?? '', query) >= MIN_SHARED)
}
