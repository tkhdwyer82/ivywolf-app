// packages/pipeline/process.ts
// Recording in → graph out. transcribe → junk gates → classify → shape → write → status.
// A text recording (0026, Muse's capture_idea) skips transcribe: its words are already on the row.
// Callers claim the recording first (claimRecording) so it is processed at most once.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RecordingSource, Utterance } from '@ivywolf/schema'
import { signedUrl } from './storage'
import { transcribe, type Transcript } from './transcribe'
import { textUtterances } from './text'
import { classify, PROMPT_VERSION, recordedDay, type CreatorContext, type PromptVersion, type RecordedDay } from './classify'
import { frameRecording } from './frames'
import { referencePicturesForRecording } from './references/picture'
import { shapeCards, type Analysed } from './shape'
import { attachImport, parseImport, type Import } from './imports'
import { bestPhoto, loadCapture, mergeNotes, photoAsImport, type Capture, type CaptureNote } from './capture'
import { loadCreatorContext, markDone, markJunk, threadNewCards, writeClassification, type NewCard } from './graph'
import { Discarded, stillWanted } from './discard'

export { claimRecording, markFailed } from './graph'
export { Discarded, isDiscarded, stillWanted } from './discard'
export { purgePlan, purgeTrash, TRASH_DAYS } from './trash'
export { backfillTodoRenders, housePrompt, nounOf, thumbOf } from './houseRender'
// For Change view → Photo (apps/web/app/api/cards/[id]/photo): the same Unsplash lane a new photo card takes.
export { photoForCard } from './frames'
export { backfillReferencePictures, referencePicturesForRecording, toReferencePicture, type ReferencePicture } from './references/picture'
export { findReferences, pinterestAvailable, trackReferenceUse, type Reference, type ReferenceSource } from './references'
export { generateDirections, shouldGenerate, MIN_CARDS as DIRECTIONS_MIN_CARDS } from './suggest'
export {
  applyRecipe,
  extractRecipe,
  inviteAuthor,
  loadRecipeForApply,
  priceOf as recipePriceOf,
  undoApplication,
  RecipeError,
  type ApplyResult,
  type ExtractOutcome,
} from './recipes'
export { transcribe } from './transcribe'
// For the MCP server's search_ideas (apps/web/lib/mcp/handlers.ts): the same embedding and similarity threading uses.
export { embed } from './embed'
export { cosine } from './threading'
export { textUtterances, MAX_TEXT_CHARS } from './text'
export { bestPhoto, mergeNotes } from './capture'

const MIN_DURATION_MS = 3000

export type ProcessResult =
  | { junk: 'no_speech' | 'too_short'; transcript: Transcript }
  | { junk: null; transcript: Transcript; out: Analysed }

/** Transcribe and classify without touching the graph. The eval runner uses this directly. */
export async function analyse(args: {
  audioUrl: string
  source: RecordingSource
  creator: CreatorContext
  recorded: RecordedDay | null
  promptVersion?: PromptVersion
  /** An import's spoken line may be short ("for the reel"): skip the too-short gate (imports.ts). */
  keepShort?: boolean
  /** What she typed while it recorded (B.11, capture.ts): merged into the transcript by time before classify. */
  notes?: CaptureNote[]
}): Promise<ProcessResult> {
  const heard = await transcribe(args.audioUrl)
  const notes = args.notes ?? []
  const transcript: Transcript = notes.length ? { ...heard, utterances: mergeNotes(heard.utterances, notes) } : heard

  // Junk gates run before the model: never summarise junk. Typed notes are words she meant, however short the audio.
  if (!args.keepShort && !notes.length && transcript.duration_ms > 0 && transcript.duration_ms < MIN_DURATION_MS) {
    return { junk: 'too_short', transcript }
  }
  if (transcript.utterances.length === 0) return { junk: 'no_speech', transcript }

  const classified = await classify({
    utterances: transcript.utterances,
    creator: args.creator,
    source: args.source,
    recorded: args.recorded,
    promptVersion: args.promptVersion,
  })
  const out = await shapeCards({ out: classified, people: args.creator.people.map((p) => p.canonical) })
  return { junk: null, transcript, out }
}

/**
 * The text path: classify_v6 on words that arrived as text, with no Deepgram call. Same junk rule for nothing said;
 * no too-short gate — a typed line is short by nature, and "< 3 s" is about accidental taps.
 *
 * The classifier is told source 'phone': its prompt (classify_v6) knows no 'muse' source, and a Muse capture is what
 * 'phone' means to it — one speaker, her own words, about her own ideas. The recording row keeps source 'muse'.
 */
export async function analyseText(args: {
  utterances: Utterance[]
  creator: CreatorContext
  recorded: RecordedDay | null
  promptVersion?: PromptVersion
}): Promise<ProcessResult> {
  const last = args.utterances[args.utterances.length - 1]
  const transcript: Transcript = { duration_ms: last?.end_ms ?? 0, utterances: args.utterances, raw: null }
  if (args.utterances.length === 0) return { junk: 'no_speech', transcript }
  const classified = await classify({
    utterances: args.utterances,
    creator: args.creator,
    source: 'phone',
    recorded: args.recorded,
    promptVersion: args.promptVersion,
  })
  const out = await shapeCards({ out: classified, people: args.creator.people.map((p) => p.canonical) })
  return { junk: null, transcript, out }
}

/**
 * A text row's utterances: its typed notes in time order (B.11, a typed-only capture from the app); what the MCP
 * server wrote (textUtterances); or, failing those, its meta.text re-split.
 */
function storedUtterances(rec: { transcript: unknown; meta: unknown }, notes: CaptureNote[] = []): Utterance[] {
  if (notes.length) return mergeNotes([], notes)
  if (Array.isArray(rec.transcript)) return rec.transcript as Utterance[]
  const text = (rec.meta as { text?: unknown } | null)?.text
  return typeof text === 'string' ? textUtterances(text) : []
}

/** meta.correction_of, if it's one of the creator's own cards (P9's mic) or to-dos (P17's). */
async function ownTarget(supabase: SupabaseClient, creatorId: string, id: unknown): Promise<{ id: string; kind: 'card' | 'to-do' } | null> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const card = await supabase.from('cards').select('id').eq('id', id).eq('creator_id', creatorId).maybeSingle()
  if (card.data) return { id: card.data.id, kind: 'card' }
  const todo = await supabase.from('actions').select('id').eq('id', id).eq('creator_id', creatorId).maybeSingle()
  return todo.data ? { id: todo.data.id, kind: 'to-do' } : null
}

const EMPTY_OUTPUT: Analysed = {
  trigger: 'none', title: 'Correction', segments: [], cards: [], actions: [], entities: [], loose_ends: [], requests: [], style_signals: [],
  shape_version: null,
}

/** Full pipeline for one recordings row the caller has already claimed (status 'processing'). */
export async function processRecording(recordingId: string): Promise<ProcessResult> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data: rec, error } = await supabase
    .from('recordings')
    .select('id, creator_id, source, kind, storage_path, recorded_at, recorded_tz, project_id, meta, transcript, discarded_at')
    .eq('id', recordingId)
    .single()
  if (error || !rec) throw new Error(`recording ${recordingId}: ${error?.message ?? 'not found'}`)
  // Undo on Home (0040) stops the pipeline wherever it has got to: here, after transcribing, and before frames.
  if (rec.discarded_at) throw new Discarded(rec.id)

  const creator = await loadCreatorContext(rec.creator_id, rec.project_id)
  const recorded = recordedDay(rec.recorded_at, rec.recorded_tz)

  // Notes and photos added on the capture screen (B.11, 0043). None for anything recorded before it.
  const capture = await loadCapture(rec.id, rec.creator_id, supabase)

  if (rec.kind === 'text') return processText(supabase, rec, creator, recorded, capture)

  const audioUrl = await signedUrl('recordings', rec.storage_path, 15 * 60)
  // Voice correction (the mic on P9 or P17) — a stub for now: the note is kept, transcribed and tagged to its card
  // or to-do, but nothing in the graph changes and nothing is made from it. Applying corrections comes later.
  const correctionOf = await ownTarget(supabase, rec.creator_id, (rec.meta as { correction_of?: unknown } | null)?.correction_of)
  if (correctionOf) {
    const transcript = await transcribe(audioUrl)
    await supabase
      .from('recordings')
      .update({ transcript: transcript.utterances, duration_ms: transcript.duration_ms, title: 'Correction' })
      .eq('id', rec.id)
    await markDone(rec.id)
    console.log(`[pipeline] ${rec.id}: correction note for ${correctionOf.kind} ${correctionOf.id} kept (stub)`)
    return { junk: null, transcript, out: EMPTY_OUTPUT }
  }

  const imported = parseImport(rec.meta, rec.creator_id)
  const result = await analyse({ audioUrl, source: rec.source, creator, recorded, keepShort: !!imported, notes: capture.notes })
  await stillWanted(supabase, rec.id)

  if (result.junk && !imported && capture.photos.length === 0) {
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
  // An import's picture, or the capture's best photo (B.11): her own picture goes on the first card.
  const picture = imported ?? capturePicture(capture, result)
  if (picture) {
    // Silence is fine with a picture: the picture is the idea. Keep the (empty) transcript on the recording.
    if (result.junk) {
      await supabase.from('recordings').update({ transcript: result.transcript.utterances }).eq('id', rec.id)
    }
    cards = await attachImport({
      creatorId: rec.creator_id,
      recordingId: rec.id,
      projectId: rec.project_id,
      imported: picture,
      cards,
      title: result.junk ? null : result.out.title,
      words: result.transcript.utterances.map((u) => u.text).join(' '),
    })
  }

  await finish(supabase, rec, cards)
  return result
}

/** The capture's best photo for the first card: the one added nearest the moment that idea was said. */
function capturePicture(capture: Capture, result: ProcessResult): Import | null {
  const first = result.junk ? null : result.out.cards[0]
  const best = bestPhoto(capture.photos, first ? first.play_from_ms : null)
  return best ? photoAsImport(best) : null
}

type Rec = { id: string; creator_id: string; project_id: string | null; transcript: unknown; meta: unknown }

async function processText(
  supabase: SupabaseClient,
  rec: Rec,
  creator: CreatorContext,
  recorded: RecordedDay | null,
  capture: Capture = { notes: [], photos: [] }
): Promise<ProcessResult> {
  const result = await analyseText({ utterances: storedUtterances(rec, capture.notes), creator, recorded })
  await stillWanted(supabase, rec.id)
  if (result.junk && capture.photos.length === 0) {
    await markJunk(rec.id, result.junk, result.transcript.utterances)
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
  // Typed + photos (B.11): the best photo is the first card's picture, as on the audio path.
  const picture = capturePicture(capture, result)
  if (picture) {
    cards = await attachImport({
      creatorId: rec.creator_id,
      recordingId: rec.id,
      projectId: rec.project_id,
      imported: picture,
      cards,
      title: result.junk ? null : result.out.title,
      words: result.transcript.utterances.map((u) => u.text).join(' '),
    })
  }
  await finish(supabase, rec, cards)
  return result
}

/** Thread, mark done, frame — the same for audio and text. */
async function finish(supabase: SupabaseClient, rec: Pick<Rec, 'id' | 'creator_id'>, cards: NewCard[]) {
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
  await stillWanted(supabase, rec.id)
  await markDone(rec.id)

  // Frames after the card is visible: a slow or failed frame never holds it back (frames.ts sets 'failed' per frame).
  try {
    await frameRecording(rec.creator_id, rec.id)
  } catch (err) {
    console.error(`[pipeline] ${rec.id}: frames failed`, err)
  }
  // Then a reference picture for every card still without one (Home v4: every idea carries a picture).
  try {
    await referencePicturesForRecording(rec.creator_id, rec.id)
  } catch (err) {
    console.error(`[pipeline] ${rec.id}: reference pictures failed`, err)
  }
}
