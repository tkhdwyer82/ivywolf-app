// apps/web/lib/web/graph.ts
// The web views of her graph (app.ivywolf.com.au/idea, /thread, /todo, /recording) — what the connector's links open.
//
// Owner-only by RLS: every read goes through supabaseAsUser(), her own Clerk token, so another creator's id simply
// comes back empty and the page answers 404. There is no service role here and no creator_id filter to forget.

import { supabaseAsUser } from '../supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isId = (id: string) => UUID.test(id)

export type Rec = {
  id: string
  title: string | null
  recorded_at: string | null
  received_at: string
  recorded_tz: string | null
  source: string
  kind: string
  status: string
}
const REC = 'id, title, recorded_at, received_at, recorded_tz, source, kind, status'

export type CardView = {
  id: string
  title: string
  gist: string
  play_from_ms: number
  confidence: number
  frame_url: string | null
  frame_status: string
  frame_attribution: { provider?: string; photographer?: string } | null
  source: string
  created_at: string
  recordings: Rec | null
  projects: { name: string } | null
  thread_cards: { threads: { id: string; title: string; return_count: number; stage: string } | null }[]
}
const CARD = `id, title, gist, play_from_ms, confidence, frame_url, frame_status, frame_attribution, source, created_at, recordings(${REC}), projects(name), thread_cards(threads(id, title, return_count, stage))`

/**
 * The only pictures a card shows (Job I, as apps/mobile/lib/home.ts cardPicture): a credited Unsplash photo or her own
 * import. The fal frames drawn for cards before Job B live at frames/<creator>/<card>.jpg and are never shown.
 */
export function cardPicture(c: { frame_url: string | null; credited: boolean; source?: string | null }): string | null {
  if (!c.frame_url) return null
  if (c.credited || c.source === 'import') return c.frame_url
  // shared_card() (0034) doesn't return the source: her import's poster is the one picture under <creator>/imports/.
  return /\/frames\/[^/]+\/imports\//.test(c.frame_url) ? c.frame_url : null
}

const shown = (c: CardView): CardView => ({
  ...c,
  frame_url: cardPicture({ frame_url: c.frame_url, credited: c.frame_attribution?.provider === 'unsplash' && !!c.frame_attribution.photographer, source: c.source }),
})

function need<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

export async function loadIdea(id: string): Promise<CardView | null> {
  if (!isId(id)) return null
  const db = await supabaseAsUser()
  const card = need(await db.from('cards').select(CARD).eq('id', id).maybeSingle()) as unknown as CardView | null
  return card && shown(card)
}

export type ThreadView = {
  id: string
  title: string
  stage: string
  return_count: number
  first_seen: string
  last_seen: string
  cards: CardView[]
}

export async function loadThread(id: string): Promise<ThreadView | null> {
  if (!isId(id)) return null
  const db = await supabaseAsUser()
  const t = need(
    await db.from('threads').select(`id, title, stage, return_count, first_seen, last_seen, thread_cards(cards(${CARD}))`).eq('id', id).maybeSingle()
  ) as unknown as (Omit<ThreadView, 'cards'> & { thread_cards: { cards: CardView | null }[] }) | null
  if (!t) return null
  const cards = t.thread_cards.flatMap((tc) => (tc.cards ? [shown(tc.cards)] : [])).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return { id: t.id, title: t.title, stage: t.stage, return_count: t.return_count, first_seen: t.first_seen, last_seen: t.last_seen, cards }
}

export type TodoView = {
  id: string
  text: string
  done: boolean
  due_date: string | null
  frame_url: string | null
  created_at: string
  projects: { name: string } | null
  segments: { start_ms: number; text: string } | null
  recordings: Rec | null
}

export async function loadTodo(id: string): Promise<TodoView | null> {
  if (!isId(id)) return null
  const db = await supabaseAsUser()
  return need(
    await db.from('actions').select(`id, text, done, due_date, frame_url, created_at, projects(name), segments(start_ms, text), recordings(${REC})`).eq('id', id).maybeSingle()
  ) as unknown as TodoView | null
}

export type RecordingView = Rec & { cards: CardView[]; actions: { id: string; text: string; done: boolean; due_date: string | null }[] }

export async function loadRecording(id: string): Promise<RecordingView | null> {
  if (!isId(id)) return null
  const db = await supabaseAsUser()
  const rec = need(await db.from('recordings').select(REC).eq('id', id).maybeSingle()) as Rec | null
  if (!rec) return null
  const cards = (need(await db.from('cards').select(CARD).eq('recording_id', id).order('play_from_ms')) as unknown as CardView[]).map(shown)
  const actions = need(await db.from('actions').select('id, text, done, due_date').eq('recording_id', id).order('created_at')) as RecordingView['actions']
  return { ...rec, cards, actions }
}
