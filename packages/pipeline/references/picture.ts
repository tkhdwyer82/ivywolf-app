// packages/pipeline/references/picture.ts
// A card's reference picture (Job B.2, cards.reference_picture, 0039): the first free reference for an idea that has
// no Unsplash photo, so every idea on Home carries a picture. findReferences(card, {limit: 1}) from Unsplash or
// Pixabay only — never Pinterest, whose pins are never stored. Unsplash is hotlinked, never copied (its terms), and its
// download event is not sent here (it's sent when she uses the picture, not when it's found or shown). Pixabay is
// copied into our storage when it's chosen (B.12): its terms ask for that instead of hotlinking, and its image links
// expire after about a day — frames/<creator>/references/<card>-<pixabay id>.jpg, removed with the card.
// Best-effort: a card that finds nothing keeps its project hue.

import sharp from 'sharp'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { uploadBuffer } from '../storage'
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

const REFERENCE_PX = 1200

/** Where a card's Pixabay copy lives in the frames bucket. */
export const referencePath = (creatorId: string, cardId: string, pixabayId: string) => `${creatorId}/references/${cardId}-${pixabayId}.jpg`

/**
 * A Pixabay picture, copied into our storage: fetched from its (short-lived) link, resized, uploaded to frames; the
 * stored picture then points at our copy. Unsplash comes back unchanged.
 */
export async function keepPicture(creatorId: string, cardId: string, picture: ReferencePicture, fetchImpl: typeof fetch = fetch): Promise<ReferencePicture> {
  if (picture.source !== 'pixabay') return picture
  const res = await fetchImpl(picture.url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`pixabay image ${res.status}`)
  const jpeg = await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(REFERENCE_PX, REFERENCE_PX, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer()
  const { width, height } = await sharp(jpeg).metadata()
  const url = await uploadBuffer({ bucket: 'frames', buffer: jpeg, path: referencePath(creatorId, cardId, picture.id), contentType: 'image/jpeg', upsert: true })
  return { ...picture, url, thumb_url: url, width: width ?? picture.width, height: height ?? picture.height }
}

/** Already pictured: an Unsplash photo of its own (Job B), a cover from the ladder (covers.ts), or a reference found before. */
export const pictured = (c: CardRow) =>
  !!c.reference_picture ||
  (c.frame_status === 'done' && ['unsplash', 'ivy_library', 'ivy_generated'].includes(c.frame_attribution?.provider ?? ''))

/** Find and store one card's reference picture. Returns whether one was stored. */
export async function referencePictureFor(
  card: CardRow,
  opts: { supabase?: SupabaseClient; people?: string[]; providers?: FindOptions['providers'] } = {}
): Promise<boolean> {
  if (pictured(card) || card.source === 'pinterest') return false
  const supabase = opts.supabase ?? db()
  const people = opts.people ?? (await peopleFor(supabase, card.creator_id, card.recording_id).catch(() => []))
  const [first] = await findReferences(card, { sources: ['unsplash', 'pixabay'], limit: 1, people, providers: opts.providers })
  const found = first ? toReferencePicture(first) : null
  if (!found) return false
  const picture = await keepPicture(card.creator_id, card.id, found)
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
  const { data, error } = await supabase.from('cards').select(COLUMNS).eq('creator_id', creatorId).is('reference_picture', null).is('trashed_at', null)
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

/**
 * Pixabay pictures stored before they were copied (B.2 → B.12): their links have expired, so each is fetched again by
 * its Pixabay id (the API hands out a fresh link) and copied into our storage. A picture Pixabay no longer has is
 * cleared, and the card falls to its hue. Returns what it did.
 */
export async function keepPixabayPictures(creatorId: string, supabase: SupabaseClient = db()): Promise<{ kept: number; gone: number; failed: string[] }> {
  const { data, error } = await supabase
    .from('cards')
    .select('id, title, reference_picture')
    .eq('creator_id', creatorId)
    .eq('reference_picture->>source', 'pixabay')
  if (error) throw new Error(`cards: ${error.message}`)
  const out = { kept: 0, gone: 0, failed: [] as string[] }
  for (const c of (data ?? []) as { id: string; title: string; reference_picture: ReferencePicture }[]) {
    const p = c.reference_picture
    if (p.url.includes('/storage/v1/object/public/frames/')) continue // already ours
    try {
      const res = await fetch(`https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY ?? ''}&id=${encodeURIComponent(p.id)}`, { signal: AbortSignal.timeout(15_000) })
      const hit = res.ok ? ((await res.json()) as { hits?: { largeImageURL: string; webformatURL: string }[] }).hits?.[0] : undefined
      if (!hit) {
        if (res.ok || res.status === 400 || res.status === 404) {
          const { error: e } = await supabase.from('cards').update({ reference_picture: null }).eq('id', c.id).eq('creator_id', creatorId)
          if (e) throw new Error(e.message)
          out.gone++
          continue
        }
        throw new Error(`pixabay ${res.status}`)
      }
      const kept = await keepPicture(creatorId, c.id, { ...p, url: hit.largeImageURL, thumb_url: hit.webformatURL })
      const { error: e } = await supabase.from('cards').update({ reference_picture: kept }).eq('id', c.id).eq('creator_id', creatorId)
      if (e) throw new Error(e.message)
      out.kept++
    } catch (err) {
      out.failed.push(`${c.title}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return out
}
