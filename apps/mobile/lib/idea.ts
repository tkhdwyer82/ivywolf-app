// apps/mobile/lib/idea.ts
// One idea (P9): the card, its project, when and where it was said, and the other cards in its thread.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Sibling {
  id: string
  title: string
  frameUrl: string | null
  frameStatus: string
  playFromMs: number
  storagePath: string | null
  recordedAt: string | null
}

export interface Idea {
  id: string
  title: string
  gist: string
  confidence: number
  playFromMs: number
  frameUrl: string | null
  frameStatus: string
  source: 'voice' | 'import'
  /** Added through the Muse connector (recordings.source 'muse', 0026). */
  viaMuse: boolean
  heartedAt: string | null
  recordingId: string
  storagePath: string | null
  recordedAt: string | null
  project: { id: string; name: string; kind: string } | null
  thread: { id: string; title: string; returnCount: number } | null
  siblings: Sibling[]
}

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

type Row = {
  id: string; title: string; gist: string; confidence: number; play_from_ms: number; frame_url: string | null
  frame_status: string; source: 'voice' | 'import'; hearted_at: string | null; recording_id: string; created_at: string
  recordings: { recorded_at: string | null; storage_path: string | null; source: string } | null
  projects: { id: string; name: string; kind: string } | null
  thread_cards: { threads: { id: string; title: string; return_count: number } | null }[]
}

export async function loadIdea(supabase: SupabaseClient, id: string): Promise<Idea | null> {
  const row = need(
    'card',
    await supabase
      .from('cards')
      .select(
        'id, title, gist, confidence, play_from_ms, frame_url, frame_status, source, hearted_at, recording_id, created_at, recordings(recorded_at, storage_path, source), projects(id, name, kind), thread_cards(threads(id, title, return_count))'
      )
      .eq('id', id)
      .maybeSingle()
  ) as unknown as Row | null
  if (!row) return null

  const t = row.thread_cards[0]?.threads ?? null
  const thread = t ? { id: t.id, title: t.title, returnCount: t.return_count } : null
  let siblings: Sibling[] = []
  if (thread) {
    const rows = need(
      'thread',
      await supabase
        .from('thread_cards')
        .select('cards(id, title, frame_url, frame_status, play_from_ms, created_at, recordings(storage_path, recorded_at))')
        .eq('thread_id', thread.id)
    ) as unknown as { cards: { id: string; title: string; frame_url: string | null; frame_status: string; play_from_ms: number; created_at: string; recordings: { storage_path: string; recorded_at: string | null } | null } | null }[]
    siblings = rows
      .map((r) => r.cards)
      .filter((c): c is NonNullable<typeof c> => !!c && c.id !== id)
      .map((c) => ({
        id: c.id,
        title: c.title,
        frameUrl: c.frame_url,
        frameStatus: c.frame_status,
        playFromMs: c.play_from_ms,
        storagePath: c.recordings?.storage_path ?? null,
        recordedAt: c.recordings?.recorded_at ?? c.created_at,
      }))
  }

  return {
    id: row.id,
    title: row.title,
    gist: row.gist,
    confidence: row.confidence,
    playFromMs: row.play_from_ms,
    frameUrl: row.frame_url,
    frameStatus: row.frame_status,
    source: row.source,
    viaMuse: row.recordings?.source === 'muse',
    heartedAt: row.hearted_at,
    recordingId: row.recording_id,
    storagePath: row.recordings?.storage_path ?? null,
    recordedAt: row.recordings?.recorded_at ?? row.created_at,
    project: row.projects,
    thread,
    siblings,
  }
}

export async function setHeart(supabase: SupabaseClient, id: string, on: boolean) {
  const { error } = await supabase.from('cards').update({ hearted_at: on ? new Date().toISOString() : null }).eq('id', id)
  if (error) throw new Error(`heart: ${error.message}`)
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const day = (iso: string | null) => (iso ? DAYS[new Date(iso).getDay()] : null)

/** L4b meta line: "Thu 0:31 · 2 cards · Launch video" — the day it was said and where in the recording (tap to
 *  hear it) or "via Muse", how many cards its thread has, and its project. */
export function metaLine(idea: Idea): string {
  const at = idea.viaMuse ? 'via Muse' : idea.source === 'voice' ? clock(idea.playFromMs) : 'added'
  const n = idea.thread ? idea.siblings.length + 1 : 0
  return [[day(idea.recordedAt), at].filter(Boolean).join(' '), n > 1 ? `${n} cards` : null, idea.project?.name ?? 'My things']
    .filter(Boolean)
    .join(' · ')
}

/** L4b thread pill: "×4 · Thu 0:31" — how often she's come back to the thread, and where it started. */
export function threadPill(idea: Idea): string | null {
  if (!idea.thread) return null
  const first = [{ recordedAt: idea.recordedAt, playFromMs: idea.playFromMs }, ...idea.siblings].sort((a, b) =>
    (a.recordedAt ?? '').localeCompare(b.recordedAt ?? '')
  )[0]
  return [`×${idea.thread.returnCount}`, [day(first.recordedAt), clock(first.playFromMs)].filter(Boolean).join(' ')].join(' · ')
}
