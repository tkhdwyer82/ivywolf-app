// packages/pipeline/references/pinterest.ts
// Her own Pinterest pins as references (Job H.0c), within Pinterest's developer terms (packages/schema/pinterest.ts):
//   - fetched live on every call with her access token (the web app reads it from Vault and passes it in); nothing
//     is cached or stored beyond the request — no rows, no files, no copies;
//   - shown unaltered: only Pinterest's uncropped width-fitted images (600x, 1200x), never the 150x150 or 400x300
//     crops, and nothing overlaid; each links to its pin, credited to its board's name;
//   - never an input: a Pinterest reference never reaches generate() (pin image hosts are refused there) or
//     style_signals (refused in the app and by 0036).
// The API has no search over her pins, so the ranking is done here: her boards, a page of pins from each, scored by
// how many of the query's words they share (title, description, alt text, board name).

import { isPinterestUrl } from '@ivywolf/schema'
import { contentWords } from './query'
import type { Reference, ReferenceProvider } from './types'

const API = 'https://api.pinterest.com/v5'
/** Live calls per references request: one for boards, one per board — bounded so a big account stays quick. */
export const MAX_BOARDS = 8
const PINS_PER_BOARD = 25

/** The connector is usable only with both app credentials; the secret is pending Pinterest trial access. */
export const pinterestAvailable = () => !!process.env.PINTEREST_APP_ID && !!process.env.PINTEREST_APP_SECRET

export interface Pin {
  id: string
  title?: string | null
  description?: string | null
  alt_text?: string | null
  board_id?: string
  created_at?: string
  media?: { media_type?: string; images?: Record<string, { url: string; width: number; height: number }> }
}
interface Board {
  id: string
  name: string
}

/** Score a pin against the query words: one point per shared word. */
export function pinScore(pin: Pin, boardName: string, words: string[]): number {
  const text = new Set(contentWords([pin.title, pin.description, pin.alt_text, boardName].filter(Boolean).join(' ')))
  return words.filter((w) => text.has(w)).length
}

/** Pinterest's pin page — where every Pinterest reference links. */
export const pinUrl = (id: string) => `https://www.pinterest.com/pin/${encodeURIComponent(id)}/`

/** A pin as a reference, or null when it has no uncropped image (videos, or crops only). */
export function pinReference(pin: Pin, boardName: string): Reference | null {
  const images = pin.media?.images ?? {}
  // Unaltered: width-fitted sizes only ('600x', '1200x'); '150x150' and '400x300' are crops.
  const thumb = images['600x'] ?? images['1200x']
  const full = images['1200x'] ?? images['600x']
  if ((pin.media?.media_type && pin.media.media_type !== 'image') || !thumb || !full) return null
  if (!isPinterestUrl(thumb.url) || !isPinterestUrl(full.url)) return null // only Pinterest's own image hosts
  return {
    source: 'pinterest',
    id: pin.id,
    thumb_url: thumb.url,
    full_url: full.url,
    link_url: pinUrl(pin.id),
    credit: { name: boardName, url: pinUrl(pin.id) },
    width: full.width,
    height: full.height,
  }
}

async function get<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`pinterest ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

/** Her pins as a references provider, for one request. Without the app secret or her token it is unavailable. */
export function pinterestReferences(accessToken: string | null): ReferenceProvider {
  return {
    source: 'pinterest',
    available: () => pinterestAvailable() && !!accessToken,
    async find(query, { limit }) {
      if (!accessToken) return []
      const words = contentWords(query)
      if (!words.length) return []
      const boards = (await get<{ items?: Board[] }>(`/boards?page_size=${MAX_BOARDS}`, accessToken)).items ?? []
      const pages = await Promise.all(
        boards.slice(0, MAX_BOARDS).map(async (b) => {
          try {
            const pins = (await get<{ items?: Pin[] }>(`/boards/${encodeURIComponent(b.id)}/pins?page_size=${PINS_PER_BOARD}`, accessToken)).items ?? []
            return pins.map((pin) => ({ pin, board: b.name }))
          } catch {
            return [] // one board failing doesn't lose the rest
          }
        })
      )
      return pages
        .flat()
        .map((x) => ({ ...x, score: pinScore(x.pin, x.board, words) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || (b.pin.created_at ?? '').localeCompare(a.pin.created_at ?? ''))
        .map((x) => pinReference(x.pin, x.board))
        .filter((r): r is Reference => !!r)
        .slice(0, limit)
    },
  }
}
