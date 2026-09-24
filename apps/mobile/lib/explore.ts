// apps/mobile/lib/explore.ts
// Explore (P22). Ideas for you: tiles from her own projects and threads, the most recently active first, each
// behind the newest frame drawn for it (or a colour block while there's none). Search: her ideas whose title or
// gist has the words in it. Rising, from other creators, waits for the cohort.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardItem, Project } from '@/lib/home'

export interface ForYou {
  kind: 'project' | 'thread'
  id: string
  title: string
  frameUrl: string | null
  /** Where a tap goes: the project page, or a thread's newest idea (threads have no page yet). */
  openId: string
  at: string
}

export const FOR_YOU_SHOWN = 6

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

type C = { id: string; frame_url: string | null; frame_status: string; created_at: string }
const newest = (cards: C[]) => [...cards].sort((a, b) => b.created_at.localeCompare(a.created_at))
const drawn = (cards: C[]) => newest(cards).find((c) => c.frame_status === 'done' && c.frame_url)?.frame_url ?? null

export async function loadForYou(supabase: SupabaseClient): Promise<{ forYou: ForYou[]; projects: Project[]; anyIdeas: boolean }> {
  const [projects, threads, any] = await Promise.all([
    supabase.from('projects').select('id, name, kind, cards(id, frame_url, frame_status, created_at)'),
    supabase.from('threads').select('id, title, last_seen, project_id, thread_cards(cards(id, frame_url, frame_status, created_at))'),
    supabase.from('cards').select('id', { count: 'exact', head: true }),
  ])
  if (any.error) throw new Error(`cards: ${any.error.message}`)
  const projectRows = need('projects', projects) as unknown as (Project & { cards: C[] })[]
  const threadRows = need('threads', threads) as unknown as {
    id: string; title: string; last_seen: string; project_id: string | null; thread_cards: { cards: C | null }[]
  }[]

  // Her own projects with something in them. My things and Ivy Mini have their own ways in (the chip, P4).
  const fromProjects: ForYou[] = projectRows
    .filter((p) => p.kind === 'user' && p.cards.length > 0)
    .map((p) => ({ kind: 'project', id: p.id, title: p.name, frameUrl: drawn(p.cards), openId: p.id, at: newest(p.cards)[0].created_at }))

  // Threads, unless one only repeats its project's name. A one-card thread is just an idea, not a line of thought.
  const names = new Set(fromProjects.map((p) => p.title.trim().toLowerCase()))
  const fromThreads: ForYou[] = threadRows.flatMap((t) => {
    const cards = t.thread_cards.flatMap((tc) => (tc.cards ? [tc.cards] : []))
    if (cards.length < 2 || names.has(t.title.trim().toLowerCase())) return []
    return [{ kind: 'thread' as const, id: t.id, title: t.title, frameUrl: drawn(cards), openId: newest(cards)[0].id, at: t.last_seen }]
  })

  const forYou = [...fromProjects, ...fromThreads].sort((a, b) => b.at.localeCompare(a.at)).slice(0, FOR_YOU_SHOWN)
  return {
    forYou,
    projects: projectRows.map(({ id, name, kind }) => ({ id, name, kind })),
    anyIdeas: (any.count ?? 0) > 0,
  }
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

type CardRow = {
  id: string; recording_id: string; project_id: string; title: string; gist: string; play_from_ms: number
  confidence: number; frame_url: string | null; frame_status: CardItem['frameStatus']; frame_at: string | null
  created_at: string; recordings: { recorded_at: string | null; storage_path: string } | null
}

/** Her ideas with every word somewhere in the title or gist, newest first. */
export async function searchIdeas(supabase: SupabaseClient, q: string): Promise<CardItem[]> {
  const words = searchTerms(q)
  if (words.length === 0) return []
  let query = supabase
    .from('cards')
    .select('id, recording_id, project_id, title, gist, play_from_ms, confidence, frame_url, frame_status, frame_at, created_at, recordings(recorded_at, storage_path)')
  for (const w of words) query = query.or(`title.ilike.%${w}%,gist.ilike.%${w}%`)
  const rows = need('search', await query.order('created_at', { ascending: false }).limit(60)) as unknown as CardRow[]
  return rows.map((c) => ({
    kind: 'card',
    id: c.id,
    recordingId: c.recording_id,
    projectId: c.project_id,
    title: c.title,
    gist: c.gist,
    playFromMs: c.play_from_ms,
    confidence: c.confidence,
    frameUrl: c.frame_url,
    frameStatus: c.frame_status,
    frameAt: c.frame_at,
    at: c.recordings?.recorded_at ?? c.created_at,
    storagePath: c.recordings?.storage_path ?? null,
    threadSize: 1,
  }))
}

// Muted, dark enough for a white title — the colour block a tile wears until a frame is drawn (rule 6).
const BLOCKS = ['#2B2926', '#6B5443', '#4B5337', '#5A5460', '#6E7075', '#857C68', '#1F2326', '#3A3430']
export function blockColour(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return BLOCKS[Math.abs(h) % BLOCKS.length]
}
