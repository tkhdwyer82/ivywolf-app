// apps/mobile/lib/trash.ts
// Trash (Job B.3, 0040). Move to trash hides an idea or a to-do everywhere — her reads can't see it (restrictive
// select policies) — for 30 days, then the purge job deletes it (packages/pipeline/trash.ts). Trashing an idea leaves
// the other ideas from its recording alone; if it was the last one, the recording's to-dos go with it and come back
// with it. Its links and thread are hidden, not deleted, so Restore puts them back. Trash and restore are functions
// (an update to trashed_at would fail the select policy); the trash view reads through trashed_items().

import type { SupabaseClient } from '@supabase/supabase-js'

export const TRASH_DAYS = 30

export type TrashItem = {
  kind: 'idea' | 'to-do'
  id: string
  title: string
  recordingId: string | null
  frameUrl: string | null
  trashedAt: string
  purgeAt: string
}

export async function trashCard(supabase: SupabaseClient, id: string): Promise<{ actions: number }> {
  const { data, error } = await supabase.rpc('trash_card', { p_card: id })
  if (error) throw new Error(`trash: ${error.message}`)
  if (!data) throw new Error('This idea has gone.')
  return { actions: (data as { actions: number }).actions }
}

export async function trashAction(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.rpc('trash_action', { p_action: id })
  if (error) throw new Error(`trash: ${error.message}`)
  if (!data) throw new Error('This to-do has gone.')
}

export async function restore(supabase: SupabaseClient, item: Pick<TrashItem, 'kind' | 'id'>): Promise<void> {
  const { data, error } =
    item.kind === 'idea'
      ? await supabase.rpc('restore_card', { p_card: item.id })
      : await supabase.rpc('restore_action', { p_action: item.id })
  if (error) throw new Error(`restore: ${error.message}`)
  if (!data) throw new Error('That’s no longer in the trash.')
}

type Row = { kind: 'idea' | 'to-do'; id: string; title: string; recording_id: string | null; frame_url: string | null; trashed_at: string; purge_at: string }

export function toTrashItem(r: Row): TrashItem {
  return { kind: r.kind, id: r.id, title: r.title, recordingId: r.recording_id, frameUrl: r.frame_url, trashedAt: r.trashed_at, purgeAt: r.purge_at }
}

export async function loadTrash(supabase: SupabaseClient): Promise<TrashItem[]> {
  const { data, error } = await supabase.rpc('trashed_items')
  if (error) throw new Error(`trash: ${error.message}`)
  return ((data ?? []) as Row[]).map(toTrashItem)
}

/** "Deletes in 12 days" · "Deletes tomorrow" · "Deletes today". Whole days, rounded up, on her clock. */
export function purgeLine(purgeAt: string, now: Date): string {
  const days = Math.ceil((new Date(purgeAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'Deletes today'
  if (days === 1) return 'Deletes tomorrow'
  return `Deletes in ${days} days`
}

/** The confirm line on the Idea page's Move to trash. */
export const TRASH_IDEA_LINE =
  `It stays in the trash for ${TRASH_DAYS} days, links and all, then it’s deleted. If it’s the last idea from its recording, that recording’s to-dos go with it.`
export const TRASH_TODO_LINE = `It stays in the trash for ${TRASH_DAYS} days, then it’s deleted. Its reminder is removed now.`
