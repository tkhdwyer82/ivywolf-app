// packages/pipeline/covers.ts
// The cover ladder (B.12): what picture an idea wears, so a vague idea stops getting an abstract stock photo.
//
//   a. her photo from the capture (B.11, imports.ts: source 'import') — never replaced;
//   b. else the Ivy library's best photo for the idea's words, when its text similarity ≥ LIBRARY_THRESHOLD — copied
//      into frames/<creator>/covers/ and credited "Ivy library" (frame_attribution.provider 'ivy_library');
//   c. else a picture generated on fal (COVER_MODEL) with the top STYLE_REFS library photos as style references
//      (provider 'ivy_generated'; cost logged in frame_generations);
//   d. else what there was before: the Unsplash photo / reference picture (frames.ts, references/picture.ts), else
//      the project hue.
//
// Behind INSPIRATION_ENABLED (and the library's TEST project being configured): off, nothing here runs and every
// idea goes straight to (d), exactly as before. The library is third-party reference pictures on its own project
// (inspiration.ts); only the idea's words go to the embedder, and only its subject line (names heard in the recording
// stripped, redact.ts) plus library pictures go to fal — never her transcript, her pictures or anyone else's data.
//
// A cover lives in the card's one frame slot (frame_url + frame_attribution), so Home, the idea page and deletion
// (packages/schema/deletion.ts removes frames/<path> with the card) need no new column.

import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { embed } from './embed'
import { INSPIRATION_BUCKET, inspirationDb, type InspirationItem } from './inspiration'
import { peopleFor, stripPeople } from './redact'
import { uploadBuffer } from './storage'

/** Step b's bar: the cosine similarity between the idea's words and a library photo's tags. Tuned on her ideas. */
export const LIBRARY_THRESHOLD = 0.3
/** Step c sends this many of the nearest library photos as style references. */
export const STYLE_REFS = 3
/** Library candidates looked at per idea (photos only — a clip has no still to copy). */
const POOL = 24
/** Change cover offers this many. */
export const COVER_CHOICES = 6
export const COVER_MODEL = 'fal-ai/nano-banana/edit'
/** fal pricing for nano-banana/edit: $0.0398 per image (checked 2026-11-08). */
export const COVER_USD = 0.0398
const COVER_PX = 1200

export type CoverProvider = 'ivy_library' | 'ivy_generated'
export interface LibraryAttribution {
  provider: 'ivy_library'
  item_id: string
  caption: string
  similarity: number
}
export interface GeneratedAttribution {
  provider: 'ivy_generated'
  model: string
  refs: string[]
  cost_usd: number
}

export const coversEnabled = () =>
  process.env.INSPIRATION_ENABLED === '1' && !!process.env.INSPIRATION_SUPABASE_URL && !!process.env.INSPIRATION_SUPABASE_SERVICE_ROLE_KEY

export interface CoverCard {
  id: string
  creator_id: string
  recording_id: string | null
  title: string
  gist: string | null
  visual_query: string | null
  source: string | null
  frame_attribution: { provider?: string } | null
}
const COLUMNS = 'id, creator_id, recording_id, title, gist, visual_query, source, frame_attribution'

export interface LibraryMatch {
  id: string
  path: string
  kind: 'photo' | 'video'
  caption: string
  similarity: number
}

/** What the library is searched with: the idea's own words, title first — the same as the idea page's library row. */
export const coverQuery = (card: { title: string; gist: string | null }) =>
  `${card.title}. ${card.gist ?? ''}`.replace(/\s+/g, ' ').trim().slice(0, 200)

/** Her own picture is already the cover (a, an import or the capture's photo); nothing below may replace it. */
export const ownCover = (card: Pick<CoverCard, 'source'>) => card.source === 'import'
/** A cover the ladder put there (b or c). */
export const ladderCover = (card: Pick<CoverCard, 'frame_attribution'>) =>
  card.frame_attribution?.provider === 'ivy_library' || card.frame_attribution?.provider === 'ivy_generated'

export type CoverStep =
  | { step: 'own' }
  | { step: 'library'; item: LibraryMatch }
  | { step: 'generate'; refs: LibraryMatch[] }
  | { step: 'fallback' }

/** The ladder, as a decision: nothing is fetched or written here. Videos never become covers or references. */
export function chooseCover(card: Pick<CoverCard, 'source'>, matches: LibraryMatch[], threshold = LIBRARY_THRESHOLD): CoverStep {
  if (ownCover(card)) return { step: 'own' }
  const photos = matches.filter((m) => m.kind === 'photo').sort((a, b) => b.similarity - a.similarity)
  if (photos.length === 0) return { step: 'fallback' }
  if (photos[0].similarity >= threshold) return { step: 'library', item: photos[0] }
  return { step: 'generate', refs: photos.slice(0, STYLE_REFS) }
}

/** What step c draws: the idea's photo words, else its title — with the names heard in its recording taken out. */
export function coverSubject(card: Pick<CoverCard, 'visual_query' | 'title'>, people: string[]): string {
  const raw = card.visual_query?.trim() || card.title.trim()
  return stripPeople(raw, people).text.replace(/\s+/g, ' ').trim()
}

/** Step c's prompt: her subject in the references' look, never their objects or marks. */
export function coverPrompt(subject: string): string {
  return [
    `A photograph of: ${subject.replace(/\.$/, '')}.`,
    'Match the reference images’ look — their light, colour, materials, surfaces and framing — but make a new picture of this subject; do not copy their products.',
    'No text, no lettering, no logos, no brand marks, no faces.',
  ].join(' ')
}

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

/** The library's nearest pictures for the idea's words, by raw text similarity (no keyword boost: the bar is cosine). */
export async function libraryMatches(card: Pick<CoverCard, 'title' | 'gist'>, lib: SupabaseClient = inspirationDb(), pool = POOL): Promise<LibraryMatch[]> {
  const [query] = await embed([coverQuery(card)], 'query')
  const { data, error } = await lib.rpc('inspiration_search', { query_embedding: JSON.stringify(query), people_filter: null, match_count: pool })
  if (error) throw new Error(`library search: ${error.message}`)
  return (data as (InspirationItem & { similarity: number })[]).map((r) => ({
    id: r.id, path: r.path, kind: r.kind, caption: r.caption, similarity: r.similarity,
  }))
}

const coverPath = (creatorId: string, cardId: string) => `${creatorId}/covers/${cardId}-${Date.now()}.jpg`
const toCover = (b: Buffer) =>
  sharp(b).rotate().resize(COVER_PX, COVER_PX, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer()

/** A library photo as a cover file in her frames folder; the public URL. */
export async function copyLibraryPhoto(creatorId: string, cardId: string, path: string, lib: SupabaseClient = inspirationDb()): Promise<string> {
  const { data, error } = await lib.storage.from(INSPIRATION_BUCKET).download(path)
  if (error) throw new Error(`library download: ${error.message}`)
  const jpeg = await toCover(Buffer.from(await data.arrayBuffer()))
  return uploadBuffer({ bucket: 'frames', buffer: jpeg, path: coverPath(creatorId, cardId), contentType: 'image/jpeg' })
}

/** Step c: one picture on fal, styled on the references (signed for 10 minutes — fal fetches them straight away). */
export async function generateCover(subject: string, refs: LibraryMatch[], lib: SupabaseClient = inspirationDb()): Promise<Buffer> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')
  const { data: signed, error } = await lib.storage.from(INSPIRATION_BUCKET).createSignedUrls(refs.map((r) => r.path), 600)
  if (error) throw new Error(`sign refs: ${error.message}`)
  const image_urls = signed.map((s) => s.signedUrl).filter(Boolean)
  if (image_urls.length === 0) throw new Error('no reference could be signed')
  const res = await fetch(`https://fal.run/${COVER_MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: coverPrompt(subject), image_urls, num_images: 1, aspect_ratio: '3:4', output_format: 'jpeg' }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const url = ((await res.json()) as { images?: { url: string }[] }).images?.[0]?.url
  if (!url) throw new Error('fal returned no image')
  const image = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!image.ok) throw new Error(`fal image ${image.status}`)
  return toCover(Buffer.from(await image.arrayBuffer()))
}

/** The old cover file, if the ladder made it (never her poster, never an Unsplash URL). */
async function removeOldCover(supabase: SupabaseClient, frameUrl: string | null) {
  const marker = '/storage/v1/object/public/frames/'
  const i = frameUrl?.indexOf(marker) ?? -1
  if (!frameUrl || i < 0) return
  const path = decodeURIComponent(frameUrl.slice(i + marker.length).split('?')[0])
  if (!/^[^/]+\/covers\//.test(path)) return
  const { error } = await supabase.storage.from('frames').remove([path])
  if (error) console.error(`[covers] old cover ${path}: ${error.message}`)
}

async function setCover(supabase: SupabaseClient, card: CoverCard, url: string, attribution: LibraryAttribution | GeneratedAttribution) {
  const { data: before } = await supabase.from('cards').select('frame_url').eq('id', card.id).single()
  const { error } = await supabase
    .from('cards')
    .update({ frame_url: url, frame_status: 'done', frame_at: new Date().toISOString(), frame_attribution: attribution })
    .eq('id', card.id)
    .eq('creator_id', card.creator_id)
  if (error) throw new Error(`card ${card.id}: ${error.message}`)
  if (before?.frame_url && before.frame_url !== url) await removeOldCover(supabase, before.frame_url as string)
}

export interface CoverOutcome {
  step: CoverStep['step']
  top: LibraryMatch | null
  cost_usd: number
  error?: string
}

/**
 * Run the ladder for one card and write the result. `dryRun` decides and reports without writing or spending.
 * Never throws: a failure at b or c leaves the card for (d).
 */
export async function coverCard(
  card: CoverCard,
  opts: { supabase?: SupabaseClient; lib?: SupabaseClient; people?: string[]; threshold?: number; dryRun?: boolean } = {}
): Promise<CoverOutcome> {
  if (ownCover(card)) return { step: 'own', top: null, cost_usd: 0 }
  const supabase = opts.supabase ?? db()
  let top: LibraryMatch | null = null
  try {
    const lib = opts.lib ?? inspirationDb()
    const matches = await libraryMatches(card, lib)
    const choice = chooseCover(card, matches, opts.threshold)
    top = matches.filter((m) => m.kind === 'photo').sort((a, b) => b.similarity - a.similarity)[0] ?? null
    if (opts.dryRun || choice.step === 'fallback' || choice.step === 'own') return { step: choice.step, top, cost_usd: 0 }

    if (choice.step === 'library') {
      const url = await copyLibraryPhoto(card.creator_id, card.id, choice.item.path, lib)
      await setCover(supabase, card, url, {
        provider: 'ivy_library', item_id: choice.item.id, caption: choice.item.caption, similarity: round(choice.item.similarity),
      })
      console.log(`[covers] card ${card.id}: Ivy library ${choice.item.path} (${choice.item.similarity.toFixed(3)})`)
      return { step: 'library', top, cost_usd: 0 }
    }

    const people = opts.people ?? (await peopleFor(supabase, card.creator_id, card.recording_id).catch(() => []))
    const subject = coverSubject(card, people)
    if (!subject) return { step: 'fallback', top, cost_usd: 0 }
    const log = (row: Record<string, unknown>) =>
      supabase.from('frame_generations').insert({
        creator_id: card.creator_id, card_id: card.id, kind: 'card', model: COVER_MODEL,
        brief_hash: createHash('sha256').update(subject.toLowerCase()).digest('hex'), ...row,
      }).then(({ error }) => error && console.error(`[covers] cost log for card ${card.id}: ${error.message}`))
    try {
      const jpeg = await generateCover(subject, choice.refs, lib)
      const url = await uploadBuffer({ bucket: 'frames', buffer: jpeg, path: coverPath(card.creator_id, card.id), contentType: 'image/jpeg' })
      await setCover(supabase, card, url, { provider: 'ivy_generated', model: COVER_MODEL, refs: choice.refs.map((r) => r.id), cost_usd: COVER_USD })
      await log({ status: 'done', frame_url: url, cost_usd: COVER_USD })
      console.log(`[covers] card ${card.id}: generated on ${COVER_MODEL} from ${choice.refs.length} refs, $${COVER_USD}`)
      return { step: 'generate', top, cost_usd: COVER_USD }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await log({ status: 'failed', error: message.slice(0, 2000) })
      throw err
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[covers] card ${card.id}: ${message}`)
    return { step: 'fallback', top, cost_usd: 0, error: message }
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** After a recording: every new card of it, before frames.ts and reference pictures (which then skip covered cards). */
export async function coversForRecording(creatorId: string, recordingId: string): Promise<void> {
  if (!coversEnabled()) return
  const supabase = db()
  const { data, error } = await supabase
    .from('cards')
    .select(COLUMNS)
    .eq('creator_id', creatorId)
    .eq('recording_id', recordingId)
    .eq('frame_status', 'none')
  if (error) throw new Error(`cards for ${recordingId}: ${error.message}`)
  const people = await peopleFor(supabase, creatorId, recordingId).catch(() => [])
  const lib = inspirationDb()
  for (const card of (data ?? []) as CoverCard[]) await coverCard(card, { supabase, lib, people })
}

// ─── Change cover (••• on the idea page) ────────────────────────────────────────────────────────────────────────

export interface CoverChoice {
  id: string
  url: string
  caption: string
  width: number | null
  height: number | null
  similarity: number
}

async function ownCard(supabase: SupabaseClient, creatorId: string, cardId: string): Promise<CoverCard | null> {
  const { data, error } = await supabase.from('cards').select(COLUMNS).eq('id', cardId).eq('creator_id', creatorId).maybeSingle()
  if (error) throw new Error(`card ${cardId}: ${error.message}`)
  return data as CoverCard | null
}

/** The top COVER_CHOICES library photos for her idea, signed for an hour. Null if it isn't her card. */
export async function coverChoices(creatorId: string, cardId: string, supabase: SupabaseClient = db()): Promise<CoverChoice[] | null> {
  const card = await ownCard(supabase, creatorId, cardId)
  if (!card) return null
  const lib = inspirationDb()
  const photos = (await libraryMatches(card, lib)).filter((m) => m.kind === 'photo').slice(0, COVER_CHOICES)
  if (photos.length === 0) return []
  const [{ data: rows }, { data: signed, error }] = await Promise.all([
    lib.from('inspiration_items').select('id, width, height').in('id', photos.map((p) => p.id)),
    lib.storage.from(INSPIRATION_BUCKET).createSignedUrls(photos.map((p) => p.path), 3600),
  ])
  if (error) throw new Error(`sign: ${error.message}`)
  const size = new Map((rows ?? []).map((r) => [r.id as string, r as { width: number | null; height: number | null }]))
  const urls = new Map(signed.map((s) => [s.path, s.signedUrl]))
  return photos
    .filter((p) => urls.get(p.path))
    .map((p) => ({ id: p.id, url: urls.get(p.path)!, caption: p.caption, width: size.get(p.id)?.width ?? null, height: size.get(p.id)?.height ?? null, similarity: round(p.similarity) }))
}

/** She picked one: it becomes the cover in place of Ivy's (b, c or d). Her own picture (a) is never swapped out. */
export async function chooseLibraryCover(creatorId: string, cardId: string, itemId: string, supabase: SupabaseClient = db()): Promise<'ok' | 'no-card' | 'no-item' | 'own'> {
  const card = await ownCard(supabase, creatorId, cardId)
  if (!card) return 'no-card'
  if (ownCover(card)) return 'own'
  const lib = inspirationDb()
  const { data: item, error } = await lib.from('inspiration_items').select('id, path, kind, caption').eq('id', itemId).maybeSingle()
  if (error) throw new Error(`item: ${error.message}`)
  if (!item || item.kind !== 'photo') return 'no-item'
  const [query] = await embed([coverQuery(card)], 'query')
  const { data: sim } = await lib.rpc('inspiration_search', { query_embedding: JSON.stringify(query), people_filter: null, match_count: 200 })
  const similarity = ((sim ?? []) as { id: string; similarity: number }[]).find((r) => r.id === itemId)?.similarity ?? 0
  const url = await copyLibraryPhoto(creatorId, cardId, item.path as string, lib)
  await setCover(supabase, card, url, { provider: 'ivy_library', item_id: itemId, caption: item.caption as string, similarity: round(similarity) })
  return 'ok'
}
