// apps/mobile/lib/home.ts
// Home (P1): cards and to-dos in one feed, newest first by when they were said (recordings.recorded_at), grouped by
// the creator's local day, filtered by a project chip. Plus Ivy on open: at most three sentences, composed from the
// graph and never stored (rule 2 — each sentence keeps what it's about, recording + time, in `cites`).
// Pure functions below the loader so the grouping and wording can be tested without a device.

import type { SupabaseClient } from '@supabase/supabase-js'
import { requestProcessing } from './record'

export interface Project {
  id: string
  name: string
  kind: 'things' | 'mini' | 'user'
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
export interface CardItem extends Base {
  kind: 'card'
  title: string
  gist: string
  playFromMs: number
  confidence: number
  storagePath: string | null
  threadSize: number
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
  storage_path: string
  received_at: string
  duration_ms: number | null
}

export interface HomeData {
  projects: Project[]
  items: Item[]
  threads: Thread[]
  /** Recordings Ivy is still working on — Home keeps polling while there are any. */
  inFlight: number
  /** Queued > 30 s and never claimed: the process request didn't arrive. Home asks again. */
  stuck: string[]
  /** Recordings Ivy couldn't process (errors, or swept after timing out — 0020): retry or delete, never a spinner. */
  failed: FailedRecording[]
  lastOpenedAt: string | null
}

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

const LIMIT = 300
const STUCK_MS = 30_000

export async function loadHome(supabase: SupabaseClient, userId: string): Promise<HomeData> {
  const [projects, cards, actions, threads, inFlight, creator] = await Promise.all([
    supabase.from('projects').select('id, name, kind').order('is_default', { ascending: false }).order('created_at'),
    supabase
      .from('cards')
      .select('id, recording_id, project_id, title, gist, play_from_ms, confidence, frame_url, frame_status, frame_at, created_at, recordings(recorded_at, storage_path)')
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    supabase
      .from('actions')
      .select('id, recording_id, project_id, text, done, due_date, frame_url, frame_status, frame_at, created_at, recordings(recorded_at)')
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    supabase.from('threads').select('id, title, return_count, thread_cards(card_id)'),
    supabase.from('recordings').select('id, status, received_at').in('status', ['queued', 'processing']),
    supabase.from('creators').select('last_opened_at').eq('id', userId).maybeSingle(),
  ])
  const failed = need(
    'failed',
    await supabase
      .from('recordings')
      .select('id, storage_path, received_at, duration_ms')
      .eq('status', 'failed')
      .order('received_at', { ascending: false })
      .limit(20)
  ) as FailedRecording[]

  const threadRows = need('threads', threads) as unknown as {
    id: string
    title: string
    return_count: number
    thread_cards: { card_id: string }[]
  }[]
  const sizeOf = new Map<string, number>()
  for (const t of threadRows) for (const tc of t.thread_cards) sizeOf.set(tc.card_id, t.thread_cards.length)

  type Rec = { recorded_at: string | null; storage_path?: string } | null
  const cardRows = need('cards', cards) as unknown as ({
    id: string; recording_id: string; project_id: string; title: string; gist: string; play_from_ms: number
    confidence: number; frame_url: string | null; frame_status: Base['frameStatus']; frame_at: string | null
    created_at: string; recordings: Rec
  })[]
  const actionRows = need('actions', actions) as unknown as {
    id: string; recording_id: string | null; project_id: string; text: string; done: boolean; due_date: string | null
    frame_url: string | null; frame_status: Base['frameStatus']; frame_at: string | null; created_at: string; recordings: Rec
  }[]

  const items: Item[] = [
    ...cardRows.map((c): CardItem => ({
      kind: 'card',
      id: c.id,
      recordingId: c.recording_id,
      projectId: c.project_id,
      title: c.title,
      gist: c.gist,
      playFromMs: c.play_from_ms,
      confidence: c.confidence,
      frameUrl: c.frame_url,
      frameStatus: c.frame_status,
      frameAt: c.frame_at,
      at: c.recordings?.recorded_at ?? c.created_at,
      storagePath: c.recordings?.storage_path ?? null,
      threadSize: sizeOf.get(c.id) ?? 1,
    })),
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
export async function markOpened(supabase: SupabaseClient, userId: string) {
  await supabase.from('creators').update({ last_opened_at: new Date().toISOString() }).eq('id', userId)
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
  if (days <= 0) return null
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

/** Small stable number from an id, so a tile keeps its height across renders and refreshes. */
function jitter(id: string, spread: number): number {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return (Math.abs(h) % (2 * spread + 1)) - spread
}

/** Visual height of a tile's frame, per the P1 frame: ideas 190–214 tall, to-dos 120–150, typographic 150–180. */
export function frameHeight(item: Item): number {
  if (item.kind === 'action') return 136 + jitter(item.id, 14)
  if (item.frameStatus === 'done' && item.frameUrl) return 202 + jitter(item.id, 12)
  return 166 + jitter(item.id, 14)
}

const CAPTION = 60 // title (up to two lines) + meta line + spacing under a tile

/** Two columns, each tile into the shorter one — the Pinterest fill. Order within a day is kept top-down. */
export function masonry(items: Item[]): [Item[], Item[]] {
  const cols: [Item[], Item[]] = [[], []]
  const heights = [0, 0]
  for (const item of items) {
    const c = heights[0] <= heights[1] ? 0 : 1
    cols[c].push(item)
    heights[c] += frameHeight(item) + CAPTION
  }
  return cols
}

// ── Ivy on open ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface IvySentence {
  text: string
  /** Rule 2: what the sentence is about — every sentence comes from the graph. */
  cites: { recordingId: string | null; ms: number }[]
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const count = (n: number) => WORDS[n] ?? String(n)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * At most three sentences, in this order: what's due today, a thread she keeps coming back to (≥ 3 returns), and
 * ideas that got a frame since she last opened Home. Nothing new → no sentences (Ivy stays silent).
 */
export function ivyOnOpen(data: HomeData, now = new Date()): IvySentence[] {
  const today = localDay(now.toISOString())
  const out: IvySentence[] = []
  const cardOf = new Map(data.items.filter((i): i is CardItem => i.kind === 'card').map((c) => [c.id, c]))

  const due = data.items.filter((i): i is ActionItem => i.kind === 'action' && !i.done && i.dueDate === today)
  if (due.length === 1) {
    out.push({ text: `“${due[0].text}” is due today.`, cites: [{ recordingId: due[0].recordingId, ms: 0 }] })
  } else if (due.length > 1) {
    out.push({ text: `${cap(count(due.length))} things are due today.`, cites: due.map((d) => ({ recordingId: d.recordingId, ms: 0 })) })
  }

  const since = data.lastOpenedAt
  const framed = [...cardOf.values()].filter((c) => c.frameStatus === 'done' && c.frameAt && (!since || c.frameAt > since))

  const returning = [...data.threads].filter((t) => t.returnCount >= 3).sort((a, b) => b.returnCount - a.returnCount)[0]
  if (returning) {
    const cards = returning.cardIds.map((id) => cardOf.get(id)).filter((c): c is CardItem => !!c)
    const newFrame = framed.find((c) => returning.cardIds.includes(c.id))
    out.push({
      text:
        `You’ve come back to ${returning.title} ${count(returning.returnCount)} times` +
        (newFrame ? '; it has a frame now.' : '.'),
      cites: cards.map((c) => ({ recordingId: c.recordingId, ms: c.playFromMs })),
    })
    if (newFrame) framed.splice(framed.indexOf(newFrame), 1)
  }

  if (framed.length === 1) {
    out.push({ text: `${framed[0].title} has a frame now.`, cites: [{ recordingId: framed[0].recordingId, ms: framed[0].playFromMs }] })
  } else if (framed.length > 1) {
    out.push({
      text: `${cap(count(framed.length))} of your ideas have new frames.`,
      cites: framed.map((c) => ({ recordingId: c.recordingId, ms: c.playFromMs })),
    })
  }
  return out.slice(0, 3)
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
