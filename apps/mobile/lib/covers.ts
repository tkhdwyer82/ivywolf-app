// apps/mobile/lib/covers.ts
// ••• → Change cover on the idea page (B.12, behind INSPIRATION_ENABLED): the Ivy library's six photos nearest the
// idea's words (GET /api/cards/{id}/covers, signed for an hour), and setting one (POST, { item_id }). The server
// copies the photo into her frames folder and credits it "Ivy library" (packages/pipeline/covers.ts). Off, the GET
// is a 404 and the page never offers it.

const API_URL = process.env.EXPO_PUBLIC_API_URL!

export interface CoverChoice {
  id: string
  url: string
  caption: string
  width: number | null
  height: number | null
  similarity: number
}

/** The library is off (404): the caller hides Change cover. */
export class CoversOff extends Error {
  constructor() {
    super('Change cover is off')
  }
}

export async function loadCoverChoices(token: string, cardId: string): Promise<CoverChoice[]> {
  const res = await fetch(`${API_URL}/api/cards/${cardId}/covers`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404) throw new CoversOff()
  if (!res.ok) throw new Error('The Ivy library didn’t load')
  return ((await res.json()) as { items: CoverChoice[] }).items
}

export async function setCover(token: string, cardId: string, itemId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/cards/${cardId}/covers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ item_id: itemId }),
  })
  if (res.status === 409) throw new Error('This idea wears your own picture')
  if (!res.ok) throw new Error('That cover didn’t change')
}

/** ••• → Restore previous cover: the picture the ladder or Change cover replaced goes back. */
export async function restorePreviousCover(token: string, cardId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/cards/${cardId}/covers/restore`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 409) throw new Error('There’s no earlier cover to go back to')
  if (!res.ok) throw new Error('That cover didn’t change back')
}

/** ••• → Photo credit for a ladder cover. */
export function coverCredit(p: { source: string; caption?: string | null }): { title: string; body: string } | null {
  if (p.source === 'library') return { title: 'Photo credit', body: p.caption ? `Ivy library\n${p.caption}` : 'Ivy library' }
  if (p.source === 'generated') return { title: 'Photo credit', body: 'Made by Ivy, styled on Ivy library pictures' }
  return null
}

/** Change cover is offered when the library is on and the cover isn't her own picture. */
export const canChangeCover = (libraryOn: boolean, source: string) => libraryOn && source !== 'own' && source !== 'created'
