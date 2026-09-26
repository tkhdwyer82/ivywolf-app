// apps/mobile/lib/search.ts
// Search from the Home header: her ideas whose title or gist has the words in it.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardItem } from '@/lib/home'

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
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
