// apps/mobile/lib/links.ts
// Link ideas (Job C+, Figma 1459:4 / 1459:109): two of her ideas, linked both ways (card_links, 0034). One row per
// pair, stored with card_a < card_b; a card's links are every row it's in, on either side.
// Ivy's merge suggestions (merge_suggestions, 0008) show in link mode as suggested links she can accept — accepting
// one links the pair (created_by 'ivy': Ivy proposed it) and leaves the merge suggestion as it was: a link isn't a
// merge, so My things can still offer it.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardItem } from './home'

/** card id → the ids it's linked to. */
export type Links = Map<string, Set<string>>

export const pair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x])

export function toLinks(rows: { card_a: string; card_b: string }[]): Links {
  const links: Links = new Map()
  const add = (from: string, to: string) => {
    if (!links.has(from)) links.set(from, new Set())
    links.get(from)!.add(to)
  }
  for (const r of rows) {
    add(r.card_a, r.card_b)
    add(r.card_b, r.card_a)
  }
  return links
}

export async function loadLinks(supabase: SupabaseClient): Promise<Links> {
  const { data, error } = await supabase.from('card_links').select('card_a, card_b')
  if (error) throw new Error(`links: ${error.message}`)
  return toLinks(data ?? [])
}

/** The card with its link count filled in. */
export function withLinks(card: CardItem, links: Links): CardItem {
  return { ...card, links: links.get(card.id)?.size ?? 0 }
}

/** The other cards Ivy has proposed merging with this one and she hasn't answered: suggested links. */
export async function suggestedLinks(supabase: SupabaseClient, cardId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('merge_suggestions')
    .select('a_card_id, b_card_id')
    .eq('status', 'proposed')
    .or(`a_card_id.eq.${cardId},b_card_id.eq.${cardId}`)
  if (error) throw new Error(`suggested links: ${error.message}`)
  return new Set((data ?? []).map((m) => (m.a_card_id === cardId ? m.b_card_id : m.a_card_id)))
}

export async function link(supabase: SupabaseClient, creatorId: string, from: string, to: string, by: 'creator' | 'ivy' = 'creator') {
  const [card_a, card_b] = pair(from, to)
  const { error } = await supabase
    .from('card_links')
    .upsert({ card_a, card_b, creator_id: creatorId, created_by: by }, { onConflict: 'card_a,card_b', ignoreDuplicates: true })
  if (error) throw new Error(`link: ${error.message}`)
}

export async function unlink(supabase: SupabaseClient, from: string, to: string) {
  const [card_a, card_b] = pair(from, to)
  const { error } = await supabase.from('card_links').delete().eq('card_a', card_a).eq('card_b', card_b)
  if (error) throw new Error(`unlink: ${error.message}`)
}

/** "2 ideas linked" — the toast after Done. */
export const linkedLine = (n: number) => `${n === 1 ? '1 idea' : `${n} ideas`} linked`
