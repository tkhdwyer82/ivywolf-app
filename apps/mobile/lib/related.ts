// apps/mobile/lib/related.ts
// More to explore (B.8a, I1): her ideas most like this one — ids ranked by GET /api/cards/{id}/related (embeddings,
// no model call), then the cards read under her RLS with Home's columns so each tile is drawn exactly as on Home.
// Each tile opens its own idea page; nothing links from here.

import type { SupabaseClient } from '@supabase/supabase-js'
import { CARD_COLUMNS, loadOwnPictures, toCardItem, type CardItem, type CardRow } from './home'

const API_URL = process.env.EXPO_PUBLIC_API_URL!

export async function loadRelated(supabase: SupabaseClient, token: string, cardId: string, limit = 12): Promise<CardItem[]> {
  const res = await fetch(`${API_URL}/api/cards/${cardId}/related?limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('More to explore didn’t load')
  const { ids } = (await res.json()) as { ids: string[] }
  if (!ids.length) return []
  const { data, error } = await supabase.from('cards').select(CARD_COLUMNS).in('id', ids).is('trashed_at', null)
  if (error) throw new Error(`ideas: ${error.message}`)
  const rows = data as unknown as CardRow[]
  const own = await loadOwnPictures(supabase, rows.map((r) => r.id))
  return inOrder(ids, rows.map((r) => toCardItem(r, undefined, own.get(r.id))))
}

/** The cards back in the route's order (an `in` query doesn't keep it); any that went missing are dropped. */
export function inOrder(ids: string[], cards: CardItem[]): CardItem[] {
  const byId = new Map(cards.map((c) => [c.id, c]))
  return ids.map((id) => byId.get(id)).filter((c): c is CardItem => !!c)
}
