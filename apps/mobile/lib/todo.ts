// apps/mobile/lib/todo.ts
// One to-do (P17) and its Date sheet (P18): what Ivy heard and when, the day it's for, Remind me (a local
// notification keyed by the to-do's id) and Add to Reminders (an Apple Reminders item, id kept on the row).
// expo-calendar and expo-notifications are loaded on use: builds made before they were added don't have their
// native modules, and a to-do without a date must still open.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface Todo {
  id: string
  text: string
  scope: 'personal' | 'work'
  priority: string
  dueDate: string | null
  done: boolean
  heartedAt: string | null
  remindAt: string | null
  syncedReminderId: string | null
  frameUrl: string | null
  frameStatus: string
  project: { id: string; name: string } | null
  recordingId: string | null
  recordingTitle: string | null
  recordedAt: string | null
  storagePath: string | null
  /** Where in the recording she said it, and what she said. */
  said: { startMs: number; text: string } | null
}

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

type Row = {
  id: string; text: string; scope: Todo['scope']; priority: string; due_date: string | null; done: boolean
  hearted_at: string | null; remind_at: string | null; synced_reminder_id: string | null; frame_url: string | null
  frame_status: string; recording_id: string | null; created_at: string
  projects: { id: string; name: string } | null
  recordings: { title: string | null; recorded_at: string | null; storage_path: string } | null
  segments: { start_ms: number; text: string } | null
}

export async function loadTodo(supabase: SupabaseClient, id: string): Promise<Todo | null> {
  const row = need(
    'to-do',
    await supabase
      .from('actions')
      .select(
        'id, text, scope, priority, due_date, done, hearted_at, remind_at, synced_reminder_id, frame_url, frame_status, recording_id, created_at, projects(id, name), recordings(title, recorded_at, storage_path), segments(start_ms, text)'
      )
      .eq('id', id)
      .maybeSingle()
  ) as unknown as Row | null
  if (!row) return null
  return {
    id: row.id,
    text: row.text,
    scope: row.scope,
    priority: row.priority,
    dueDate: row.due_date,
    done: row.done,
    heartedAt: row.hearted_at,
    remindAt: row.remind_at,
    syncedReminderId: row.synced_reminder_id,
    frameUrl: row.frame_url,
    frameStatus: row.frame_status,
    project: row.projects,
    recordingId: row.recording_id,
    recordingTitle: row.recordings?.title ?? null,
    recordedAt: row.recordings?.recorded_at ?? row.created_at,
    storagePath: row.recordings?.storage_path ?? null,
    said: row.segments ? { startMs: row.segments.start_ms, text: row.segments.text } : null,
  }
}

async function update(supabase: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from('actions').update(patch).eq('id', id).select('id')
  if (error) throw new Error(`to-do: ${error.message}`)
  if (!data?.length) throw new Error('This to-do has gone.')
}

export async function setTodoHeart(supabase: SupabaseClient, id: string, on: boolean) {
  await update(supabase, id, { hearted_at: on ? new Date().toISOString() : null })
}

// ── Words ──────────────────────────────────────────────────────────────────────────────────────────────────

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const PRIORITY: Record<string, string> = { low: 'low', med: 'medium', high: 'high' }

/** '2026-09-24' → a local Date at midnight (a due date names a day, not an instant — 0009). */
export function day(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "Thursday 24 September" (the sheet's heading). */
export const longDay = (iso: string) => {
  const d = day(iso)
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}
/** "Tue 22 Sep". */
export const shortDay = (d: Date) => `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`

/** "Due Thursday 24 Sep · work · medium" — or, without a date, "work · medium". */
export function dueLine(t: Pick<Todo, 'dueDate' | 'scope' | 'priority' | 'done'>): string {
  const when = t.dueDate ? (() => {
    const d = day(t.dueDate)
    return `Due ${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
  })() : null
  return [t.done ? 'Done' : when, t.scope, PRIORITY[t.priority] ?? t.priority].filter(Boolean).join(' · ')
}

// The words that named the day: "for Thursday", "tomorrow", "on the 24th", "by Friday", "next week".
const WEEKDAY = '(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?'
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*'
const DATE_WORDS = new RegExp(
  `\\b(?:(?:for|on|by|before|until|this|next|due)\\s+)*(?:today|tonight|tomorrow|${WEEKDAY}|the\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s+of\\s+${MONTH})?|\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}|${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?|next\\s+week|the\\s+weekend|this\\s+weekend)\\b`,
  'i'
)

/** What she said, cut to the sentence that holds the day, and the day words themselves. */
export function heard(said: string): { quote: string; phrase: string | null } {
  const sentences = said.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [said.trim()]
  const i = sentences.findIndex((s) => DATE_WORDS.test(s))
  if (i < 0) {
    // No day in it: all of it if it's short, else how it started.
    const all = said.trim()
    return { quote: all.length <= 140 || sentences.length < 2 ? all : `${sentences[0].replace(/[.!?]+$/, '')}…`, phrase: null }
  }
  return { quote: `${i > 0 ? '…' : ''}${sentences[i]}`, phrase: sentences[i].match(DATE_WORDS)![0] }
}

// ── Remind me (local notification) ─────────────────────────────────────────────────────────────────────────

export const REMIND_HOUR = 8

/** The morning of the day it's for, at 8:00; if that's gone already, the next whole hour. */
export function defaultRemindAt(dueDate: string, now = new Date()): Date {
  const at = day(dueDate)
  at.setHours(REMIND_HOUR, 0, 0, 0)
  if (at > now) return at
  const next = new Date(now)
  next.setHours(now.getHours() + 1, 0, 0, 0)
  return next
}

/** "Thursday, 8:00 am". */
export function remindLine(at: Date): string {
  const h = at.getHours() % 12 || 12
  return `${DAYS[at.getDay()]}, ${h}:${String(at.getMinutes()).padStart(2, '0')} ${at.getHours() < 12 ? 'am' : 'pm'}`
}

async function notifications() {
  try {
    return await import('expo-notifications')
  } catch {
    throw new Error('Update the app to use reminders.')
  }
}

async function schedule(id: string, text: string, at: Date) {
  const N = await notifications()
  const perm = await N.getPermissionsAsync()
  const ok = perm.granted || (perm.canAskAgain && (await N.requestPermissionsAsync()).granted)
  if (!ok) throw new Error('Notifications are off for Ivy Wolf. Turn them on in Settings to be reminded.')
  await N.cancelScheduledNotificationAsync(id).catch(() => {})
  await N.scheduleNotificationAsync({
    identifier: id,
    content: { title: text, body: 'From your voice notes', data: { todoId: id } },
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: at },
  })
}

async function unschedule(id: string) {
  const N = await notifications()
  await N.cancelScheduledNotificationAsync(id).catch(() => {})
}

export async function setRemind(supabase: SupabaseClient, t: Todo, at: Date | null) {
  if (at) await schedule(t.id, t.text, at)
  else await unschedule(t.id)
  await update(supabase, t.id, { remind_at: at ? at.toISOString() : null })
}

// ── Add to Reminders (Apple Reminders via EventKit) ────────────────────────────────────────────────────────

async function calendar() {
  try {
    return await import('expo-calendar')
  } catch {
    throw new Error('Update the app to use Reminders.')
  }
}

/** Her Reminders list for this scope: one named "Work"/"Personal" if she has it, else her first list. */
export async function reminderList(scope: Todo['scope']): Promise<{ id: string; title: string }> {
  const list = await findList(scope)
  return { id: list.id, title: list.title }
}

async function findList(scope: Todo['scope']) {
  const C = await calendar()
  const perm = await C.getRemindersPermissions()
  const ok = perm.granted || (perm.canAskAgain && (await C.requestRemindersPermissions()).granted)
  if (!ok) throw new Error('Reminders access is off for Ivy Wolf. Turn it on in Settings to sync.')
  const lists = (await C.getCalendars(C.EntityTypes.REMINDER)).filter((l) => l.allowsModifications)
  const list = lists.find((l) => l.title.trim().toLowerCase() === scope) ?? lists[0]
  if (!list) throw new Error('There’s no Reminders list on this phone to add to.')
  return list
}

/** Her Reminders item, if it's still there (she may have deleted it in Reminders). */
async function findReminder(id: string) {
  const C = await calendar().catch(() => null)
  return C ? await C.ExpoCalendarReminder.get(id).catch(() => null) : null
}

function reminderFields(t: Pick<Todo, 'text' | 'dueDate' | 'done'>) {
  return {
    title: t.text,
    completed: t.done,
    // All-day on the day it's for; Remind me is the timed alert.
    dueDate: t.dueDate ? day(t.dueDate) : undefined,
    notes: 'Added by Ivy Wolf from your voice notes.',
  }
}

export async function setSynced(supabase: SupabaseClient, t: Todo, on: boolean) {
  if (on) {
    const list = await findList(t.scope)
    const item = await list.createReminder(reminderFields(t))
    try {
      await update(supabase, t.id, { synced_reminder_id: item.id })
    } catch (e) {
      await item.delete().catch(() => {})
      throw e
    }
  } else {
    if (t.syncedReminderId) await (await findReminder(t.syncedReminderId))?.delete().catch(() => {})
    await update(supabase, t.id, { synced_reminder_id: null })
  }
}

/** Keep the Reminders item in step after she changes the to-do here. Missing (deleted in Reminders) is fine. */
async function pushToReminder(t: Pick<Todo, 'text' | 'dueDate' | 'done' | 'syncedReminderId'>) {
  if (!t.syncedReminderId) return
  await (await findReminder(t.syncedReminderId))?.update(reminderFields(t)).catch(() => {})
}

/** Change date: the row, then the reminder time (kept on the same clock time) and the Reminders item. */
export async function changeDate(supabase: SupabaseClient, t: Todo, dueDate: string): Promise<Todo> {
  await update(supabase, t.id, { due_date: dueDate })
  let next: Todo = { ...t, dueDate }
  if (t.remindAt) {
    const was = new Date(t.remindAt)
    const at = day(dueDate)
    at.setHours(was.getHours(), was.getMinutes(), 0, 0)
    const when = at > new Date() ? at : defaultRemindAt(dueDate)
    await setRemind(supabase, next, when)
    next = { ...next, remindAt: when.toISOString() }
  }
  await pushToReminder(next)
  return next
}

/**
 * Tick or untick, from anywhere (P4, P17): the row, then the phone. A done to-do needs no notification; undoing
 * brings a future one back. The Reminders item follows.
 */
export async function setTodoDone(supabase: SupabaseClient, id: string, done: boolean) {
  const { data, error } = await supabase
    .from('actions')
    .update({ done })
    .eq('id', id)
    .select('id, text, due_date, remind_at, synced_reminder_id')
  if (error) throw new Error(`to-do: ${error.message}`)
  const row = data?.[0] as { id: string; text: string; due_date: string | null; remind_at: string | null; synced_reminder_id: string | null } | undefined
  if (!row) throw new Error('This to-do has gone.')
  if (row.remind_at) {
    if (done) await unschedule(id).catch(() => {})
    else if (new Date(row.remind_at) > new Date()) await schedule(id, row.text, new Date(row.remind_at)).catch(() => {})
  }
  await pushToReminder({ text: row.text, dueDate: row.due_date, done, syncedReminderId: row.synced_reminder_id })
}

/** Move to trash: the row, and whatever it put on the phone. */
export async function deleteTodo(supabase: SupabaseClient, t: Todo) {
  const { data, error } = await supabase.from('actions').delete().eq('id', t.id).select('id')
  if (error) throw new Error(`to-do: ${error.message}`)
  if (!data?.length) throw new Error('This to-do has gone.')
  if (t.remindAt) await unschedule(t.id).catch(() => {})
  if (t.syncedReminderId) await (await findReminder(t.syncedReminderId))?.delete().catch(() => {})
}
