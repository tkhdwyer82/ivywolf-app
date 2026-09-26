// apps/mobile/lib/mini.ts
// The Mini tab (L7, Figma 172:2). Connect your Mini is a stub until the device ships. "Have a DJI mic? Import a
// recording" picks an audio file and sends it through the same path as a take: recordings bucket → row → process.
// It lands as kind 'session', source 'dji_import', in the Ivy Mini project (0011, 0023).

import * as DocumentPicker from 'expo-document-picker'
import type { SupabaseClient } from '@supabase/supabase-js'
import { submitRecording } from '@/lib/record'

// What DJI mics and Files hand over, for when the picker gives no audio/* type of its own.
const CONTENT_TYPES: Record<string, string> = {
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  caf: 'audio/x-caf',
}

const extOf = (name: string) => /\.([a-z0-9]{2,4})$/i.exec(name)?.[1]?.toLowerCase() ?? null

/** Null when she cancels. Throws with a readable message when the file isn't audio or the upload fails. */
export async function importSession(args: {
  supabase: SupabaseClient
  userId: string
  token: string
}): Promise<{ recordingId: string } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false })
  if (picked.canceled || !picked.assets[0]) return null
  const file = picked.assets[0]
  const ext = extOf(file.name) ?? extOf(file.uri)
  if (!ext) throw new Error('That file isn’t a recording Ivy can read.')
  const contentType = file.mimeType?.startsWith('audio/') ? file.mimeType : (CONTENT_TYPES[ext] ?? null)
  if (!contentType) throw new Error('That file isn’t a recording Ivy can read.')

  // Sessions belong to Ivy Mini (rule 11: a default project, not a tab).
  const { data: mini } = await args.supabase.from('projects').select('id').eq('kind', 'mini').maybeSingle()

  return submitRecording({
    supabase: args.supabase,
    userId: args.userId,
    token: args.token,
    fileUri: file.uri,
    // The pipeline writes the real length from the transcript; the file's own date isn't one we trust (0001).
    durationMs: null,
    recordedAt: null,
    projectId: mini?.id ?? null,
    session: { source: 'dji_import', extension: ext, contentType },
    meta: { import_file: file.name },
  })
}
