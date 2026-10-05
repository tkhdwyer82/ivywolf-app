// apps/mobile/lib/idea.ts
// One idea (P9): the card, its project, when and where it was said, and the other cards in its thread.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardShape } from '@ivywolf/schema'
import { toCardItem, type CardItem, type CardRow, type ThreadStage } from '@/lib/home'
import { writeStyleSignal } from '@/lib/styleSignals'

const API_URL = process.env.EXPO_PUBLIC_API_URL!

export type CardSource = 'voice' | 'import' | 'muse' | 'youtube' | 'tiktok' | 'pinterest' | 'graph'
// A pinned suggestion's source, as its badge names it. 'graph' came from her own notes via More ideas (0031): it
// sits on her recording, but it wasn't something she said, and the badge says so.
const PINNED: Partial<Record<CardSource, string>> = { youtube: 'YouTube', tiktok: 'TikTok', pinterest: 'Pinterest', graph: 'More ideas' }

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
  /** voice | import | muse, or — pinned from More ideas (0030/0031) — youtube | tiktok | pinterest | graph. */
  source: CardSource
  sourceUrl: string | null
  createdAt: string
  /** Added through the Muse connector (recordings.source 'muse', 0026). */
  viaMuse: boolean
  heartedAt: string | null
  /** Null for a pinned suggestion: it was never said. */
  recordingId: string | null
  storagePath: string | null
  recordedAt: string | null
  project: { id: string; name: string; kind: string } | null
  thread: { id: string; title: string; returnCount: number } | null
  siblings: Sibling[]
  /** What CardFace draws (Figma 227:5): the shape and its payloads, credit, where it was said, the thread's stage. */
  card: CardItem
  /** 'creator' once she has chosen the view herself (0033). */
  shapeSetBy: 'ivy' | 'creator' | null
  /** It has a visual_query, so a photo can be found for it. */
  hasVisualQuery: boolean
}

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

type Row = CardRow & {
  source: CardSource; source_url: string | null; hearted_at: string | null; shape_set_by: 'ivy' | 'creator' | null
  visual_query: string | null
  projects: { id: string; name: string; kind: string } | null
  thread_cards: { threads: { id: string; title: string; return_count: number; stage: ThreadStage } | null }[]
}

export async function loadIdea(supabase: SupabaseClient, id: string): Promise<Idea | null> {
  const row = need(
    'card',
    await supabase
      .from('cards')
      .select(
        'id, recording_id, project_id, title, gist, confidence, play_from_ms, frame_url, frame_status, frame_at, source, source_url, hearted_at, created_at, shape, shape_set_by, visual_query, quote, diagram, board, frame_attribution, recordings(recorded_at, storage_path, source), projects(id, name, kind), thread_cards(threads(id, title, return_count, stage))'
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
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    viaMuse: row.recordings?.source === 'muse',
    heartedAt: row.hearted_at,
    recordingId: row.recording_id,
    storagePath: row.recordings?.storage_path ?? null,
    recordedAt: row.recordings?.recorded_at ?? row.created_at,
    project: row.projects,
    thread,
    siblings,
    card: toCardItem(row, { size: siblings.length + 1, stage: t?.stage ?? null }),
    shapeSetBy: row.shape_set_by,
    hasVisualQuery: !!row.visual_query?.trim(),
  }
}

/** The views this idea can take: every shape whose payload exists, photo when there's a picture or a query, text always. */
export function viewsFor(idea: Idea): CardShape[] {
  const c = idea.card
  const views: CardShape[] = []
  if ((idea.frameStatus === 'done' && idea.frameUrl) || idea.hasVisualQuery) views.push('photo')
  if (c.quote) views.push('quote')
  if (c.diagram) views.push('diagram')
  if (c.board) views.push('board')
  views.push('text')
  return views
}

/**
 * Change view (every card's •••): she picks the form, and Ivy never overrides it (shape_set_by 'creator'). The
 * change is a style signal — "wrong form" is a correction worth learning from. A photo view with no picture yet asks
 * apps/web to find one on Unsplash; it resolves false when none was found (the card keeps its title until she picks
 * again).
 */
export async function setShape(supabase: SupabaseClient, idea: Idea, shape: CardShape, token: string | null): Promise<boolean> {
  const { error } = await supabase.from('cards').update({ shape, shape_set_by: 'creator' }).eq('id', idea.id)
  if (error) throw new Error(`change view: ${error.message}`)
  writeStyleSignal(supabase, 'shape_change', { field: 'shape', card_id: idea.id, from: idea.card.shape, to: shape }).catch((e) =>
    console.warn(`[idea] shape signal: ${e.message}`)
  )
  if (shape !== 'photo' || (idea.frameStatus === 'done' && idea.frameUrl) || !token) return true
  const res = await fetch(`${API_URL}/api/cards/${idea.id}/photo`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`photo: ${res.status}`)
  return ((await res.json()) as { photo?: boolean }).photo === true
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
  const at = !idea.recordingId ? null : idea.viaMuse ? 'via Muse' : idea.source === 'voice' || idea.source === 'graph' ? clock(idea.playFromMs) : 'added'
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

/**
 * A pinned suggestion's source badge (P12d), on the idea page only — never on a tile: "via YouTube · pinned just
 * now", "· pinned today", "· pinned Tue". Null for her own ideas.
 */
export function sourceBadge(idea: Idea, now = new Date()): string | null {
  const name = PINNED[idea.source]
  if (!name) return null
  const at = new Date(idea.createdAt)
  const mins = (now.getTime() - at.getTime()) / 60000
  const when = mins < 60 ? 'just now' : at.toDateString() === now.toDateString() ? 'today' : DAYS[at.getDay()]
  return `via ${name} · pinned ${when}`
}
