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
//
// Undoable: whenever the ladder or Change cover replaces a picture, what was there (frame_url, frame_status, frame_at,
// frame_attribution — the link, the credit, where it came from) is kept as frame_attribution.previous, one step back.
// ••• → Restore previous cover puts it back (restoreCover). A reference picture lives in its own column and is never
// touched, so it comes back by itself when the slot is restored.
//
// Step c is checked: a generated cover with visible writing or a brand mark (coverCheck.ts) is rejected and drawn
// once more; a second rejection leaves the idea at (d). Every draw is logged and paid for.

import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { embed } from './embed'
import { INSPIRATION_BUCKET, inspirationDb, type InspirationItem } from './inspiration'
import { peopleFor, stripPeople } from './redact'
import { uploadBuffer } from './storage'
import { checkLettering, type LetteringVerdict } from './coverCheck'

/** Step b's bar: the cosine similarity between the idea's words and a library photo's tags. 0.45 (Tim, 8 Nov): 0.30–0.43 matched the nearest Nothing/box picture, not a fitting one. */
export const LIBRARY_THRESHOLD = 0.45
/** The bar in use: COVER_LIBRARY_THRESHOLD on the server when set (tuning without a deploy), else LIBRARY_THRESHOLD. */
export function libraryThreshold(env: string | undefined = process.env.COVER_LIBRARY_THRESHOLD): number {
  const n = Number(env)
  return env && Number.isFinite(n) && n > 0 && n < 1 ? n : LIBRARY_THRESHOLD
}
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
/** What was in the frame slot before the ladder or Change cover replaced it. */
export interface CoverSnapshot {
  frame_url: string | null
  frame_status: string
  frame_at: string | null
  frame_attribution: Record<string, unknown> | null
  /** Set when the snapshot was rebuilt rather than kept (a backfill made before covers were undoable). */
  refound?: boolean
}
export interface LibraryAttribution {
  provider: 'ivy_library'
  item_id: string
  caption: string
  similarity: number
  previous?: CoverSnapshot
}
export interface GeneratedAttribution {
  provider: 'ivy_generated'
  model: string
  refs: string[]
  cost_usd: number
  /** Draws it took (2 when the first had lettering). */
  attempts?: number
  previous?: CoverSnapshot
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
export function chooseCover(card: Pick<CoverCard, 'source'>, matches: LibraryMatch[], threshold = libraryThreshold()): CoverStep {
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
    'Keep the idea’s subject; take only light, palette and material from the references — not their objects, products, layout or framing.',
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
/** A frames path the ladder owns (a cover it made, or a reference copy) — the only files it may delete. */
export function ladderFile(frameUrl: string | null | undefined): string | null {
  const marker = '/storage/v1/object/public/frames/'
  const i = frameUrl?.indexOf(marker) ?? -1
  if (!frameUrl || i < 0) return null
  const path = decodeURIComponent(frameUrl.slice(i + marker.length).split('?')[0])
  return /^[^/]+\/covers\//.test(path) ? path : null
}

type Slot = { frame_url: string | null; frame_status: string; frame_at: string | null; frame_attribution: (Record<string, unknown> & { previous?: CoverSnapshot }) | null }
const SLOT = 'frame_url, frame_status, frame_at, frame_attribution'

/** The slot as it is, without its own history: one step back is kept, never a chain. */
export function snapshot(slot: Slot): CoverSnapshot {
  const { previous: _drop, ...attribution } = slot.frame_attribution ?? {}
  return {
    frame_url: slot.frame_url,
    frame_status: slot.frame_status,
    frame_at: slot.frame_at,
    frame_attribution: slot.frame_attribution ? attribution : null,
  }
}

/**
 * The files a replacement leaves unused: the step that falls out of history (the old previous), unless it is still
 * the picture now or the one just set. The picture being replaced is kept — it is now the previous.
 */
export function droppedFiles(before: Slot, newUrl: string): string[] {
  const old = before.frame_attribution?.previous?.frame_url ?? null
  if (!old || old === before.frame_url || old === newUrl) return []
  const path = ladderFile(old)
  return path ? [path] : []
}

async function removeFiles(supabase: SupabaseClient, paths: string[]) {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from('frames').remove(paths)
  if (error) console.error(`[covers] remove ${paths.join(', ')}: ${error.message}`)
}

async function setCover(supabase: SupabaseClient, card: CoverCard, url: string, attribution: LibraryAttribution | GeneratedAttribution) {
  const { data: before, error: readError } = await supabase.from('cards').select(SLOT).eq('id', card.id).single()
  if (readError || !before) throw new Error(`card ${card.id}: ${readError?.message ?? 'missing'}`)
  const { error } = await supabase
    .from('cards')
    .update({ frame_url: url, frame_status: 'done', frame_at: new Date().toISOString(), frame_attribution: { ...attribution, previous: snapshot(before as Slot) } })
    .eq('id', card.id)
    .eq('creator_id', card.creator_id)
  if (error) throw new Error(`card ${card.id}: ${error.message}`)
  await removeFiles(supabase, droppedFiles(before as Slot, url))
}

/**
 * ••• → Restore previous cover: the previous picture goes back in the slot; the one it replaced is let go (its file
 * too, if the ladder made it). One step: after a restore there is nothing further back.
 */
export async function restoreCover(creatorId: string, cardId: string, supabase: SupabaseClient = db()): Promise<'ok' | 'no-card' | 'none'> {
  const { data: card, error } = await supabase.from('cards').select(`id, ${SLOT}`).eq('id', cardId).eq('creator_id', creatorId).maybeSingle()
  if (error) throw new Error(`card ${cardId}: ${error.message}`)
  if (!card) return 'no-card'
  const prev = (card as Slot).frame_attribution?.previous
  if (!prev) return 'none'
  const { error: upError } = await supabase
    .from('cards')
    .update({ frame_url: prev.frame_url, frame_status: prev.frame_status, frame_at: prev.frame_at, frame_attribution: prev.frame_attribution })
    .eq('id', cardId)
    .eq('creator_id', creatorId)
  if (upError) throw new Error(`card ${cardId}: ${upError.message}`)
  const current = ladderFile((card as Slot).frame_url)
  if (current && (card as Slot).frame_url !== prev.frame_url) await removeFiles(supabase, [current])
  return 'ok'
}

export interface CoverOutcome {
  step: CoverStep['step']
  top: LibraryMatch | null
  cost_usd: number
  /** What the lettering check saw on draws it rejected. */
  rejected?: string[]
  error?: string
}

/** Step c draws at most this many times: the first, and one retry if it shows lettering. */
export const DRAWS = 2

/**
 * Draw, check, and draw once more if the check finds lettering. Every draw is paid for (COVER_USD), kept or not.
 * Returns the first clean picture, or null after DRAWS rejections.
 */
export async function drawChecked(
  draw: () => Promise<Buffer>,
  check: (jpeg: Buffer) => Promise<LetteringVerdict>,
  onReject: (what: string, attempt: number) => Promise<void> = async () => {}
): Promise<{ jpeg: Buffer | null; attempts: number; spent: number; rejected: string[] }> {
  const rejected: string[] = []
  let spent = 0
  for (let attempt = 1; attempt <= DRAWS; attempt++) {
    const jpeg = await draw()
    spent += COVER_USD
    const verdict = await check(jpeg)
    if (!verdict.lettering) return { jpeg, attempts: attempt, spent, rejected }
    rejected.push(verdict.what || 'lettering')
    await onReject(verdict.what || 'lettering', attempt)
  }
  return { jpeg: null, attempts: DRAWS, spent, rejected }
}
const round4 = (n: number) => Math.round(n * 10000) / 10000

/**
 * Run the ladder for one card and write the result. `dryRun` decides and reports without writing or spending.
 * Never throws: a failure at b or c leaves the card for (d).
 */
export async function coverCard(
  card: CoverCard,
  opts: {
    supabase?: SupabaseClient
    lib?: SupabaseClient
    people?: string[]
    threshold?: number
    dryRun?: boolean
    /** Draw step c whatever the library scores (a regeneration). */
    forceGenerate?: boolean
    /** The lettering check (tests replace it). */
    check?: (jpeg: Buffer) => Promise<LetteringVerdict>
  } = {}
): Promise<CoverOutcome> {
  if (ownCover(card)) return { step: 'own', top: null, cost_usd: 0 }
  const supabase = opts.supabase ?? db()
  let top: LibraryMatch | null = null
  try {
    const lib = opts.lib ?? inspirationDb()
    const matches = await libraryMatches(card, lib)
    const ladder = chooseCover(card, matches, opts.threshold)
    const photos = matches.filter((m) => m.kind === 'photo').sort((a, b) => b.similarity - a.similarity)
    const choice: CoverStep = opts.forceGenerate && !ownCover(card) && photos.length ? { step: 'generate', refs: photos.slice(0, STYLE_REFS) } : ladder
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
    const drawn = await drawChecked(
      async () => {
        try {
          return await generateCover(subject, choice.refs, lib)
        } catch (err) {
          await log({ status: 'failed', error: (err instanceof Error ? err.message : String(err)).slice(0, 2000) })
          throw err
        }
      },
      async (jpeg) =>
        (opts.check ?? checkLettering)(jpeg).catch((err): LetteringVerdict => {
          // The check couldn't run: keep the cover rather than lose it, and say so.
          console.warn(`[covers] card ${card.id}: lettering check failed (${err instanceof Error ? err.message : err}); kept`)
          return { lettering: false, what: '' }
        }),
      async (what, attempt) => {
        await log({ status: 'failed', cost_usd: COVER_USD, error: `rejected: lettering (${what})`.slice(0, 2000) })
        console.log(`[covers] card ${card.id}: draw ${attempt} rejected — ${what}`)
      }
    )
    if (!drawn.jpeg) {
      return { step: 'fallback', top, cost_usd: drawn.spent, rejected: drawn.rejected, error: `lettering in ${DRAWS} draws: ${drawn.rejected.join('; ')}` }
    }
    const url = await uploadBuffer({ bucket: 'frames', buffer: drawn.jpeg, path: coverPath(card.creator_id, card.id), contentType: 'image/jpeg' })
    await setCover(supabase, card, url, { provider: 'ivy_generated', model: COVER_MODEL, refs: choice.refs.map((r) => r.id), cost_usd: round4(drawn.spent), attempts: drawn.attempts })
    await log({ status: 'done', frame_url: url, cost_usd: COVER_USD })
    console.log(`[covers] card ${card.id}: generated on ${COVER_MODEL} from ${choice.refs.length} refs in ${drawn.attempts} draw(s), $${drawn.spent.toFixed(4)}`)
    return { step: 'generate', top, cost_usd: drawn.spent, ...(drawn.rejected.length ? { rejected: drawn.rejected } : {}) }
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

// ─── Repairs for covers set before they were undoable ───────────────────────────────────────────────────────────

/**
 * What a ladder cover with no previous most likely replaced, for covers set before covers kept one (the B.12 backfill,
 * 8 Nov). A photo card with no reference picture had an Unsplash photo: it is searched again with the same words and
 * palette (Unsplash ranks the same query the same way, so it is usually the same photo; marked refound). Anything else
 * had no picture of its own in the slot — its reference picture or hue showed — so the slot is put back empty.
 */
export async function rebuildPrevious(
  creatorId: string,
  opts: { supabase?: SupabaseClient; search?: (query: string, palette: string[]) => Promise<{ url: string; attribution: Record<string, unknown> } | null> } = {}
): Promise<{ rebuilt: number; refound: string[]; empty: number }> {
  const supabase = opts.supabase ?? db()
  const search = opts.search ?? (await import('./unsplash')).searchPhoto
  const { data, error } = await supabase
    .from('cards')
    .select(`id, title, shape, visual_query, reference_picture, ${SLOT}`)
    .eq('creator_id', creatorId)
    .in('frame_attribution->>provider', ['ivy_library', 'ivy_generated'])
  if (error) throw new Error(`cards: ${error.message}`)
  const { data: pack } = await supabase.from('style_packs').select('palette').eq('creator_id', creatorId).maybeSingle()
  const palette = (pack?.palette as string[] | undefined) ?? []
  const out = { rebuilt: 0, refound: [] as string[], empty: 0 }
  for (const c of (data ?? []) as (Slot & { id: string; title: string; shape: string | null; visual_query: string | null; reference_picture: unknown })[]) {
    if (c.frame_attribution?.previous) continue
    let previous: CoverSnapshot = { frame_url: null, frame_status: c.shape ? 'typographic' : 'none', frame_at: null, frame_attribution: null }
    if (c.shape === 'photo' && !c.reference_picture && c.visual_query?.trim()) {
      const photo = await search(c.visual_query.trim(), palette)
      if (photo) {
        previous = { frame_url: photo.url, frame_status: 'done', frame_at: null, frame_attribution: photo.attribution, refound: true }
        out.refound.push(c.title)
      }
    }
    if (!previous.frame_url) out.empty++
    const { error: upError } = await supabase
      .from('cards')
      .update({ frame_attribution: { ...c.frame_attribution, previous } })
      .eq('id', c.id)
      .eq('creator_id', creatorId)
    if (upError) throw new Error(`card ${c.id}: ${upError.message}`)
    out.rebuilt++
  }
  return out
}
