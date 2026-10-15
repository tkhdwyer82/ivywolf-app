// apps/mobile/lib/things.ts
// My things (P4, v4.6 — Figma 1797:2, M1/M3), the one room Ivy speaks in. From Ivy: her merge proposals ("Ivy thinks
// these might be one idea") and threads she keeps coming back to (return_count ≥ COMEBACK, the same bar as Ivy on
// open). Then her to-dos as Pinterest rows in Granola's groups — Today, Yesterday, a header per day for the last week,
// then by week — and a Done group at the bottom with what got done this week. No Loose ends section (Job 4.7).

import type { SupabaseClient } from '@supabase/supabase-js'
import { hueOf } from '@ivywolf/ui'
import { COMEBACK } from '@/lib/home'

export type FromIvy =
  | { kind: 'merge'; id: string; a: string; b: string }
  | { kind: 'comeback'; id: string; cards: number; place: string; openCardId: string | null; openProjectId: string | null }

export interface Todo {
  id: string
  text: string
  dueDate: string | null
  done: boolean
  doneAt: string | null
  /** When she said it: the recording's time, else the row's. Groups and the meta's time come from this. */
  saidAt: string
  project: string
  /** The row's picture: its drawn frame, else null (the project's hue block). */
  picture: string | null
  hue: string
}

export interface Things {
  fromIvy: FromIvy[]
  todo: Todo[]
}

/** Done to-dos stay on the list for the week, in the Done group, so the week reads back. */
const DONE_SHOWN_DAYS = 7

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

type MergeRow = { id: string; a: { title: string } | null; b: { title: string } | null }
type ThreadRow = {
  id: string
  title: string
  return_count: number
  projects: { id: string; name: string; kind: string } | null
  thread_cards: { cards: { id: string; created_at: string } | null }[]
}
type ActionRow = {
  id: string; text: string; due_date: string | null; done: boolean; done_at: string | null; created_at: string
  frame_url: string | null; frame_status: string
  projects: { name: string; hue: string | null } | null
  recordings: { recorded_at: string | null } | null
}
const ACTION_COLUMNS = 'id, text, due_date, done, done_at, created_at, frame_url, frame_status, projects(name, hue), recordings(recorded_at)'

export function toTodo(a: ActionRow): Todo {
  return {
    id: a.id,
    text: a.text,
    dueDate: a.due_date,
    done: a.done,
    doneAt: a.done_at,
    saidAt: a.recordings?.recorded_at ?? a.created_at,
    project: a.projects?.name ?? 'My things',
    picture: a.frame_status === 'done' && a.frame_url ? a.frame_url : null,
    hue: hueOf(a.projects?.hue ?? 'cool-grey'),
  }
}

export async function loadThings(supabase: SupabaseClient): Promise<Things> {
  const since = new Date(Date.now() - DONE_SHOWN_DAYS * 86_400_000).toISOString()
  const [merges, threads, open, done] = await Promise.all([
    supabase
      .from('merge_suggestions')
      .select('id, a:cards!merge_suggestions_a_card_id_fkey(title), b:cards!merge_suggestions_b_card_id_fkey(title)')
      .eq('status', 'proposed')
      .order('created_at', { ascending: false }),
    supabase
      .from('threads')
      .select('id, title, return_count, projects(id, name, kind), thread_cards(cards(id, created_at))')
      .gte('return_count', COMEBACK)
      .order('last_seen', { ascending: false }),
    supabase.from('actions').select(ACTION_COLUMNS).eq('done', false),
    supabase
      .from('actions')
      .select(ACTION_COLUMNS)
      .eq('done', true)
      .gte('done_at', since)
      .order('done_at', { ascending: false }),
  ])

  const fromIvy: FromIvy[] = [
    ...(need('merges', merges) as unknown as MergeRow[])
      .filter((m) => m.a && m.b)
      .map((m) => ({ kind: 'merge' as const, id: m.id, a: m.a!.title, b: m.b!.title })),
    ...(need('threads', threads) as unknown as ThreadRow[]).map((t) => {
      const cards = t.thread_cards.flatMap((tc) => (tc.cards ? [tc.cards] : []))
      const newest = cards.sort((x, y) => y.created_at.localeCompare(x.created_at))[0]
      return {
        kind: 'comeback' as const,
        id: t.id,
        cards: cards.length,
        place: t.projects?.name ?? `“${t.title}”`,
        openCardId: newest?.id ?? null,
        // Open goes to its project page (P11); a thread still in My things opens its newest idea instead.
        openProjectId: t.projects && t.projects.kind !== 'things' ? t.projects.id : null,
      }
    }),
  ]

  const todo = [...(need('open', open) as unknown as ActionRow[]), ...(need('done', done) as unknown as ActionRow[])].map(toTodo)
  return { fromIvy, todo }
}

/** Her Merge (0021). Returns false if the proposal had already gone. */
export async function acceptMerge(supabase: SupabaseClient, suggestionId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('accept_merge', { p_suggestion_id: suggestionId })
  if (error) throw new Error(`merge: ${error.message}`)
  return data !== null
}

export async function keepSeparate(supabase: SupabaseClient, suggestionId: string) {
  const { error } = await supabase.from('merge_suggestions').update({ status: 'rejected' }).eq('id', suggestionId)
  if (error) throw new Error(`merge: ${error.message}`)
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 86_400_000
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
/** Whole days between her local calendar days: 0 today, 1 yesterday. */
const daysAgo = (at: Date, now: Date) => Math.round((dayStart(now) - dayStart(at)) / DAY_MS)
/** '2026-09-30' is her calendar day, not UTC. */
const localDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
/** "Wed 30 Sep". */
const shortDate = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
/** "7:40", "12:21" — her clock, no am/pm (the frame's meta). */
const clockTime = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`

/** When she said it, for the meta: "Today 7:40", "Mon 12:05" (this past week), else "Wed 30 Sep". */
export function saidLabel(iso: string, now = new Date()): string {
  const at = new Date(iso)
  const n = daysAgo(at, now)
  if (n <= 0) return `Today ${clockTime(at)}`
  if (n < 7) return `${DAYS[at.getDay()]} ${clockTime(at)}`
  return shortDate(at)
}

export function isOverdue(t: Pick<Todo, 'dueDate' | 'done'>, now = new Date()): boolean {
  return !t.done && !!t.dueDate && localDay(t.dueDate).getTime() < dayStart(now)
}

/**
 * The row's meta (M1): "{when she said it} · {project}". Overdue is the whole line in red, with the due day in it,
 * so overdue is never the only date: "Overdue · Wed 30 Sep · Home". No work/personal tag.
 */
export function metaLine(t: Pick<Todo, 'dueDate' | 'done' | 'saidAt' | 'project'>, now = new Date()): { text: string; overdue: boolean } {
  if (isOverdue(t, now)) return { text: `Overdue · ${shortDate(localDay(t.dueDate!))} · ${t.project}`, overdue: true }
  return { text: `${saidLabel(t.saidAt, now)} · ${t.project}`, overdue: false }
}

export type Group = { key: string; title: string; note?: string; rows: Todo[] }

/** Monday of her week, local. */
const weekOf = (d: Date) => {
  const start = new Date(dayStart(d))
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

/** The group a row sits in, by the day she said it: TODAY, YESTERDAY, WED 30 SEP (the past week), WEEK OF 21 SEP. */
export function groupOf(saidAt: string, now = new Date()): { key: string; title: string } {
  const at = new Date(saidAt)
  const n = daysAgo(at, now)
  if (n <= 0) return { key: 'today', title: 'TODAY' }
  if (n === 1) return { key: 'yesterday', title: 'YESTERDAY' }
  if (n < 7) return { key: `day:${dayStart(at)}`, title: shortDate(at).toUpperCase() }
  const w = weekOf(at)
  return { key: `week:${w.getTime()}`, title: `WEEK OF ${w.getDate()} ${MONTHS[w.getMonth()]}`.toUpperCase() }
}

/**
 * The list (M1, M3). Open to-dos in their groups, newest first; a row ticked within the last 6 s (`settling`) stays
 * where it was, faded, so nothing moves under her finger. Then DONE at the bottom: done rows, newest tick first, with
 * "N this week" beside the header. Groups with no rows aren't shown.
 */
export function groupTodos(todos: Todo[], settling: ReadonlySet<string> = new Set(), now = new Date()): Group[] {
  const open = todos.filter((t) => !t.done || settling.has(t.id)).sort((a, b) => b.saidAt.localeCompare(a.saidAt))
  const groups: Group[] = []
  for (const t of open) {
    const g = groupOf(t.saidAt, now)
    const last = groups[groups.length - 1]
    if (last?.key === g.key) last.rows.push(t)
    else groups.push({ ...g, rows: [t] })
  }
  const done = todos.filter((t) => t.done && !settling.has(t.id)).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  if (done.length) {
    const week = weekOf(now).getTime()
    const thisWeek = done.filter((t) => t.doneAt && new Date(t.doneAt).getTime() >= week).length
    groups.push({ key: 'done', title: 'DONE', note: thisWeek ? `${thisWeek} this week` : undefined, rows: done })
  }
  return groups
}
