// packages/pipeline/process.ts
// Recording in → graph out. transcribe → junk gates → classify → write → status.
// Callers claim the recording first (claimRecording) so it is processed at most once.

import { createClient } from '@supabase/supabase-js'
import type { ClassifyOutput, RecordingSource } from '@ivywolf/schema'
import { signedUrl } from './storage'
import { transcribe, type Transcript } from './transcribe'
import { classify, PROMPT_VERSION, recordedDay, type CreatorContext, type PromptVersion, type RecordedDay } from './classify'
import { frameRecording } from './frames'
import { attachImport, parseImport } from './imports'
import { loadCreatorContext, markDone, markJunk, threadNewCards, writeClassification, type NewCard } from './graph'

export { claimRecording, markFailed } from './graph'

const MIN_DURATION_MS = 3000

export type ProcessResult =
  | { junk: 'no_speech' | 'too_short'; transcript: Transcript }
  | { junk: null; transcript: Transcript; out: ClassifyOutput }

/** Transcribe and classify without touching the graph. The eval runner uses this directly. */
export async function analyse(args: {
  audioUrl: string
  source: RecordingSource
  creator: CreatorContext
  recorded: RecordedDay | null
  promptVersion?: PromptVersion
  /** An import's spoken line may be short ("for the reel"): skip the too-short gate (imports.ts). */
  keepShort?: boolean
}): Promise<ProcessResult> {
  const transcript = await transcribe(args.audioUrl)

  // Junk gates run before the model: never summarise junk.
  if (!args.keepShort && transcript.duration_ms > 0 && transcript.duration_ms < MIN_DURATION_MS) {
    return { junk: 'too_short', transcript }
  }
  if (transcript.utterances.length === 0) return { junk: 'no_speech', transcript }

  const out = await classify({
    utterances: transcript.utterances,
    creator: args.creator,
    source: args.source,
    recorded: args.recorded,
    promptVersion: args.promptVersion,
  })
  return { junk: null, transcript, out }
}

/** Full pipeline for one recordings row the caller has already claimed (status 'processing'). */
export async function processRecording(recordingId: string): Promise<ProcessResult> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data: rec, error } = await supabase
    .from('recordings')
    .select('id, creator_id, source, storage_path, recorded_at, recorded_tz, project_id, meta')
    .eq('id', recordingId)
    .single()
  if (error || !rec) throw new Error(`recording ${recordingId}: ${error?.message ?? 'not found'}`)

  const creator = await loadCreatorContext(rec.creator_id, rec.project_id)
  const audioUrl = await signedUrl('recordings', rec.storage_path, 15 * 60)
  const recorded = recordedDay(rec.recorded_at, rec.recorded_tz)
  const imported = parseImport(rec.meta, rec.creator_id)
  const result = await analyse({ audioUrl, source: rec.source, creator, recorded, keepShort: !!imported })

  if (result.junk && !imported) {
    await markJunk(rec.id, result.junk, result.transcript.raw)
    return result
  }

  await supabase.from('recordings').update({ duration_ms: result.transcript.duration_ms }).eq('id', rec.id)
  let cards: NewCard[] = []
  if (!result.junk) {
    ;({ cards } = await writeClassification({
      creatorId: rec.creator_id,
      recordingId: rec.id,
      transcript: result.transcript.utterances,
      out: result.out,
      promptVersion: PROMPT_VERSION,
      projectId: rec.project_id,
    }))
  }
  if (imported) {
    // Silence is fine for an import: the picture is the idea. Keep the (empty) transcript on the recording.
    if (result.junk) {
      await supabase.from('recordings').update({ transcript: result.transcript.utterances }).eq('id', rec.id)
    }
    cards = await attachImport({
      creatorId: rec.creator_id,
      recordingId: rec.id,
      projectId: rec.project_id,
      imported,
      cards,
      title: result.junk ? null : result.out.title,
      words: result.transcript.utterances.map((u) => u.text).join(' '),
    })
  }

  // Threading is best-effort: if embedding fails the cards are still saved and show under "New sparks"; the
  // error is kept on the recording so it can be re-threaded later.
  try {
    const threading = await threadNewCards(rec.creator_id, cards)
    console.log(
      `[pipeline] ${rec.id}: ${threading.assignments.filter((a) => a.created).length} new thread(s), ` +
        `${threading.assignments.filter((a) => !a.created).length} attached, ${threading.merges.length} merge(s) proposed`
    )
  } catch (err) {
    console.error(`[pipeline] ${rec.id}: threading failed`, err)
    await supabase
      .from('recordings')
      .update({ processing_error: `threading: ${err instanceof Error ? err.message : String(err)}`.slice(0, 2000) })
      .eq('id', rec.id)
  }
  await markDone(rec.id)

  // Frames after the card is visible: a slow or failed frame never holds it back (frames.ts sets 'failed' per frame).
  try {
    await frameRecording(rec.creator_id, rec.id)
  } catch (err) {
    console.error(`[pipeline] ${rec.id}: frames failed`, err)
  }
  return result
}
