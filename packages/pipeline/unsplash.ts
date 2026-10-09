// packages/pipeline/unsplash.ts
// A photo card's picture (Job G.1 §1.2, lane 2): a real photograph from Unsplash, found from the card's plain-words
// visual_query (shape_v1). Unsplash API guidelines, non-negotiable:
//   - hotlink: frame_url is the photo's own images.unsplash.com URL — never re-hosted;
//   - credit: "Photo by <name> on Unsplash" on the tile and the idea page, both names linking back with
//     utm_source=ivywolf&utm_medium=referral (the links are stored with the utm already on them);
//   - download tracking: download_location is called once, when the photo becomes a card's frame.
// Only the visual_query leaves — never a name, the transcript or anything else of hers.
// The key is UNSPLASH_ACCESS_KEY (Vercel env). Demo keys are limited to 50 requests an hour; one search per photo card.

const API = 'https://api.unsplash.com'
const PER_PAGE = 6
const UTM = 'utm_source=ivywolf&utm_medium=referral'

export interface UnsplashPhoto {
  /** Hotlinked images.unsplash.com URL, sized for a phone. */
  url: string
  attribution: {
    provider: 'unsplash'
    photo_id: string
    photographer: string
    photographer_url: string
    photo_url: string
    download_location: string
  }
}

export interface ApiPhoto {
  id: string
  color: string | null
  likes: number
  width: number
  height: number
  urls: { regular: string; small: string }
  links: { html: string; download_location: string }
  user: { name: string; links: { html: string } }
}

export const withUtm = (url: string) => `${url}${url.includes('?') ? '&' : '?'}${UTM}`

function key(): string {
  const k = process.env.UNSPLASH_ACCESS_KEY
  if (!k) throw new Error('UNSPLASH_ACCESS_KEY is not set')
  return k
}

const headers = () => ({ Authorization: `Client-ID ${key()}`, 'Accept-Version': 'v1' })

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

/** 0 (on the palette) … 1 (as far as colours go): distance from a photo's dominant colour to the nearest pack colour. */
export function paletteDistance(colour: string | null, palette: string[]): number {
  const c = colour ? rgb(colour) : null
  const ps = palette.map(rgb).filter((p): p is [number, number, number] => !!p)
  if (!c || ps.length === 0) return 0.5
  const d = Math.min(...ps.map((p) => Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2])))
  return d / Math.hypot(255, 255, 255)
}

/** Near her palette first, then the one more people liked (log-scaled, so likes break ties rather than dominate). */
export function score(p: Pick<ApiPhoto, 'color' | 'likes'>, palette: string[]): number {
  return (1 - paletteDistance(p.color, palette)) * 2 + Math.log10(1 + Math.max(0, p.likes)) / 4
}

/**
 * A page of photos for a query (also the references lane, Job H.0c). content_filter high always. Throws on a missing
 * key or an API error.
 */
export async function searchPhotos(
  query: string,
  { orientation = 'portrait', perPage = PER_PAGE }: { orientation?: 'portrait' | 'landscape' | 'squarish' | null; perPage?: number } = {}
): Promise<ApiPhoto[]> {
  const params = new URLSearchParams({ query, content_filter: 'high', per_page: String(perPage) })
  if (orientation) params.set('orientation', orientation)
  const res = await fetch(`${API}/search/photos?${params}`, { headers: headers(), signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`unsplash ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { results?: ApiPhoto[] }
  return body.results ?? []
}

/** The best portrait photo for a query, or null when Unsplash has nothing. Throws on a missing key or API error. */
export async function searchPhoto(query: string, palette: string[]): Promise<UnsplashPhoto | null> {
  const best = [...(await searchPhotos(query))].sort((a, b) => score(b, palette) - score(a, palette))[0]
  if (!best) return null
  return {
    url: best.urls.regular,
    attribution: {
      provider: 'unsplash',
      photo_id: best.id,
      photographer: best.user.name,
      photographer_url: withUtm(best.user.links.html),
      photo_url: withUtm(best.links.html),
      download_location: best.links.download_location,
    },
  }
}

/** Unsplash's download event — once, when a photo becomes a card's frame. A failure is logged, never fatal. */
export async function trackDownload(downloadLocation: string): Promise<void> {
  try {
    const res = await fetch(downloadLocation, { headers: headers(), signal: AbortSignal.timeout(10_000) })
    if (!res.ok) console.error(`[unsplash] download event ${res.status}`)
  } catch (err) {
    console.error('[unsplash] download event failed', err)
  }
}
