// packages/pipeline/references/pixabay.ts
// Pixabay references (pixabay.com/api). PIXABAY_API_KEY (Vercel ivywolf-api). Photos only, safesearch on, the
// orientation the card's form suits. Credit "via Pixabay", linking to the image's Pixabay page. Pixabay's image URLs
// are served for a limited time, which suits references: they're fetched live on every call and never kept.

import type { Reference, ReferenceProvider } from './types'

const API = 'https://pixabay.com/api/'

interface Hit {
  id: number
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
      q: query.slice(0, 100), // Pixabay's limit on q
      image_type: 'photo',
      safesearch: 'true',
      orientation: orientation === 'portrait' ? 'vertical' : orientation === 'landscape' ? 'horizontal' : 'all',
      per_page: String(Math.min(200, Math.max(3, limit))), // Pixabay takes 3–200
    })
    const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`pixabay ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const body = (await res.json()) as { hits?: Hit[] }
    return (body.hits ?? []).slice(0, limit).map(
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
