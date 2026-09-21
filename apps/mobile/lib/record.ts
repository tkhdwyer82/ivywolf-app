// apps/mobile/lib/record.ts
// A finished recording → recordings bucket → recordings row → pipeline.
// Upload and row insert use the creator's own JWT (storage + table RLS); the pipeline runs server-side in apps/web
// because it needs the service role and the Deepgram/Anthropic keys, none of which ship in the app.

import { File } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const API_URL = process.env.EXPO_PUBLIC_API_URL!

export type ProcessOutcome =
  | { status: 'processed'; cards: number; title: string }
  | { status: 'junk'; reason: string }

export async function submitRecording(args: {
  supabase: SupabaseClient
  userId: string
  token: string
  fileUri: string
  durationMs: number
  recordedAt: Date
}): Promise<{ recordingId: string; outcome: ProcessOutcome }> {
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
    trigger: 'button',
  })
  if (row.error) throw new Error(`recording row: ${row.error.message}`)

  const res = await fetch(`${API_URL}/api/recordings/${recordingId}/process`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.token}` },
  })
  if (!res.ok) throw new Error(`process: ${res.status} ${await res.text()}`)
  return { recordingId, outcome: (await res.json()) as ProcessOutcome }
}
