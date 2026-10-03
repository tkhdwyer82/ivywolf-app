// apps/mobile/lib/search.ts
// Search from the Home header: her ideas whose title or gist has the words in it.

import type { SupabaseClient } from '@supabase/supabase-js'
import { CARD_COLUMNS, toCardItem, type CardItem, type CardRow, type ThreadStage } from '@/lib/home'

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

/**
 * Words she can type that PostgREST's filter syntax would read as its own (, ( ) " \) or that ilike would read as
 * wildcards (% _ *) become spaces; what's left is matched as-is, case-insensitively, in the title or the gist.
 */
export function searchTerms(q: string): string[] {
  return q
    .replace(/[,()"\\%_*]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
    .slice(0, 6)
}

/** Her ideas with every word somewhere in the title or gist, newest first. */
export async function searchIdeas(supabase: SupabaseClient, q: string): Promise<CardItem[]> {
  const words = searchTerms(q)
  if (words.length === 0) return []
  let query = supabase
    .from('cards')
    .select(`${CARD_COLUMNS}, thread_cards(threads(stage))`)
  for (const w of words) query = query.or(`title.ilike.%${w}%,gist.ilike.%${w}%`)
  const rows = need('search', await query.order('created_at', { ascending: false }).limit(60)) as unknown as (CardRow & { thread_cards: { threads: { stage: ThreadStage } | null }[] })[]
  return rows.map((c) => toCardItem(c, { size: 1, stage: c.thread_cards[0]?.threads?.stage ?? null }))
}
