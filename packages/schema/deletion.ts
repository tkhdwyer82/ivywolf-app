// packages/schema/deletion.ts
// Delete a recording and everything derived from it (privacy promise: "its transcript and derived cards go with
// it"). No Expo imports, so the same code runs in the app (her own token), the purge job (the service role, 0040) and
// the deletion test (scripts/test-delete-recording.ts).
//
// Storage first, then the row: if the row delete fails, retrying is safe (removing a missing object is a no-op),
// whereas the other order could leave files behind with nothing pointing at them. The row delete cascades to
// segments, cards, actions, loose ends and requests, and removes any thread left empty (0007).
//
// Imports (0018): an added image or video's original (private `imports`) goes with its card; its poster is the
// card's frame.
// Frames (0015): a card's frame is its own and always goes. A to-do's frame is shared by every to-do with the same
// brief (frames.ts cache), so it goes only when no to-do outside this recording still uses it.
//
// Trash (0040): her own token can't see trashed cards and to-dos, so their files come from trashed_items() as well.
// The service role sees every row and gets nothing extra from it.

import type { SupabaseClient } from '@supabase/supabase-js'

const FRAMES_PREFIX = '/storage/v1/object/public/frames/'

/** Public frame URL → its path in the frames bucket; null for anything else. */
export function framePath(url: string | null): string | null {
  if (!url) return null
  const i = url.indexOf(FRAMES_PREFIX)
  return i === -1 ? null : decodeURIComponent(url.slice(i + FRAMES_PREFIX.length).split('?')[0])
}

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

type Trashed = { kind: 'idea' | 'to-do'; recording_id: string | null; frame_url: string | null; media_path: string | null }

export async function deleteRecording(supabase: SupabaseClient, recording: { id: string; storage_path: string | null }) {
  const trashed = (need('trash', await supabase.rpc('trashed_items')) as Trashed[]).filter((t) => t.recording_id === recording.id)
  const cards = [
    ...(need(
      'cards',
      await supabase.from('cards').select('frame_url, media_path').eq('recording_id', recording.id)
    ) as { frame_url: string | null; media_path: string | null }[]),
    ...trashed.filter((t) => t.kind === 'idea'),
  ]
  const actions = [
    ...(need(
      'actions',
      await supabase.from('actions').select('frame_url').eq('recording_id', recording.id).not('frame_url', 'is', null)
    ) as { frame_url: string }[]),
    ...trashed.filter((t): t is Trashed & { frame_url: string } => t.kind === 'to-do' && !!t.frame_url),
  ]

  const paths = cards.map((c) => framePath(c.frame_url)).filter((p): p is string => p !== null)
  for (const url of new Set(actions.map((a) => a.frame_url))) {
    const { count, error } = await supabase
      .from('actions')
      .select('id', { count: 'exact', head: true })
      .eq('frame_url', url)
      .neq('recording_id', recording.id)
    if (error) throw new Error(`to-do frame references: ${error.message}`)
    const path = framePath(url)
    if (count === 0 && path) paths.push(path)
  }

  // A text recording (0026: an idea added through Muse) has no audio to remove.
  if (recording.storage_path) {
    const removed = await supabase.storage.from('recordings').remove([recording.storage_path])
    if (removed.error) throw new Error(`audio: ${removed.error.message}`)
  }
  const originals = cards.map((c) => c.media_path).filter((p): p is string => !!p)
  if (originals.length) {
    const gone = await supabase.storage.from('imports').remove(originals)
    if (gone.error) throw new Error(`imports: ${gone.error.message}`)
  }
  if (paths.length) {
    const frames = await supabase.storage.from('frames').remove(paths)
    if (frames.error) throw new Error(`frames: ${frames.error.message}`)
  }

  const { error, count } = await supabase.from('recordings').delete({ count: 'exact' }).eq('id', recording.id)
  if (error) throw new Error(`recording: ${error.message}`)
  if (count === 0) throw new Error('recording: not deleted')
}

/**
 * Undo on Home's "Writing it up" pill (0040). The stamp comes first: it stops the pipeline at its next stage, and if
 * the delete below doesn't finish, the take stays hidden and the purge job finishes it.
 */
export async function discardRecording(supabase: SupabaseClient, recording: { id: string; storage_path: string | null }) {
  const { error } = await supabase.from('recordings').update({ discarded_at: new Date().toISOString() }).eq('id', recording.id)
  if (error) throw new Error(`discard: ${error.message}`)
  await deleteRecording(supabase, recording)
}

/**
 * Delete one idea for good: the card, its own frame, and an import's original. The recording stays — it may hold
 * other ideas. The row goes last, as above. Moving an idea to the trash is trash_card (0040); this is the purge.
 */
export async function deleteCard(supabase: SupabaseClient, cardId: string) {
  const card = need(
    'card',
    await supabase.from('cards').select('frame_url, media_path').eq('id', cardId).maybeSingle()
  ) as { frame_url: string | null; media_path: string | null } | null
  if (!card) return
  const frame = framePath(card.frame_url)
  if (frame) {
    const r = await supabase.storage.from('frames').remove([frame])
    if (r.error) throw new Error(`frame: ${r.error.message}`)
  }
  if (card.media_path) {
    const r = await supabase.storage.from('imports').remove([card.media_path])
    if (r.error) throw new Error(`import: ${r.error.message}`)
  }
  const { error } = await supabase.from('cards').delete().eq('id', cardId)
  if (error) throw new Error(`card: ${error.message}`)
}

/** Delete one to-do for good (the purge, 0040): its frame only if no other to-do uses it, then the row. */
export async function deleteAction(supabase: SupabaseClient, actionId: string) {
  const action = need(
    'action',
    await supabase.from('actions').select('frame_url').eq('id', actionId).maybeSingle()
  ) as { frame_url: string | null } | null
  if (!action) return
  const path = framePath(action.frame_url)
  if (path) {
    const { count, error } = await supabase
      .from('actions')
      .select('id', { count: 'exact', head: true })
      .eq('frame_url', action.frame_url!)
      .neq('id', actionId)
    if (error) throw new Error(`to-do frame references: ${error.message}`)
    if (count === 0) {
      const r = await supabase.storage.from('frames').remove([path])
      if (r.error) throw new Error(`frame: ${r.error.message}`)
    }
  }
  const { error } = await supabase.from('actions').delete().eq('id', actionId)
  if (error) throw new Error(`to-do: ${error.message}`)
}
