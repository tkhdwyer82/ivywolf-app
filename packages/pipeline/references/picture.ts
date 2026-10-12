// packages/pipeline/references/picture.ts
// A card's reference picture (Job B.2, cards.reference_picture, 0039): the first free reference for an idea that has
// no Unsplash photo, so every idea on Home carries a picture. findReferences(card, {limit: 1}) from Unsplash or
// Pixabay only — never Pinterest, whose pins are never stored. The image is hotlinked, never copied; Unsplash's
// download event is not sent here (it's sent when she uses the picture, not when it's found or shown).
// Best-effort: a card that finds nothing keeps its project hue.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { peopleFor } from '../redact'
import { findReferences, type FindOptions } from './index'
import type { Reference } from './types'

/** What 0039 stores: the reference, minus nothing it needs to credit and link it. */
export interface ReferencePicture {
  source: 'unsplash' | 'pixabay'
  id: string
  url: string
  thumb_url: string
  link_url: string
  credit: { name: string; url: string }
  width: number
  height: number
  track_url?: string
}

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

export function toReferencePicture(r: Reference): ReferencePicture | null {
  if (r.source !== 'unsplash' && r.source !== 'pixabay') return null
  return {
    source: r.source,
    id: r.id,
    url: r.full_url,
    thumb_url: r.thumb_url,
    link_url: r.link_url,
    credit: r.credit,
    width: r.width,
    height: r.height,
    ...(r.track_url ? { track_url: r.track_url } : {}),
  }
}

type CardRow = {
  id: string
  creator_id: string
  recording_id: string | null
  title: string
  gist: string | null
  visual_query: string | null
  shape: 'photo' | 'quote' | 'diagram' | 'board' | 'text' | null
  source: string | null
  frame_status: string
  frame_attribution: { provider?: string } | null
  reference_picture: ReferencePicture | null
}
const COLUMNS = 'id, creator_id, recording_id, title, gist, visual_query, shape, source, frame_status, frame_attribution, reference_picture'

/** Already pictured: an Unsplash photo of its own (Job B), or a reference found before. */
const pictured = (c: CardRow) => !!c.reference_picture || (c.frame_status === 'done' && c.frame_attribution?.provider === 'unsplash')

/** Find and store one card's reference picture. Returns whether one was stored. */
export async function referencePictureFor(
  card: CardRow,
  opts: { supabase?: SupabaseClient; people?: string[]; providers?: FindOptions['providers'] } = {}
): Promise<boolean> {
  if (pictured(card) || card.source === 'pinterest') return false
  const supabase = opts.supabase ?? db()
  const people = opts.people ?? (await peopleFor(supabase, card.creator_id, card.recording_id).catch(() => []))
  const [first] = await findReferences(card, { sources: ['unsplash', 'pixabay'], limit: 1, people, providers: opts.providers })
  const picture = first ? toReferencePicture(first) : null
  if (!picture) return false
  const { error } = await supabase.from('cards').update({ reference_picture: picture }).eq('id', card.id).is('reference_picture', null)
  if (error) throw new Error(`card ${card.id}: ${error.message}`)
  return true
}

/** Every card of one recording that has no picture yet. Never throws for a single card. */
export async function referencePicturesForRecording(creatorId: string, recordingId: string): Promise<void> {
  const supabase = db()
  const { data, error } = await supabase.from('cards').select(COLUMNS).eq('creator_id', creatorId).eq('recording_id', recordingId).is('reference_picture', null)
  if (error) throw new Error(`cards for ${recordingId}: ${error.message}`)
  const people = await peopleFor(supabase, creatorId, recordingId).catch(() => [])
  for (const card of (data ?? []) as CardRow[]) {
    try {
      await referencePictureFor(card, { supabase, people })
    } catch (err) {
      console.error(`[references] card ${card.id}: reference picture failed`, err)
    }
  }
}

/** Backfill: a creator's cards with no picture (scripts/backfill-reference-pictures.ts). Returns how many were stored. */
export async function backfillReferencePictures(creatorId: string): Promise<{ stored: number; missed: string[] }> {
  const supabase = db()
  const { data, error } = await supabase.from('cards').select(COLUMNS).eq('creator_id', creatorId).is('reference_picture', null)
  if (error) throw new Error(`cards for ${creatorId}: ${error.message}`)
  let stored = 0
  const missed: string[] = []
  for (const card of (data ?? []) as CardRow[]) {
    if (pictured(card)) continue
    if (await referencePictureFor(card, { supabase }).catch(() => false)) stored++
    else missed.push(card.title)
  }
  return { stored, missed }
}
