// apps/mobile/lib/record.ts
// A finished recording → recordings bucket → recordings row (status 'queued') → ask apps/web to process → poll.
// Upload and row insert use the creator's own JWT (storage + table RLS). Processing runs server-side in apps/web
// because it needs the service role and the Deepgram/Anthropic keys, none of which ship in the app; the route
// returns at once and the app watches recordings.status.

import { File } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecordingStatus } from '@ivywolf/schema'

const API_URL = process.env.EXPO_PUBLIC_API_URL!
const POLL_MS = 2000
const POLL_TIMEOUT_MS = 6 * 60 * 1000

export type ProcessOutcome =
  | { status: 'done'; cards: number; title: string | null }
  | { status: 'junk'; reason: string | null }
  | { status: 'failed' }
  | { status: 'still_processing' }

/** Upload, insert, and ask the server to process. Returns as soon as the server has accepted the job. */
export async function submitRecording(args: {
  supabase: SupabaseClient
  userId: string
  token: string
  fileUri: string
  durationMs: number
  recordedAt: Date
}): Promise<{ recordingId: string }> {
  const { supabase, userId } = args

  // The creator row must exist before any graph row references it. Insert-if-missing under RLS.
  const creator = await supabase.from('creators').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
  if (creator.error) throw new Error(`creator: ${creator.error.message}`)

  const recordingId = randomUUID()
  const storagePath = `${userId}/${recordingId}.m4a`
  const bytes = await new File(args.fileUri).arrayBuffer()

  // Raw audio exactly as recorded — never transcoded (CLAUDE.md working agreements).
  const upload = await supabase.storage
    .from('recordings')
    .upload(storagePath, bytes, { contentType: 'audio/mp4', upsert: false })
  if (upload.error) throw new Error(`upload: ${upload.error.message}`)

  const row = await supabase.from('recordings').insert({
    id: recordingId,
    creator_id: userId,
    source: 'phone',
    storage_path: storagePath,
    duration_ms: args.durationMs,
    recorded_at: args.recordedAt.toISOString(),
    // The device's zone, so the pipeline can resolve "for Thursday" against her local day.
    recorded_tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    trigger: 'button',
  })
  if (row.error) throw new Error(`recording row: ${row.error.message}`)

  const res = await fetch(`${API_URL}/api/recordings/${recordingId}/process`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.token}` },
  })
  // 409: already claimed by an earlier submit of this same recording — it is processing, so just watch it.
  if (!res.ok && res.status !== 409) throw new Error(`process: ${res.status} ${await res.text()}`)
  return { recordingId }
}

/** Poll recordings.status until the pipeline finishes. Leaving the screen is fine — Voice notes keeps watching. */
export async function waitForRecording(
  supabase: SupabaseClient,
  recordingId: string,
  isCancelled: () => boolean = () => false
): Promise<ProcessOutcome> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline && !isCancelled()) {
    const { data, error } = await supabase
      .from('recordings')
      .select('status, title, junk_reason')
      .eq('id', recordingId)
      .single()
    if (error) throw new Error(`status: ${error.message}`)

    const status = data.status as RecordingStatus
    if (status === 'done') {
      const { count } = await supabase
        .from('cards')
        .select('id', { count: 'exact', head: true })
        .eq('recording_id', recordingId)
      return { status: 'done', cards: count ?? 0, title: data.title }
    }
    if (status === 'junk') return { status: 'junk', reason: data.junk_reason }
    if (status === 'failed') return { status: 'failed' }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  return { status: 'still_processing' }
}

// Deletion (audio, frames, then the row) lives in its own module so the deletion test can run it outside Expo.
export { deleteRecording } from './deleteRecording'
