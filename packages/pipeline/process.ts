// packages/pipeline/process.ts
// Recording in → graph out. transcribe → junk gates → classify_v1 → write.

import { createClient } from '@supabase/supabase-js'
import type { ClassifyOutput, RecordingSource } from '@ivywolf/schema'
import { signedUrl } from './storage'
import { transcribe, type Transcript } from './transcribe'
import { classify, PROMPT_VERSION, type CreatorContext } from './classify'
import { loadCreatorContext, markJunk, writeClassification } from './graph'

const MIN_DURATION_MS = 3000

export type ProcessResult =
  | { junk: 'no_speech' | 'too_short'; transcript: Transcript }
  | { junk: null; transcript: Transcript; out: ClassifyOutput }

/** Transcribe and classify without touching the graph. The eval runner uses this directly. */
export async function analyse(args: {
  audioUrl: string
  source: RecordingSource
  creator: CreatorContext
}): Promise<ProcessResult> {
  const transcript = await transcribe(args.audioUrl)

  // Junk gates run before the model: never summarise junk.
  if (transcript.duration_ms > 0 && transcript.duration_ms < MIN_DURATION_MS) {
    return { junk: 'too_short', transcript }
  }
  if (transcript.utterances.length === 0) return { junk: 'no_speech', transcript }

  const out = await classify({
    utterances: transcript.utterances,
    creator: args.creator,
    source: args.source,
  })
  return { junk: null, transcript, out }
}

/** Full pipeline for one recordings row. */
export async function processRecording(recordingId: string): Promise<ProcessResult> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data: rec, error } = await supabase
    .from('recordings')
    .select('id, creator_id, source, storage_path')
    .eq('id', recordingId)
    .single()
  if (error || !rec) throw new Error(`recording ${recordingId}: ${error?.message ?? 'not found'}`)

  const creator = await loadCreatorContext(rec.creator_id)
  const audioUrl = await signedUrl('recordings', rec.storage_path, 15 * 60)
  const result = await analyse({ audioUrl, source: rec.source, creator })

  if (result.junk) {
    await markJunk(rec.id, result.junk, result.transcript.raw)
    return result
  }

  await supabase.from('recordings').update({ duration_ms: result.transcript.duration_ms }).eq('id', rec.id)
  await writeClassification({
    creatorId: rec.creator_id,
    recordingId: rec.id,
    transcript: result.transcript.utterances,
    out: result.out,
    promptVersion: PROMPT_VERSION,
  })
  return result
}
