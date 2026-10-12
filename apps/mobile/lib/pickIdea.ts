// apps/mobile/lib/pickIdea.ts
// "Pick an idea" (Explore, Figma 1464:124): her ideas to try a tool on, those with frames first ("Ideas with frames
// are ready to go"). A frame is a picture the tool could start from: her own pictures and Create takes, its Unsplash
// photo, its reference. Reads only; nothing here generates or spends.

import type { SupabaseClient } from '@supabase/supabase-js'
import { CARD_COLUMNS, loadOwnPictures, toCardItem, type CardItem, type CardRow } from './home'

export interface Pickable {
  card: CardItem
  frames: number
}

const LIMIT = 40

export async function loadPickable(supabase: SupabaseClient): Promise<Pickable[]> {
  const { data, error } = await supabase.from('cards').select(CARD_COLUMNS).order('created_at', { ascending: false }).limit(LIMIT)
  if (error) throw new Error(`ideas: ${error.message}`)
  const rows = data as unknown as CardRow[]
  const own = await loadOwnPictures(supabase, rows.map((r) => r.id))
  return rankPickable(
    rows.map((r) => {
      const card = toCardItem(r, undefined, own.get(r.id))
      return { card, frames: (own.get(r.id)?.length ?? 0) + (card.credit ? 1 : 0) + (r.reference_picture ? 1 : 0) }
    })
  )
}

/** Ready (has a frame) first; newest first within each. */
export const rankPickable = (list: Pickable[]): Pickable[] =>
  [...list].sort((a, b) => Number(b.frames > 0) - Number(a.frames > 0) || (a.card.at < b.card.at ? 1 : a.card.at > b.card.at ? -1 : 0))

/** "Launch video · has 3 frames", "Ivy brand · no frames yet". */
export const pickableLine = (p: Pickable) =>
  [p.card.projectName, p.frames === 0 ? 'no frames yet' : `has ${p.frames} frame${p.frames === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
