// apps/mobile/lib/capture.ts
// Capture, one screen (Job B.11, Figma v5.7 2272:2, C1–C4). Opening it starts the mic. The big centre button is the
// only thing that pauses. Typing and adding photos never touch the recording: a typed note is stamped with the
// recording's clock when she started typing it, a photo with the clock when it was added (0043's at_ms — a position
// in the audio file, so paused time isn't counted). Done finishes, × discards (lib/discard.ts). One capture = one
// recording = one card.
//
// This module is the screen's rules with no Expo in them, so they can be tested: the reducer, what Done does with
// what she gave it (planCapture), and the words the screen and Home show. Uploading is submitCapture, at the bottom.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SILENT_DB } from './discard'

// ── State ───────────────────────────────────────────────────────────────────────────────────────────────────

export type Mic = 'starting' | 'listening' | 'paused'

export interface Note {
  atMs: number
  text: string
}
export interface Photo {
  atMs: number
  uri: string
  mimeType: string | null
  fileName: string | null
}

export interface CaptureState {
  mic: Mic
  notes: Note[]
  photos: Photo[]
  /** When she started typing the note in the bar (the recording's clock), or null while the bar is empty. */
  draftAt: number | null
}

export type CaptureAction =
  | { type: 'started' }
  | { type: 'pause' }
  | { type: 'resume' }
  /** A keystroke in the bar. Only the first one of a note stamps it. */
  | { type: 'typing'; atMs: number }
  /** The bar was emptied without sending. */
  | { type: 'cleared' }
  | { type: 'send'; text: string }
  | { type: 'photo'; photo: Photo }

export const initialCapture: CaptureState = { mic: 'starting', notes: [], photos: [], draftAt: null }

export function captureReducer(s: CaptureState, a: CaptureAction): CaptureState {
  switch (a.type) {
    case 'started':
      return s.mic === 'starting' ? { ...s, mic: 'listening' } : s
    // The centre button: the only actions that change `mic`.
    case 'pause':
      return s.mic === 'listening' ? { ...s, mic: 'paused' } : s
    case 'resume':
      return s.mic === 'paused' ? { ...s, mic: 'listening' } : s
    // Typing and photos leave `mic` exactly as it was.
    case 'typing':
      return s.draftAt === null ? { ...s, draftAt: Math.max(0, Math.round(a.atMs)) } : s
    case 'cleared':
      return { ...s, draftAt: null }
    case 'send': {
      const text = a.text.trim()
      if (!text) return { ...s, draftAt: null }
      return { ...s, notes: [...s.notes, { atMs: s.draftAt ?? 0, text }], draftAt: null }
    }
    case 'photo':
      return { ...s, photos: [...s.photos, { ...a.photo, atMs: Math.max(0, Math.round(a.photo.atMs)) }] }
  }
}

// ── Done ────────────────────────────────────────────────────────────────────────────────────────────────────

/** An accidental tap: under 2 s with nothing typed or added isn't uploaded (as before B.11). */
export const MIN_TAKE_MS = 2000

export type Plan =
  /** Nothing said, typed or added: dropped on the phone ("Nothing to save"). */
  | { kind: 'nothing' }
  /** Speech (or an import's line): the audio goes up, with any notes and photos (0043). */
  | { kind: 'voice' }
  /** Typed and/or photos, no speech: the audio is dropped and it goes the text way (0026), like Muse's capture_idea. */
  | { kind: 'text'; text: string }

/**
 * What Done does. `peakDb` null means the mic never reported a level — not silence, so it counts as speech (dropping
 * a real take is worse than uploading a silent one; the server's junk gate catches the rest).
 */
export function planCapture(c: { peakDb: number | null; tookMs: number; notes: Note[]; photos: Photo[]; imported?: boolean }): Plan {
  if (c.imported) return { kind: 'voice' }
  const silent = c.peakDb !== null && c.peakDb < SILENT_DB
  const spoke = !silent && c.tookMs >= MIN_TAKE_MS
  if (spoke) return { kind: 'voice' }
  if (c.notes.length || c.photos.length) return { kind: 'text', text: mergedText(c.notes) }
  return { kind: 'nothing' }
}

/** Notes in the order she wrote them in time, one paragraph each — a typed-only capture's words (meta.text). */
export function mergedText(notes: Note[]): string {
  return [...notes]
    .map((n, i) => ({ ...n, i }))
    .sort((a, b) => a.atMs - b.atMs || a.i - b.i)
    .map((n) => n.text.trim())
    .filter(Boolean)
    .join('\n\n')
}

// ── Words ───────────────────────────────────────────────────────────────────────────────────────────────────

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The grey line under "You": "Listening · 0:12" / "Paused · 0:31". */
export function statusLine(mic: Mic, ms: number): string {
  return `${mic === 'paused' ? 'Paused' : 'Listening'} · ${clock(ms)}`
}

const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const say = (n: number) => NUMBER[n] ?? String(n)
const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const photosWord = (n: number) => `${n} photo${n === 1 ? '' : 's'}`

/** C3: "2 photos · added at 0:38 and 0:42". Null with none. */
export function photosLine(photos: Pick<Photo, 'atMs'>[]): string | null {
  if (!photos.length) return null
  return `${photosWord(photos.length)} · added at ${and(photos.map((p) => clock(p.atMs)))}`
}

/** How a capture came in (recordings.meta.capture, written at Done; kind tells said from typed-only). */
export interface CaptureInfo {
  said: boolean
  notes: number
  photos: number
}

export function captureInfo(rec: { kind?: string | null; meta_capture?: unknown } | null | undefined): CaptureInfo | null {
  const m = rec?.meta_capture as { notes?: unknown; photos?: unknown } | null | undefined
  if (!m || typeof m !== 'object') return null
  const n = (v: unknown) => (typeof v === 'number' && v > 0 ? Math.floor(v) : 0)
  return { said: rec?.kind !== 'text', notes: n(m.notes), photos: n(m.photos) }
}

/**
 * C4's meta line: "typed + said · 2 photos", "typed", "said · 1 photo". Voice only → null, and the tile keeps the
 * time it was said, as before.
 */
export function captureMeta(c: CaptureInfo | null): string | null {
  if (!c || (!c.notes && !c.photos)) return null
  const how = c.notes ? (c.said ? 'typed + said' : 'typed') : c.said ? 'said' : null
  return [how, c.photos ? photosWord(c.photos) : null].filter(Boolean).join(' · ') || null
}

/** Ivy's line on Home once a capture's cards land: "Got it — one idea, two photos." */
export function gotItLine(ideas: number, photos: number): string {
  const parts = [`${say(ideas)} idea${ideas === 1 ? '' : 's'}`]
  if (photos) parts.push(`${say(photos)} photo${photos === 1 ? '' : 's'}`)
  return `Got it — ${parts.join(', ')}.`
}

// ── Record → Home: the capture whose cards Ivy should confirm ───────────────────────────────────────────────

let pending: { recordingId: string; photos: number } | null = null
export function setPendingCapture(p: { recordingId: string; photos: number } | null) {
  pending = p
}
export function pendingCapture() {
  return pending
}

// ── Upload ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface UploadedPhoto {
  atMs: number
  storagePath: string
  posterPath: string
}

const extOf = (name: string | null, uri: string) => /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(name ?? uri)?.[1]?.toLowerCase() ?? 'jpg'

/**
 * Each photo to the private `imports` bucket (<her id>/captures/<id>.<ext>) and its poster — the image itself — to
 * frames/<her id>/imports/ (0018's policies), as Add to ideas does. `read` and `id` are injected so this runs in tests.
 */
export async function uploadPhotos(
  supabase: SupabaseClient,
  userId: string,
  photos: Photo[],
  io: { read: (uri: string) => Promise<ArrayBuffer>; id: () => string }
): Promise<UploadedPhoto[]> {
  const out: UploadedPhoto[] = []
  for (const p of photos) {
    const id = io.id()
    const ext = extOf(p.fileName, p.uri)
    const contentType = p.mimeType ?? 'image/jpeg'
    const bytes = await io.read(p.uri)
    const storagePath = `${userId}/captures/${id}.${ext}`
    const posterPath = `${userId}/imports/${id}.${ext}`
    const up = await supabase.storage.from('imports').upload(storagePath, bytes, { contentType, upsert: false })
    if (up.error) throw new Error(`photo: ${up.error.message}`)
    const poster = await supabase.storage.from('frames').upload(posterPath, bytes, { contentType, upsert: false })
    if (poster.error) throw new Error(`photo poster: ${poster.error.message}`)
    out.push({ atMs: p.atMs, storagePath, posterPath })
  }
  return out
}

/** The notes and photos against their recording (0043). Runs after the row exists and before processing is asked. */
export async function attachCapture(
  supabase: SupabaseClient,
  userId: string,
  recordingId: string,
  notes: Note[],
  photos: UploadedPhoto[]
) {
  if (notes.length) {
    const r = await supabase
      .from('capture_notes')
      .insert(notes.map((n) => ({ capture_id: recordingId, creator_id: userId, at_ms: Math.round(n.atMs), text: n.text })))
    if (r.error) throw new Error(`notes: ${r.error.message}`)
  }
  if (photos.length) {
    const r = await supabase.from('capture_photos').insert(
      photos.map((p) => ({
        capture_id: recordingId,
        creator_id: userId,
        at_ms: Math.round(p.atMs),
        storage_path: p.storagePath,
        poster_path: p.posterPath,
      }))
    )
    if (r.error) throw new Error(`photos: ${r.error.message}`)
  }
}

/**
 * A typed-only capture (no speech): a text recording (0026) — no audio, its words in meta.text and its notes in
 * capture_notes — then the same process route, which takes classify's text path as Muse's capture_idea does.
 */
export async function submitTextCapture(args: {
  supabase: SupabaseClient
  userId: string
  recordingId: string
  text: string
  notes: Note[]
  photos: UploadedPhoto[]
  recordedAt: Date
  projectId: string | null
  requestProcessing: (recordingId: string) => Promise<void>
}): Promise<{ recordingId: string }> {
  const { supabase, userId, recordingId } = args
  const creator = await supabase.from('creators').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
  if (creator.error) throw new Error(`creator: ${creator.error.message}`)
  const row = await supabase.from('recordings').insert({
    id: recordingId,
    creator_id: userId,
    source: 'phone',
    kind: 'text',
    storage_path: null,
    duration_ms: null,
    recorded_at: args.recordedAt.toISOString(),
    recorded_tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    trigger: 'button',
    project_id: args.projectId,
    meta: { text: args.text, capture: { notes: args.notes.length, photos: args.photos.length } },
  })
  if (row.error) throw new Error(`recording row: ${row.error.message}`)
  await attachCapture(supabase, userId, recordingId, args.notes, args.photos)
  // Once the row exists it's safe: if the server can't be reached, Home asks again (requestProcessing, stuck).
  await args.requestProcessing(recordingId).catch((e) => console.warn(`[capture] ${recordingId}: ${e.message}`))
  return { recordingId }
}
