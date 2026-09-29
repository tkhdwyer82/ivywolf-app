// apps/mobile/lib/suggestions.ts
// More ideas (Job G §3.3): a project's tab of suggestions pushed to its thread (0028).
//
// Gate: the tab exists only when a thread in the project has come back at least three times (threads.return_count
// ≥ 3). Below that it isn't rendered — not greyed. With more than one such thread, the tab is for the one she's
// come back to most (then the most recently seen); "More ideas for this thread" is that thread's shown
// suggestions by rank, at most five. Loaded when the page is focused — so after a pin, a dismiss or a new card in
// the thread — never on a pull-to-refresh alone.

import type { SupabaseClient } from '@supabase/supabase-js'

export const GATE_RETURNS = 3
export const MAX_SHOWN = 5

export interface GateThread {
  id: string
  title: string
  returnCount: number
  lastSeen: string
}

export interface Suggestion {
  id: string
  threadId: string
  nearCardId: string | null
  field: 'format' | 'sound' | 'aesthetic' | 'topic' | 'graph'
  source: 'youtube' | 'tiktok' | 'pinterest' | 'graph'
  sourceUrl: string | null
  sourceHandle: string | null
  sourceScore: number | null
  title: string
  why: string | null
  whyRecordingId: string | null
  whyMs: number | null
  frameUrl: string | null
  rank: number
  createdAt: string
}

/** The thread More ideas is for, or null — then the tab doesn't render. */
export function gateThread(threads: GateThread[]): GateThread | null {
  return (
    threads
      .filter((t) => t.returnCount >= GATE_RETURNS)
      .sort((a, b) => b.returnCount - a.returnCount || b.lastSeen.localeCompare(a.lastSeen))[0] ?? null
  )
}

type Row = {
  id: string; thread_id: string; near_card_id: string | null; field: Suggestion['field']; source: Suggestion['source']
  source_url: string | null; source_handle: string | null; source_score: number | null; title: string; why: string | null
  why_recording_id: string | null; why_ms: number | null; frame_url: string | null; rank: number; created_at: string
}
const COLUMNS =
  'id, thread_id, near_card_id, field, source, source_url, source_handle, source_score, title, why, why_recording_id, why_ms, frame_url, rank, created_at'

export const toSuggestion = (r: Row): Suggestion => ({
  id: r.id,
  threadId: r.thread_id,
  nearCardId: r.near_card_id,
  field: r.field,
  source: r.source,
  sourceUrl: r.source_url,
  sourceHandle: r.source_handle,
  sourceScore: r.source_score === null ? null : Number(r.source_score),
  title: r.title,
  why: r.why,
  whyRecordingId: r.why_recording_id,
  whyMs: r.why_ms,
  frameUrl: r.frame_url,
  rank: r.rank,
  createdAt: r.created_at,
})

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

/** A project's More ideas: its gate thread and that thread's suggestions still shown — or null (no tab). */
export async function loadMoreIdeas(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ thread: GateThread; suggestions: Suggestion[] } | null> {
  const rows = need(
    'threads',
    await supabase.from('threads').select('id, title, return_count, last_seen').eq('project_id', projectId).gte('return_count', GATE_RETURNS)
  ) as { id: string; title: string; return_count: number; last_seen: string }[]
  const thread = gateThread(rows.map((t) => ({ id: t.id, title: t.title, returnCount: t.return_count, lastSeen: t.last_seen })))
  if (!thread) return null
  const suggestions = need(
    'suggestions',
    await supabase.from('suggestions').select(COLUMNS).eq('thread_id', thread.id).eq('status', 'shown').order('rank').limit(MAX_SHOWN)
  ) as Row[]
  return { thread, suggestions: suggestions.map(toSuggestion) }
}

/** Long-press on a tile: a negative signal, no UI. False if it was already acted on. */
export async function hideSuggestion(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('act_on_suggestion', { p_suggestion: id, p_signal: 'hide' })
  if (error) throw new Error(`hide: ${error.message}`)
  return data === true
}

// ── One suggestion, open (P12c) ─────────────────────────────────────────────────────────────────────────────────

export interface OpenSuggestion extends Suggestion {
  status: string
  project: { id: string; name: string } | null
  /** "Near: <title>" — the card of hers it's nearest to: where it was said, for Ivy's line after a pin. */
  near: { title: string; recordingId: string | null; ms: number; recordedAt: string | null } | null
  /** The recording its why line cites, to play from why_ms. */
  whyRecording: { storagePath: string | null; recordedAt: string | null } | null
}

export async function loadSuggestion(supabase: SupabaseClient, id: string): Promise<OpenSuggestion | null> {
  const row = need(
    'suggestion',
    await supabase
      .from('suggestions')
      .select(`${COLUMNS}, status, projects(id, name), near:cards!near_card_id(title, recording_id, play_from_ms, created_at, recordings(recorded_at)), why_rec:recordings!why_recording_id(storage_path, recorded_at)`)
      .eq('id', id)
      .maybeSingle()
  ) as unknown as
    | (Row & {
        status: string
        projects: { id: string; name: string } | null
        near: { title: string; recording_id: string | null; play_from_ms: number; created_at: string; recordings: { recorded_at: string | null } | null } | null
        why_rec: { storage_path: string | null; recorded_at: string | null } | null
      })
    | null
  if (!row) return null
  return {
    ...toSuggestion(row),
    status: row.status,
    project: row.projects,
    near: row.near
      ? { title: row.near.title, recordingId: row.near.recording_id, ms: row.near.play_from_ms, recordedAt: row.near.recordings?.recorded_at ?? row.near.created_at }
      : null,
    whyRecording: row.why_rec ? { storagePath: row.why_rec.storage_path, recordedAt: row.why_rec.recorded_at } : null,
  }
}

/** open and play_why change nothing but the log (0028 lets her write those two herself). Best-effort. */
export async function logSignal(supabase: SupabaseClient, creatorId: string, suggestionId: string, signal: 'open' | 'play_why') {
  await supabase.from('suggestion_signals').insert({ creator_id: creatorId, suggestion_id: suggestionId, signal })
}

/** "+ Pin to <project>": the card's id (0030). */
export async function pinSuggestion(supabase: SupabaseClient, id: string): Promise<string> {
  const { data, error } = await supabase.rpc('pin_suggestion', { p_suggestion: id })
  if (error) throw new Error(`pin: ${error.message}`)
  return data as string
}

/** "Not for me". Never shown again. */
export async function dismissSuggestion(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('act_on_suggestion', { p_suggestion: id, p_signal: 'dismiss' })
  if (error) throw new Error(`dismiss: ${error.message}`)
  return data === true
}

// ── After a pin (P12d): Ivy's one cited line on the project page ────────────────────────────────────────────────

export const SOURCE_NAME: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', pinterest: 'Pinterest', graph: 'your notes' }
const WHAT: Record<Suggestion['field'], string> = { format: 'cut', sound: 'sound', aesthetic: 'look', topic: 'topic', graph: 'idea' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

export interface PinNote {
  projectId: string
  text: string
  /** Rule 2: the line cites the card of hers it's near. */
  cites: { recordingId: string | null; ms: number }[]
}

/**
 * "From YouTube: one cut you pinned, near the rooftop chase · Tue 0:00" — the near card's title, the day it was said
 * and its moment. Kept here until the project page shows it once (then it dissolves, v3.2 rule 4).
 */
let pending: PinNote | null = null
export function notePin(s: OpenSuggestion) {
  if (!s.project) return
  const near = s.near
  const where = near
    ? `, near ${near.title.charAt(0).toLowerCase()}${near.title.slice(1)}${near.recordedAt ? ` · ${DAYS[new Date(near.recordedAt).getDay()]} ${clock(near.ms)}` : ''}`
    : ''
  pending = {
    projectId: s.project.id,
    text: `From ${SOURCE_NAME[s.source]}: one ${WHAT[s.field]} you pinned${where}.`,
    cites: near ? [{ recordingId: near.recordingId, ms: near.ms }] : [],
  }
}
/** The project page takes its note once. */
export function takePinNote(projectId: string): PinNote | null {
  if (pending?.projectId !== projectId) return null
  const n = pending
  pending = null
  return n
}
