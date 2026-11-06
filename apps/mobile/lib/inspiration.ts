// apps/mobile/lib/inspiration.ts
// The inspiration demo ("Nothing" look) — the Ivy library: reference pictures and clips, searched in plain words
// (GET /api/inspiration/search), "more like this" for one (GET /api/inspiration/{id}/more), and the test screen's
// mic (POST /api/inspiration/listen). All behind INSPIRATION_ENABLED on the server: a 404 from the API means the
// flag is off, and the app shows nothing of it — no test screen results, no Ivy library row on the idea page.
//
// The items come with signed URLs good for an hour (expires_in). They're kept in memory by id so a tile's own page
// opens without a second fetch; past the hour the page asks for them again.

const API_URL = process.env.EXPO_PUBLIC_API_URL!

export type People = 'none' | 'hands' | 'person'
export const PEOPLE: People[] = ['none', 'hands', 'person']

export interface InspirationItem {
  id: string
  path: string
  kind: 'photo' | 'video'
  folder: string
  width: number | null
  height: number | null
  caption: string
  keywords: string[]
  colours: string[]
  shot: string
  people: People
  /** Signed, for an hour from when it was fetched. */
  url: string
}

/** The flag is off (the API answers 404): callers hide the library rather than show an error. */
export class LibraryOff extends Error {
  constructor() {
    super('The Ivy library is off')
  }
}

interface Page {
  items: InspirationItem[]
  expires_in: number
}

/** Fetched items by id, and when their URLs stop working (ms). */
const seen = new Map<string, { item: InspirationItem; until: number }>()
/** URLs are treated as expired this long before they are, so a page never opens on a link about to die. */
const EXPIRY_MARGIN_MS = 5 * 60_000

function remember(page: Page, now = Date.now()): InspirationItem[] {
  const until = now + page.expires_in * 1000 - EXPIRY_MARGIN_MS
  for (const item of page.items) seen.set(item.id, { item, until })
  return page.items
}

/** An item fetched in the last hour (its URL still good), or null. */
export function recall(id: string, now = Date.now()): InspirationItem | null {
  const hit = seen.get(id)
  return hit && hit.until > now ? hit.item : null
}

async function get(token: string, path: string): Promise<InspirationItem[]> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404 && path.startsWith('/api/inspiration/search')) throw new LibraryOff()
  if (!res.ok) throw new Error(res.status === 404 ? 'That picture has gone' : 'The Ivy library didn’t load')
  return remember((await res.json()) as Page)
}

/** Up to `limit` (≤ 24) items for the words; empty words show the newest. Throws LibraryOff when the flag is off. */
export function searchLibrary(token: string, q: string, opts: { limit?: number; people?: People } = {}): Promise<InspirationItem[]> {
  const params = new URLSearchParams({ q: q.slice(0, QUERY_MAX), limit: String(opts.limit ?? 24) })
  if (opts.people) params.set('people', opts.people)
  return get(token, `/api/inspiration/search?${params}`)
}

/** "More like this" for one item: never the item, near-duplicates never side by side. */
export function moreLikeThis(token: string, id: string, limit = 6): Promise<InspirationItem[]> {
  return get(token, `/api/inspiration/${id}/more?limit=${limit}`)
}

/** The mic: a short recording (a file URI from expo-audio) → the words heard, as a query. */
export async function listen(token: string, uri: string): Promise<string> {
  const audio = await (await fetch(uri)).blob()
  const res = await fetch(`${API_URL}/api/inspiration/listen`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/mp4' },
    body: audio,
  })
  if (res.status === 404) throw new LibraryOff()
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
  if (!res.ok) throw new Error(body.error ?? 'Couldn’t hear that')
  return body.text ?? ''
}

/** The API's cap on a query (apps/web search route). */
export const QUERY_MAX = 200

/** What the idea page searches the library with: the idea's own words, title first. */
export function ideaQuery(idea: { title: string; gist: string }): string {
  return `${idea.title}. ${idea.gist}`.replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX)
}

/**
 * A tile's height ÷ width. Portrait first: anything wider than 4:5 (landscape, square) is cropped to 4:5; a taller
 * picture keeps its shape up to 9:16, so a portrait clip stays tall and the masonry stays uneven.
 */
export const PORTRAIT = 5 / 4
export const TALLEST = 16 / 9
export function tileRatio(item: Pick<InspirationItem, 'width' | 'height'>): number {
  if (!item.width || !item.height) return PORTRAIT
  return Math.min(TALLEST, Math.max(PORTRAIT, item.height / item.width))
}

/** Two columns, each item to the shorter one (as Home's masonry), measured by tileRatio. */
export function libraryColumns<T extends Pick<InspirationItem, 'width' | 'height'>>(items: T[]): [T[], T[]] {
  const cols: [T[], T[]] = [[], []]
  const heights = [0, 0]
  for (const item of items) {
    const c = heights[0] <= heights[1] ? 0 : 1
    cols[c].push(item)
    heights[c] += tileRatio(item)
  }
  return cols
}

/** "product" → "Product", "flat_lay" → "Flat lay". */
export const shotLabel = (shot: string) => (shot.charAt(0).toUpperCase() + shot.slice(1)).replace(/_/g, ' ')

// For tests only.
export const __forget = () => seen.clear()
export const __remember = remember
