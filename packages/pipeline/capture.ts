// packages/pipeline/capture.ts
// Capture, one screen (Job B.11, 0043). While the mic records she can type notes and add photos; each is stamped
// with the recording's clock (at_ms). Here they rejoin the recording:
//
// - Notes are merged into the transcript in time order, as utterances of their own, before classify — so the card's
//   note is what she said and what she typed, in the order she did it. Typed text is never cut into a spoken
//   utterance: a note stamped mid-sentence goes after that sentence.
// - The best photo becomes the card's picture through the import lane (imports.ts): her own picture, never searched
//   for. "Best" is the photo added nearest the moment the idea was said (the card's play_from_ms); a tie goes to the
//   earlier one. With no idea card yet, it's the first photo.
//
// A typed-only capture is a text recording (0026) whose notes are here; it takes the same text path as Muse.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Utterance } from '@ivywolf/schema'
import { textUtterances } from './text'
import type { Import } from './imports'

export interface CaptureNote {
  at_ms: number
  text: string
}
export interface CapturePhoto {
  at_ms: number
  storage_path: string
  poster_path: string
}
export interface Capture {
  notes: CaptureNote[]
  photos: CapturePhoto[]
}

/** The speaker a typed note is given. The classifier sees one speaker either way (classify_v6 knows '0'). */
export const TYPED_SPEAKER = '0'
const MS_PER_WORD = 400

/**
 * Spoken utterances and typed notes as one list in time order. A note goes after every utterance that started at or
 * before its stamp — never inside one — starting at its stamp or where that utterance ended, whichever is later, with
 * its words laid out at a speaking pace. Nothing is reordered within either list. Stable: equal times keep speech
 * first, then notes as typed.
 */
export function mergeNotes(spoken: Utterance[], notes: CaptureNote[]): Utterance[] {
  const typed = [...notes]
    .map((n, i) => ({ ...n, i, text: n.text.trim() }))
    .filter((n) => n.text.length > 0)
    .sort((a, b) => a.at_ms - b.at_ms || a.i - b.i)
  if (typed.length === 0) return spoken
  const out: Utterance[] = []
  let s = 0
  for (const n of typed) {
    while (s < spoken.length && spoken[s].start_ms <= n.at_ms) out.push(spoken[s++])
    // One note can be several sentences; split as the text path does, then lay them from the stamp.
    // From the stamp, or the end of what was being said then — starts stay in order.
    let at = Math.max(n.at_ms, out.length ? out[out.length - 1].end_ms : 0)
    for (const u of textUtterances(n.text)) {
      const len = u.end_ms - u.start_ms || MS_PER_WORD
      out.push({ start_ms: at, end_ms: at + len, speaker: TYPED_SPEAKER, text: u.text })
      at += len
    }
  }
  while (s < spoken.length) out.push(spoken[s++])
  return out
}

/** The photo added nearest `atMs` (the idea's moment); ties to the earlier. Null when there are none. */
export function bestPhoto(photos: CapturePhoto[], atMs: number | null): CapturePhoto | null {
  if (photos.length === 0) return null
  const byTime = [...photos].sort((a, b) => a.at_ms - b.at_ms)
  if (atMs === null) return byTime[0]
  return byTime.reduce((best, p) => (Math.abs(p.at_ms - atMs) < Math.abs(best.at_ms - atMs) ? p : best))
}

/** The best photo as an import (imports.ts attaches it to the card or makes one). */
export function photoAsImport(p: CapturePhoto): Import {
  return { kind: 'image', originalPath: p.storage_path, posterPath: p.poster_path }
}

/** Only paths in her own folder, as parseImport insists (the table's checks say the same). */
function own(creatorId: string, p: CapturePhoto) {
  const mine = (s: string) => s.startsWith(`${creatorId}/`) && !s.includes('..')
  return mine(p.storage_path) && mine(p.poster_path) && p.poster_path.startsWith(`${creatorId}/imports/`)
}

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

/** A recording's notes and photos, oldest first. Empty for every recording made before B.11. */
export async function loadCapture(recordingId: string, creatorId: string, supabase: SupabaseClient = db()): Promise<Capture> {
  const [notes, photos] = await Promise.all([
    supabase.from('capture_notes').select('at_ms, text').eq('capture_id', recordingId).eq('creator_id', creatorId).order('at_ms'),
    supabase
      .from('capture_photos')
      .select('at_ms, storage_path, poster_path')
      .eq('capture_id', recordingId)
      .eq('creator_id', creatorId)
      .order('at_ms'),
  ])
  if (notes.error) throw new Error(`capture notes: ${notes.error.message}`)
  if (photos.error) throw new Error(`capture photos: ${photos.error.message}`)
  return {
    notes: (notes.data ?? []) as CaptureNote[],
    photos: ((photos.data ?? []) as CapturePhoto[]).filter((p) => own(creatorId, p)),
  }
}
