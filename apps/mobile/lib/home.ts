// apps/mobile/lib/home.ts
// Home (P1): cards and to-dos in one feed, newest first by when they were said (recordings.recorded_at), grouped by
// the creator's local day, filtered by a project chip. Plus Ivy on open: at most three sentences, composed from the
// graph and never stored (rule 2 — each sentence keeps what it's about, recording + time, in `cites`).
// Pure functions below the loader so the grouping and wording can be tested without a device.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardBoard, CardDiagram, CardQuote, CardShape } from '@ivywolf/schema'
import type { HueName } from '@ivywolf/ui'
import { requestProcessing } from './record'
import { loadLinks, withLinks, type Links } from './links'
import { resolvePicture, type OwnPicture, type Picture, type ReferencePicture } from './picture'

export interface Project {
  id: string
  name: string
  kind: 'things' | 'mini' | 'user'
  /** Its flat hue (0039, Home v4): an idea's block while a picture is found, the chip's underline, its swatch. */
  hue: HueName
}

interface Base {
  id: string
  recordingId: string | null
  projectId: string
  frameUrl: string | null
  frameStatus: 'none' | 'queued' | 'done' | 'typographic' | 'failed'
  frameAt: string | null
  /** When it was said: the recording's recorded_at, else when the row was made. */
  at: string
}
export type ThreadStage = 'sparked' | 'developing' | 'ready' | 'shipped'

/** Unsplash credit (0033 frame_attribution): "Photo by <photographer> on Unsplash", both linking back with utm. */
export interface PhotoCredit {
  photographer: string
  photographerUrl: string
  photoUrl: string
}

export interface CardItem extends Base {
  kind: 'card'
  title: string
  gist: string
  playFromMs: number
  confidence: number
  storagePath: string | null
  threadSize: number
  /** Added through the Muse connector (recordings.source 'muse', 0026): the tile says "via Muse". */
  viaMuse: boolean
  /** The form it takes (Figma 227:5). Cards from before shapes: photo while a frame is (or may be) coming, else text. */
  shape: CardShape
  quote: CardQuote | null
  diagram: CardDiagram | null
  board: CardBoard | null
  credit: PhotoCredit | null
  /** What it shows (Home v4): her own picture or take, its Unsplash photo, its reference, or its project's hue. */
  picture: Picture
  /** recordings.source — where it was said, for the quote's ▶ chip ("Mini · 12:40"). */
  recordingSource: string | null
  /** Its thread's stage — a board card's status pill. */
  threadStage: ThreadStage | null
  /** When the card landed (cards.created_at) — "new since she last looked" for Ivy's line. */
  createdAt?: string
  /** Its project's hue and name. Null where the project wasn't read. */
  hue: HueName | null
  projectName: string | null
  /** Pin to top (0034): pinned cards sit in the Pinned row, newest pin first. */
  pinnedAt: string | null
  /** Copy link made its public page (0034); null = private. */
  sharedAt: string | null
  /** Like on the hold arc is the idea page's heart (0019). */
  heartedAt: string | null
  /** How many ideas it's linked to (card_links, 0034). Filled in by the screen's loader. */
  links: number
}
export interface ActionItem extends Base {
  kind: 'action'
  text: string
  done: boolean
  dueDate: string | null
}
export type Item = CardItem | ActionItem

export interface Thread {
  id: string
  title: string
  returnCount: number
  cardIds: string[]
}

export interface FailedRecording {
  id: string
  storage_path: string | null
  received_at: string
  duration_ms: number | null
}

export interface HomeData {
  projects: Project[]
  items: Item[]
  /** Every link between her ideas, both ways (card_links, 0034). */
  links: Links
  threads: Thread[]
  /** Recordings Ivy is still working on — Home keeps polling while there are any. */
  inFlight: number
  /** Queued > 30 s and never claimed: the process request didn't arrive. Home asks again. */
  stuck: string[]
  /** Recordings Ivy couldn't process (errors, or swept after timing out — 0020): retry or delete, never a spinner. */
  failed: FailedRecording[]
  lastOpenedAt: string | null
}

/** A thread she's come back to this many times is worth a line from Ivy (Ivy on open, My things). */
export const COMEBACK = 3

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

// ── Cards: one select and one mapper for Home, a project, and search ────────────────────────────────────────────

/** The columns every card tile needs. Callers add their own thread embedding (for size and stage). */
export const CARD_COLUMNS =
  'id, recording_id, project_id, title, gist, play_from_ms, confidence, frame_url, frame_status, frame_at, created_at, source, shape, quote, diagram, board, frame_attribution, reference_picture, pinned_at, shared_at, hearted_at, recordings(recorded_at, storage_path, source), projects(name, hue)'

export type CardRow = {
  id: string; recording_id: string; project_id: string; title: string; gist: string; play_from_ms: number
  confidence: number; frame_url: string | null; frame_status: Base['frameStatus']; frame_at: string | null
  created_at: string; source?: string | null; shape: CardShape | null; quote: CardQuote | null; diagram: CardDiagram | null; board: CardBoard | null
  frame_attribution: { provider?: string; photographer?: string; photographer_url?: string; photo_url?: string } | null
  reference_picture?: ReferencePicture | null
  recordings: { recorded_at: string | null; storage_path?: string | null; source?: string } | null
  pinned_at?: string | null
  shared_at?: string | null
  hearted_at?: string | null
  projects?: { name: string; hue?: HueName | null; id?: string; kind?: string } | null
}

/**
 * The only pictures a card shows (Job I): an Unsplash photo with its credit, or her own picture (an import). Anything
 * else in frame_url — the fal frames drawn for cards before Job B, a pinned suggestion's preview — is not shown; the
 * card falls back to its reference picture or its project hue (lib/picture.ts).
 */
export function cardPicture(r: Pick<CardRow, 'frame_url' | 'frame_status' | 'frame_attribution'> & { source?: string | null }): string | null {
  if (r.frame_status !== 'done' || !r.frame_url) return null
  const a = r.frame_attribution
  if (a?.provider === 'unsplash' && a.photographer && a.photographer_url && a.photo_url) return r.frame_url
  return r.source === 'import' ? r.frame_url : null
}

/** A card made before shapes (0033) has none: photo while its photo is coming or there, else text. */
export function shapeOf(r: Pick<CardRow, 'shape' | 'frame_status' | 'frame_url' | 'frame_attribution'> & { source?: string | null }): CardShape {
  if (r.shape) return r.shape
  if (r.frame_status === 'done') return cardPicture(r) ? 'photo' : 'text'
  return r.frame_status === 'none' || r.frame_status === 'queued' ? 'photo' : 'text'
}

const unsplashOf = (a: CardRow['frame_attribution']): PhotoCredit | null =>
  a?.provider === 'unsplash' && a.photographer && a.photographer_url && a.photo_url
    ? { photographer: a.photographer, photographerUrl: a.photographer_url, photoUrl: a.photo_url }
    : null

/**
 * @param own her pictures and takes for this card (loadOwnPictures); an import's picture is added here.
 */
export function toCardItem(c: CardRow, thread: { size: number; stage: ThreadStage | null } = { size: 1, stage: null }, own: OwnPicture[] = []): CardItem {
  const credit = unsplashOf(c.frame_attribution)
  const frame = cardPicture(c)
  const imported: OwnPicture[] = frame && !credit ? [{ uri: frame, kind: 'image', at: c.frame_at ?? c.created_at, from: 'context' }] : []
  return {
    kind: 'card',
    id: c.id,
    recordingId: c.recording_id,
    projectId: c.project_id,
    title: c.title,
    gist: c.gist,
    playFromMs: c.play_from_ms,
    confidence: c.confidence,
    frameUrl: cardPicture(c),
    frameStatus: c.frame_status,
    frameAt: c.frame_at,
    at: c.recordings?.recorded_at ?? c.created_at,
    storagePath: c.recordings?.storage_path ?? null,
    threadSize: thread.size,
    viaMuse: c.recordings?.source === 'muse',
    shape: shapeOf(c),
    quote: c.quote,
    diagram: c.diagram,
    board: c.board,
    credit,
    picture: resolvePicture({
      own: [...imported, ...own],
      unsplash: credit && frame ? { url: frame, ...credit } : null,
      reference: c.reference_picture ?? null,
    }),
    recordingSource: c.recordings?.source ?? null,
    threadStage: thread.stage,
    createdAt: c.created_at,
    hue: c.projects?.hue ?? null,
    projectName: c.projects?.name ?? null,
    pinnedAt: c.pinned_at ?? null,
    sharedAt: c.shared_at ?? null,
    heartedAt: c.hearted_at ?? null,
    links: 0,
  }
}

/**
 * Her own pictures for these cards (rule 1's first place): images she added with Add context for the idea (role idea
 * or both, never style alone), signed from the private bucket for an hour; and the Create flow's takes
 * (generation_runs that completed into our storage). Best-effort: if either read fails, those cards fall to the next
 * picture.
 */
export async function loadOwnPictures(supabase: SupabaseClient, cardIds: string[]): Promise<Map<string, OwnPicture[]>> {
  const out = new Map<string, OwnPicture[]>()
  if (cardIds.length === 0) return out
  const add = (id: string, p: OwnPicture) => out.set(id, [...(out.get(id) ?? []), p])
  const [context, runs] = await Promise.all([
    supabase.from('card_context').select('card_id, url, meta, created_at').eq('kind', 'image').in('card_id', cardIds),
    supabase
      .from('generation_runs')
      .select('card_id, kind, output_url, completed_at, created_at')
      .eq('status', 'completed')
      .not('output_url', 'is', null)
      .in('card_id', cardIds),
  ])
  type ContextRow = { card_id: string; url: string | null; meta: { role?: string } | null; created_at: string }
  const images = ((context.data ?? []) as ContextRow[]).filter((r) => r.url && (r.meta?.role ?? 'idea') !== 'style')
  if (images.length) {
    const { data: signed } = await supabase.storage.from('context').createSignedUrls(images.map((r) => r.url!), 3600)
    const byPath = new Map((signed ?? []).filter((x) => x.signedUrl && x.path).map((x) => [x.path!, x.signedUrl]))
    for (const r of images) {
      const uri = byPath.get(r.url!)
      if (uri) add(r.card_id, { uri, kind: 'image', at: r.created_at, from: 'context' })
    }
  }
  type RunRow = { card_id: string; kind: 'image' | 'video'; output_url: string; completed_at: string | null; created_at: string }
  for (const r of (runs.data ?? []) as RunRow[]) add(r.card_id, { uri: r.output_url, kind: r.kind, at: r.completed_at ?? r.created_at, from: 'created' })
  return out
}

const LIMIT = 300
const STUCK_MS = 30_000

export async function loadHome(supabase: SupabaseClient, userId: string): Promise<HomeData> {
  const [projects, cards, actions, threads, inFlight, creator] = await Promise.all([
    supabase.from('projects').select('id, name, kind, hue').order('is_default', { ascending: false }).order('created_at'),
    supabase
      .from('cards')
      .select(CARD_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    supabase
      .from('actions')
      .select('id, recording_id, project_id, text, done, due_date, frame_url, frame_status, frame_at, created_at, recordings(recorded_at)')
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    supabase.from('threads').select('id, title, return_count, stage, thread_cards(card_id)'),
    supabase.from('recordings').select('id, status, received_at').in('status', ['queued', 'processing']).is('discarded_at', null),
    supabase.from('creators').select('last_opened_at').eq('id', userId).maybeSingle(),
  ])
  const links = await loadLinks(supabase)
  const failed = need(
    'failed',
    await supabase
      .from('recordings')
      .select('id, storage_path, received_at, duration_ms')
      .eq('status', 'failed')
      .is('discarded_at', null)
      .order('received_at', { ascending: false })
      .limit(20)
  ) as FailedRecording[]

  const threadRows = need('threads', threads) as unknown as {
    id: string
    title: string
    return_count: number
    stage: ThreadStage
    thread_cards: { card_id: string }[]
  }[]
  const threadOf = new Map<string, { size: number; stage: ThreadStage }>()
  for (const t of threadRows) for (const tc of t.thread_cards) threadOf.set(tc.card_id, { size: t.thread_cards.length, stage: t.stage })

  type Rec = { recorded_at: string | null; storage_path?: string | null; source?: string } | null
  const cardRows = need('cards', cards) as unknown as CardRow[]
  const own = await loadOwnPictures(supabase, cardRows.map((c) => c.id))
  const actionRows = need('actions', actions) as unknown as {
    id: string; recording_id: string | null; project_id: string; text: string; done: boolean; due_date: string | null
    frame_url: string | null; frame_status: Base['frameStatus']; frame_at: string | null; created_at: string; recordings: Rec
  }[]

  const items: Item[] = [
    ...cardRows.map((c) => withLinks(toCardItem(c, threadOf.get(c.id) ?? { size: 1, stage: null }, own.get(c.id)), links)),
    ...actionRows.map((a): ActionItem => ({
      kind: 'action',
      id: a.id,
      recordingId: a.recording_id,
      projectId: a.project_id,
      text: a.text,
      done: a.done,
      dueDate: a.due_date,
      frameUrl: a.frame_url,
      frameStatus: a.frame_status,
      frameAt: a.frame_at,
      at: a.recordings?.recorded_at ?? a.created_at,
    })),
  ].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))

  return {
    projects: need('projects', projects) as Project[],
    items,
    links,
    threads: threadRows.map((t) => ({ id: t.id, title: t.title, returnCount: t.return_count, cardIds: t.thread_cards.map((tc) => tc.card_id) })),
    inFlight: (need('recordings', inFlight) ?? []).length,
    stuck: ((need('recordings', inFlight) ?? []) as { id: string; status: string; received_at: string }[])
      .filter((r) => r.status === 'queued' && Date.now() - new Date(r.received_at).getTime() > STUCK_MS)
      .map((r) => r.id),
    failed,
    lastOpenedAt: (need('creator', creator) as { last_opened_at: string | null } | null)?.last_opened_at ?? null,
  }
}

/** Home was opened: what's "new" next time is measured from now. */
/**
 * Her last look (Job I): creators.last_opened_at moves to the newest card she has had on screen — never "now", and
 * never backwards — so a card that lands after she looked is still new next time. Home calls it only while focused.
 */
export async function markSeen(supabase: SupabaseClient, userId: string, items: Item[]) {
  const newest = items.reduce<string | null>((m, i) => (i.kind === 'card' && (!m || (i.createdAt ?? i.at) > m) ? (i.createdAt ?? i.at) : m), null)
  if (!newest) return
  await supabase.from('creators').update({ last_opened_at: newest }).eq('id', userId).or(`last_opened_at.is.null,last_opened_at.lt.${newest}`)
}

// ── My things row ───────────────────────────────────────────────────────────────────────────────────────────────

export interface ThingsRow {
  /** "3 today": her open to-dos due today, overdue, or with no date — what's on her plate now. */
  today: number
  /** The first three of them, oldest first: "milk · visa · wipes". */
  first: string[]
}

/**
 * My things leaves the feed (Home v4, Row/My things 1737:129): one row at the top of Home instead of to-do tiles. Null
 * when she has no open to-dos, so the row isn't drawn.
 */
export function thingsRow(items: Item[], now = new Date()): ThingsRow | null {
  const today = localDay(now.toISOString())
  const open = items
    .filter((i): i is ActionItem => i.kind === 'action' && !i.done)
    .filter((a) => !a.dueDate || a.dueDate <= today)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  if (!items.some((i) => i.kind === 'action' && !i.done)) return null
  return { today: open.length, first: open.slice(0, 3).map((a) => a.text) }
}

/** "3 today · milk · visa · wipes" — or, with nothing due yet, how many are open. */
export function thingsLine(row: ThingsRow, open: number): string {
  if (row.today === 0) return `${open} open`
  return [`${row.today} today`, ...row.first].join(' · ')
}

/**
 * Where an idea appears (decks, Figma 1742:2): its own project, and the project of every idea it's linked to. Derived
 * from card_links — project_id never changes. To-dos are never linked, so they appear only where they are.
 */
export function appearsIn(card: Item, links: Links | undefined, projectOf: Map<string, string>): Set<string> {
  const out = new Set([card.projectId])
  if (card.kind !== 'card') return out
  for (const id of links?.get(card.id) ?? []) {
    const p = projectOf.get(id)
    if (p) out.add(p)
  }
  return out
}

/**
 * The feed is ideas only: to-dos live in the My things row and its room. Under a project chip, an idea shows if it
 * appears in that project (its own, or linked into it); under All each idea shows once.
 */
export function feedItems(items: Item[], project: string | null, links?: Links): CardItem[] {
  const cards = items.filter((i): i is CardItem => i.kind === 'card')
  if (project === null) return cards
  const projectOf = new Map(cards.map((c) => [c.id, c.projectId]))
  return cards.filter((c) => appearsIn(c, links, projectOf).has(project))
}

/** Max cards a deck shows at once: the top card and one peeking. */
export const DECK_VISIBLE = 2

/**
 * A deck (1742:2): an idea with at least one link, over the ideas it's linked to — the pages a swipe goes through,
 * newest first. Errands never deck. Only linked ideas that are loaded can be paged to.
 */
export function deckOf(card: Item, links: Links | undefined, byId: Map<string, Item>): CardItem[] {
  if (card.kind !== 'card') return []
  return [...(links?.get(card.id) ?? [])]
    .map((id) => byId.get(id))
    .filter((c): c is CardItem => !!c && c.kind === 'card')
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

// ── Days ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** YYYY-MM-DD of an instant in the device's zone. */
export function localDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** Divider label: none for today (the top of Home is always "now"), then YESTERDAY, a weekday, or "12 SEP". */
export function dayLabel(day: string, now = new Date()): string | null {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today.getTime() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'TODAY' // L3b (Figma 209:2) labels today too
  if (days === 1) return 'YESTERDAY'
  if (days < 7) return WEEKDAYS[date.getDay()]
  return `${d} ${MONTHS[m - 1]}${y !== now.getFullYear() ? ` ${y}` : ''}`
}

export interface DayGroup {
  day: string
  label: string | null
  items: Item[]
}

export function groupByDay(items: Item[], now = new Date()): DayGroup[] {
  const groups: DayGroup[] = []
  for (const item of items) {
    const day = localDay(item.at)
    let g = groups[groups.length - 1]
    if (!g || g.day !== day) {
      g = { day, label: dayLabel(day, now), items: [] }
      groups.push(g)
    }
    g.items.push(item)
  }
  return groups
}

// ── Masonry ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Home v4's grid (Figma 1737:5) — measured, not tokens (no variables are bound in the v4 frames): columns 170 at 393,
 * gutter 13, margins 20, corners 16. Under each picture: 8, the title (Semibold 13, line 16, two lines at most), 3,
 * the meta (Regular 11, line 13), then 18 to the next tile.
 */
export const GRID = { gutter: 13, margin: 20, corner: 16, titleGap: 8, title: 13, titleLine: 16, metaGap: 3, meta: 11, metaLine: 13, after: 18 } as const

/** Small stable number from an id, so a tile keeps its height across renders and refreshes. */
function jitter(id: string, spread: number): number {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return (Math.abs(h) % (2 * spread + 1)) - spread
}

/**
 * A picture's height. v4 (1737:5) runs its pictures 120–214 tall at 170 wide; a stable jitter per id gives the
 * Pinterest rhythm, whether the picture has landed or it's still the hue block.
 */
const IDEA_H = 170
const IDEA_SPREAD = 45
export function tileHeight(id: string): number {
  return IDEA_H + jitter(id, IDEA_SPREAD)
}
export const frameHeight = (item: Item): number => tileHeight(item.id)
/** A text card on the idea page's face stands 40 shorter than a picture, so the two kinds don't line up. */
export const textMinHeight = (id: string): number => tileHeight(id) - 40

/** About how many characters of Semibold 13 fit a 162-wide line (1737:134). */
const TITLE_CHARS = 24
/** The title's lines under a picture: one or two. A quote's words are on its picture, so it has none. */
export function titleLines(item: CardItem): number {
  if (item.shape === 'quote' && item.quote && item.picture.source !== 'hue') return 0
  if (item.picture.source === 'hue') return 0 // the hue block carries the title itself (1737:140)
  return item.title.length > TITLE_CHARS ? 2 : 1
}

/** Under a picture: the title's lines with the 8 above them, the meta with its 3, and the 18 to the next tile. */
export function captionHeight(item: CardItem): number {
  const lines = titleLines(item)
  return (lines ? GRID.titleGap + lines * GRID.titleLine + GRID.metaGap : GRID.titleGap) + GRID.metaLine + GRID.after
}

const TODO_ESTIMATE = 100 // L3b 209:17 / 209:24: 96–100 for two lines of title and the meta
/** A tile's full height in its column — picture and caption, the gap to the next included. */
export function estimateHeight(item: Item): number {
  if (item.kind === 'action') return TODO_ESTIMATE + GRID.after
  return frameHeight(item) + captionHeight(item)
}

/**
 * Two columns, each tile into the shorter one — the Pinterest fill. Order within a day is kept top-down.
 * `height` is a tile's full height in the column, the gap under it included.
 */
export function masonry<T extends Item>(items: T[], height: (item: T) => number = estimateHeight): [T[], T[]] {
  const cols: [T[], T[]] = [[], []]
  const heights = [0, 0]
  for (const item of items) {
    const c = heights[0] <= heights[1] ? 0 : 1
    cols[c].push(item)
    heights[c] += height(item)
  }
  return cols
}

// ── Ivy on open ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface IvySentence {
  text: string
  /** Rule 2: what the sentence is about — every sentence comes from the graph. */
  cites: { recordingId: string | null; ms: number }[]
  /** The cite shown after the line (Figma 162:2 "· Thu 0:31"), and what tapping the line plays. */
  cite?: { label: string; storagePath: string | null; ms: number }
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const count = (n: number) => WORDS[n] ?? String(n)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "Thu 0:31" — the day it was said and where in the recording (L4b's meta, 162:2's cite). */
export function citeLabel(at: string, ms: number | null): string {
  const day = WEEK[new Date(at).getDay()].slice(0, 3)
  return ms === null ? day : `${day} ${clock(ms)}`
}
const citeOf = (c: CardItem): IvySentence['cite'] => ({ label: citeLabel(c.at, c.playFromMs), storagePath: c.storagePath, ms: c.playFromMs })

/** How a new card is named in Ivy's line (Figma 227:14): "a quote", "a comparison", "the board is ready". */
const SHAPE_WORDS: Record<CardItem['shape'], [string, string]> = {
  quote: ['a quote', 'quotes'],
  diagram: ['a comparison', 'comparisons'],
  photo: ['a photo', 'photos'],
  board: ['a board', 'boards'],
  text: ['an idea', 'ideas'],
}
const ORDER: CardItem['shape'][] = ['quote', 'diagram', 'photo', 'text', 'board']
/** Where the new cards came from, when they all came from one place: "From your Mini: …". */
const FROM: Record<string, string> = { mini: 'From your Mini', note_taker: 'From the note taker', muse: 'From Muse', dji_import: 'From the import' }

/** "a", "a and b", "a, b, and c". */
const list = (parts: string[]) =>
  parts.length < 2 ? parts.join('') : parts.length === 2 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`

/**
 * The cards said since she last opened Home, named by the form each took (Figma 227:5: "From the drive: a quote, a
 * comparison, and the board is ready."). A board whose thread is ready says so. Null when nothing is new.
 */
export function newShapesSentence(cards: CardItem[]): IvySentence | null {
  if (cards.length === 0) return null
  const parts: string[] = []
  for (const shape of ORDER) {
    const of = cards.filter((c) => c.shape === shape)
    if (shape === 'board') {
      const ready = of.filter((c) => c.threadStage === 'ready')
      const rest = of.length - ready.length
      if (rest === 1) parts.push('a board')
      else if (rest > 1) parts.push(`${count(rest)} boards`)
      if (ready.length === 1) parts.push('the board is ready')
      else if (ready.length > 1) parts.push(`${count(ready.length)} boards are ready`)
      continue
    }
    if (of.length === 1) parts.push(SHAPE_WORDS[shape][0])
    else if (of.length > 1) parts.push(`${count(of.length)} ${SHAPE_WORDS[shape][1]}`)
  }
  const sources = new Set(cards.map((c) => c.recordingSource))
  const from = sources.size === 1 ? FROM[[...sources][0] ?? ''] : undefined
  const body = list(parts)
  const newest = [...cards].sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  return {
    text: from ? `${from}: ${body}.` : `${cap(body)}.`,
    cites: cards.map((c) => ({ recordingId: c.recordingId, ms: c.playFromMs })),
    cite: citeOf(newest),
  }
}

/**
 * Ivy on open (rule 2, Job I): one line, only when something changed since her last look — her first look (no
 * last_opened_at yet: her newest recording's cards), or the cards that landed since. Otherwise she stays silent.
 */
export function ivyOnOpen(data: HomeData): IvySentence[] {
  const cards = data.items.filter((i): i is CardItem => i.kind === 'card')
  if (cards.length === 0) return []
  const since = data.lastOpenedAt
  const landed = (c: CardItem) => c.createdAt ?? c.at
  let said: CardItem[]
  if (!since) {
    const newest = cards.reduce((a, b) => (landed(b) > landed(a) ? b : a))
    said = cards.filter((c) => c.recordingId === newest.recordingId)
  } else {
    said = cards.filter((c) => landed(c) > since)
  }
  const line = newShapesSentence(said)
  return line ? [line] : []
}

/** Meta line under a tile: "0:31 · Launch video", "0:31 · 2 cards", "My things · Thu", "My things · done". */
export function metaLine(item: Item, projects: Project[]): string {
  const project = projects.find((p) => p.id === item.projectId)
  if (item.kind === 'action') {
    const when = item.done ? 'done' : item.dueDate ? WEEK[new Date(`${item.dueDate}T12:00:00`).getDay()].slice(0, 3) : null
    return [project?.name ?? 'My things', when].filter(Boolean).join(' · ')
  }
  const s = Math.floor(item.playFromMs / 1000)
  const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const where = project && project.kind === 'user' ? project.name : item.threadSize > 1 ? `${item.threadSize} cards` : null
  return [time, where].filter(Boolean).join(' · ')
}

/** Retry a failed recording: clear the failed run's partial writes and queue it (0020), then ask for processing. */
export async function retryRecording(supabase: SupabaseClient, recordingId: string, token: string) {
  const { data, error } = await supabase.rpc('retry_recording', { p_recording_id: recordingId })
  if (error) throw new Error(`retry: ${error.message}`)
  if (!data) throw new Error('That recording can’t be retried.')
  await requestProcessing(recordingId, token)
}
