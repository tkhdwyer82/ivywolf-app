// packages/pipeline/trash.ts
// The 30-day purge (Job B.3, 0040), run daily by apps/web/app/api/cron/purge-trash with the service role.
//
// 1. A discarded recording (Undo on Home) whose delete didn't finish goes now, whatever its age.
// 2. A recording goes whole — audio, transcript, every row from it — once every card and to-do from it has been in
//    the trash for 30 days.
// 3. Any other card or to-do 30 days in the trash goes on its own; its recording stays for the ideas still live.
//
// Files go before rows (packages/schema/deletion.ts), so a failed step is safe to run again tomorrow.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { deleteAction, deleteCard, deleteRecording } from '@ivywolf/schema/deletion'

export const TRASH_DAYS = 30

export function purgeCutoff(now: Date): Date {
  return new Date(now.getTime() - TRASH_DAYS * 24 * 60 * 60 * 1000)
}

type Expired = { id: string; recording_id: string | null }

/**
 * What to delete. `expiredCards` / `expiredActions` were trashed before the cutoff; `liveRecordings` are the
 * recordings (among theirs) that still have a card or to-do that isn't — live, or trashed more recently.
 */
export function purgePlan(args: {
  discarded: string[]
  expiredCards: Expired[]
  expiredActions: Expired[]
  liveRecordings: Set<string>
}): { recordings: string[]; cards: string[]; actions: string[] } {
  const whole = new Set(args.discarded)
  for (const row of [...args.expiredCards, ...args.expiredActions]) {
    if (row.recording_id && !args.liveRecordings.has(row.recording_id)) whole.add(row.recording_id)
  }
  const alone = (rows: Expired[]) => rows.filter((r) => !r.recording_id || !whole.has(r.recording_id)).map((r) => r.id)
  return { recordings: [...whole], cards: alone(args.expiredCards), actions: alone(args.expiredActions) }
}

function rows<T>(label: string, r: { data: T[] | null; error: { message: string } | null }): T[] {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data ?? []
}

export async function purgeTrash(
  now = new Date(),
  supabase: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
): Promise<{ recordings: number; cards: number; actions: number; errors: string[] }> {
  const cutoff = purgeCutoff(now).toISOString()
  const discarded = rows<{ id: string }>('discarded', await supabase.from('recordings').select('id').not('discarded_at', 'is', null))
  const expiredCards = rows<Expired>('cards', await supabase.from('cards').select('id, recording_id').lt('trashed_at', cutoff))
  const expiredActions = rows<Expired>('actions', await supabase.from('actions').select('id, recording_id').lt('trashed_at', cutoff))

  const touched = [...new Set([...expiredCards, ...expiredActions].map((r) => r.recording_id).filter((id): id is string => !!id))]
  const liveRecordings = new Set<string>()
  if (touched.length) {
    // Live: never trashed, or trashed since the cutoff.
    const stillHere = `trashed_at.is.null,trashed_at.gte.${cutoff}`
    for (const table of ['cards', 'actions'] as const) {
      const live = rows<{ recording_id: string }>(
        `live ${table}`,
        await supabase.from(table).select('recording_id').in('recording_id', touched).or(stillHere)
      )
      for (const r of live) liveRecordings.add(r.recording_id)
    }
  }

  const plan = purgePlan({ discarded: discarded.map((r) => r.id), expiredCards, expiredActions, liveRecordings })
  const errors: string[] = []
  const done = { recordings: 0, cards: 0, actions: 0 }
  const paths = new Map(
    rows<{ id: string; storage_path: string | null }>(
      'recordings',
      plan.recordings.length ? await supabase.from('recordings').select('id, storage_path').in('id', plan.recordings) : { data: [], error: null }
    ).map((r) => [r.id, r.storage_path])
  )
  for (const id of plan.recordings) {
    if (!paths.has(id)) continue // already gone
    await deleteRecording(supabase, { id, storage_path: paths.get(id) ?? null }).then(
      () => done.recordings++,
      (e) => errors.push(`recording ${id}: ${e instanceof Error ? e.message : e}`)
    )
  }
  for (const id of plan.cards) {
    await deleteCard(supabase, id).then(() => done.cards++, (e) => errors.push(`card ${id}: ${e instanceof Error ? e.message : e}`))
  }
  for (const id of plan.actions) {
    await deleteAction(supabase, id).then(() => done.actions++, (e) => errors.push(`to-do ${id}: ${e instanceof Error ? e.message : e}`))
  }
  return { ...done, errors }
}
