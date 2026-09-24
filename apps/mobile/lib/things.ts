// apps/mobile/lib/things.ts
// My things (P4), the one room Ivy speaks in. From Ivy: her merge proposals ("Ivy thinks these might be one idea")
// and threads she keeps coming back to (return_count ≥ COMEBACK, the same bar as Ivy on open). To do: open to-dos,
// then the ones done in the last few days. No Loose ends section (brief, Job 4.7).

import type { SupabaseClient } from '@supabase/supabase-js'
import { COMEBACK } from '@/lib/home'

export type FromIvy =
  | { kind: 'merge'; id: string; a: string; b: string }
  | { kind: 'comeback'; id: string; cards: number; place: string; openCardId: string | null }

export interface Todo {
  id: string
  text: string
  scope: 'personal' | 'work'
  dueDate: string | null
  done: boolean
  doneAt: string | null
}

export interface Things {
  fromIvy: FromIvy[]
  todo: Todo[]
}

/** Done to-dos stay on the list this long, greyed, so a tick can be seen and taken back. */
const DONE_SHOWN_DAYS = 3

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

type MergeRow = { id: string; a: { title: string } | null; b: { title: string } | null }
type ThreadRow = {
  id: string
  title: string
  return_count: number
  projects: { name: string } | null
  thread_cards: { cards: { id: string; created_at: string } | null }[]
}
type ActionRow = { id: string; text: string; scope: Todo['scope']; due_date: string | null; done: boolean; done_at: string | null; created_at: string }

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
      .select('id, title, return_count, projects(name), thread_cards(cards(id, created_at))')
      .gte('return_count', COMEBACK)
      .order('last_seen', { ascending: false }),
    supabase.from('actions').select('id, text, scope, due_date, done, done_at, created_at').eq('done', false),
    supabase
      .from('actions')
      .select('id, text, scope, due_date, done, done_at, created_at')
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
      }
    }),
  ]

  // Open to-dos: dated ones first, soonest first; then undated, newest first.
  const openRows = (need('open', open) as ActionRow[]).sort((x, y) =>
    x.due_date && y.due_date ? x.due_date.localeCompare(y.due_date) : x.due_date ? -1 : y.due_date ? 1 : y.created_at.localeCompare(x.created_at)
  )
  const todo = [...openRows, ...(need('done', done) as ActionRow[])].map((a) => ({
    id: a.id,
    text: a.text,
    scope: a.scope,
    dueDate: a.due_date,
    done: a.done,
    doneAt: a.done_at,
  }))
  return { fromIvy, todo }
}

export async function setDone(supabase: SupabaseClient, id: string, done: boolean) {
  const { error } = await supabase.from('actions').update({ done }).eq('id', id)
  if (error) throw new Error(`to-do: ${error.message}`)
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
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Days from today to a local date ('2026-09-24' is her calendar day, not UTC). */
function daysFromToday(isoDate: string, now = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return Math.round((new Date(y, m - 1, d).getTime() - dayStart(now)) / 86_400_000)
}

/** "due today", "due tomorrow", "due Sat" (this week), "due Thu 24 Sep", "overdue · Tue 22 Sep". */
export function dueLabel(isoDate: string, now = new Date()): string {
  const n = daysFromToday(isoDate, now)
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const full = `${DAYS[date.getDay()]} ${d} ${MONTHS[m - 1]}`
  if (n < 0) return `overdue · ${full}`
  if (n === 0) return 'due today'
  if (n === 1) return 'due tomorrow'
  if (n < 7) return `due ${DAYS[date.getDay()]}`
  return `due ${full}`
}

/** "done today", "done yesterday", "done Mon"; plain "done" for ticks from before 0021 kept a time. */
export function doneLabel(doneAt: string | null, now = new Date()): string {
  if (!doneAt) return 'done'
  const at = new Date(doneAt)
  const n = Math.round((dayStart(now) - dayStart(at)) / 86_400_000)
  if (n <= 0) return 'done today'
  if (n === 1) return 'done yesterday'
  return `done ${DAYS[at.getDay()]}`
}
