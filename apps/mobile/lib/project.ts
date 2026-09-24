// apps/mobile/lib/project.ts
// One project (P11): its name and kind, its ideas newest first by when they were said, and how many boards its
// threads have. To-dos live in My things (P4), which has its own room, so a project page shows ideas only.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardItem, Project } from '@/lib/home'

export interface ProjectPage {
  project: Project
  ideas: CardItem[]
  boards: number
}

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

type CardRow = {
  id: string; recording_id: string; project_id: string; title: string; gist: string; play_from_ms: number
  confidence: number; frame_url: string | null; frame_status: CardItem['frameStatus']; frame_at: string | null
  created_at: string; recordings: { recorded_at: string | null; storage_path: string } | null
  thread_cards: { threads: { thread_cards: { card_id: string }[] } | null }[]
}

export async function loadProject(supabase: SupabaseClient, id: string): Promise<ProjectPage | null> {
  const [project, cards, boards] = await Promise.all([
    supabase.from('projects').select('id, name, kind').eq('id', id).maybeSingle(),
    supabase
      .from('cards')
      .select(
        'id, recording_id, project_id, title, gist, play_from_ms, confidence, frame_url, frame_status, frame_at, created_at, recordings(recorded_at, storage_path), thread_cards(threads(thread_cards(card_id)))'
      )
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    supabase.from('boards').select('id, threads!inner(project_id)', { count: 'exact', head: true }).eq('threads.project_id', id),
  ])
  const p = need('project', project) as Project | null
  if (!p) return null
  if (boards.error) throw new Error(`boards: ${boards.error.message}`)

  const ideas = (need('ideas', cards) as unknown as CardRow[])
    .map((c): CardItem => ({
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
      threadSize: c.thread_cards[0]?.threads?.thread_cards.length ?? 1,
    }))
    .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))
  return { project: p, ideas, boards: boards.count ?? 0 }
}

/** "4 ideas · 1 board" — the board count only once there is one. */
export function countLine(ideas: number, boards: number): string {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`
  return [n(ideas, 'idea'), boards > 0 && n(boards, 'board')].filter(Boolean).join(' · ')
}

/** Rename. A name she already uses for another project is refused by the unique index (0011) — say so plainly. */
export async function renameProject(supabase: SupabaseClient, id: string, name: string): Promise<string> {
  const clean = name.trim().replace(/\s+/g, ' ')
  if (!clean) throw new Error('A project needs a name.')
  const { data, error } = await supabase.from('projects').update({ name: clean }).eq('id', id).select('name')
  if (error?.code === '23505') throw new Error(`You already have a project called “${clean}”.`)
  if (error) throw new Error(`rename: ${error.message}`)
  if (!data?.length) throw new Error('This project has gone.')
  return data[0].name
}

/** Delete. Its ideas and to-dos go home to My things; its threads stay, unplaced (0011's trigger). */
export async function deleteProject(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id')
  if (error) throw new Error(`delete: ${error.message}`)
  if (!data?.length) throw new Error('This project has gone.')
}
