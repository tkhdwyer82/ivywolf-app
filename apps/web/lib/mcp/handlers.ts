// apps/web/lib/mcp/handlers.ts
// The MCP server's reads (Job F, the Muse connector). Shape lifted from gamesfield-app lib/mcp/handlers.ts per
// docs/lift-list.md: one function per tool, every query scoped by the creator id the API key resolved to.
//
// Rules this file keeps (Job F §2):
//   1. Read the graph, never rebuild it — every object carries a cite {recording_id, ms} and a link.
//   3. Gist, not transcript — list results carry title + gist; words only come from getTranscript, by id.
//   5. Untrusted both ways — what she said is returned as data (sanitised, capped), never acted on. Errors are
//      McpError: plain sentences, because Muse shows them to her verbatim.
//
// Service role by necessity (lib/mcp/auth.ts): there is no Clerk session to carry, so RLS can't do the scoping.
// Every query here filters on creator_id itself — that filter is the only thing between one creator and another.

import { cosine, embed } from '@ivywolf/pipeline'
import { supabaseAdmin } from '../supabase'

/** A plain-sentence error for the creator (Muse surfaces it verbatim). Anything else thrown is a bug. */
export class McpError extends Error {}

// ── Links ────────────────────────────────────────────────────────────────────────────────────────────────────
// https pages on app.ivywolf.com.au (apps/web app/idea, thread, todo, recording): her own only, sign-in first, each
// with "Open in the Ivy app". Not ivywolf:// — Muse blocks custom schemes.
// web_link repeats link for one release, for clients built against the ivywolf:// + web_link pair; drop it after.
const WEB = 'https://app.ivywolf.com.au'
export type Link = { link: string; web_link: string }
const linkTo = (path: string): Link => ({ link: `${WEB}/${path}`, web_link: `${WEB}/${path}` })
export const ideaLink = (cardId: string) => linkTo(`idea/${cardId}`)
const threadLink = (threadId: string) => linkTo(`thread/${threadId}`)
const todoLink = (actionId: string) => linkTo(`todo/${actionId}`)
/** A recording, and what Ivy made from it: for a capture, a session, a transcript, or a quote with no idea. */
export const recordingLink = (recordingId: string) => linkTo(`recording/${recordingId}`)

// ── Untrusted text ───────────────────────────────────────────────────────────────────────────────────────────
// Card text is whatever she said, and the classifier's paraphrase of it. It goes back out as a JSON string value,
// unchanged in meaning: control characters and bidi overrides are removed (they can hide text from the reader of a
// tool result), and lengths are capped. Nothing in it is ever interpreted.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g
export function clean(s: string | null | undefined, max = 600): string | null {
  if (s === null || s === undefined) return null
  const t = s.replace(INVISIBLE, '').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// ── Shared shapes ────────────────────────────────────────────────────────────────────────────────────────────
export type Cite = { recording_id: string; ms: number }

export type Card = {
  id: string
  title: string | null
  gist: string | null
  project: string | null
  /** The stage of the thread the idea is in: sparked → developing → ready → shipped. */
  status: string | null
  recorded_at: string
  cite: Cite
} & Link

const CARD_COLUMNS =
  'id, title, gist, play_from_ms, recording_id, created_at, energy, projects(name), recordings(recorded_at), thread_cards(threads(id, stage))'

type CardRow = {
  id: string
  title: string
  gist: string
  play_from_ms: number
  recording_id: string
  created_at: string
  energy: number | null
  projects: { name: string } | null
  recordings: { recorded_at: string | null } | null
  thread_cards: { threads: { id: string; stage: string } | null }[]
}

const threadOf = (r: CardRow) => r.thread_cards.find((tc) => tc.threads)?.threads ?? null

function toCard(r: CardRow): Card {
  return {
    id: r.id,
    title: clean(r.title, 200),
    gist: clean(r.gist),
    project: clean(r.projects?.name ?? null, 120),
    status: threadOf(r)?.stage ?? null,
    recorded_at: r.recordings?.recorded_at ?? r.created_at,
    cite: { recording_id: r.recording_id, ms: r.play_from_ms },
    ...ideaLink(r.id),
  }
}

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data
}

const db = () => supabaseAdmin()

/** A project named by the creator (any case), or an McpError listing the ones she has. */
async function projectId(creatorId: string, name: string): Promise<string> {
  const rows = check(await db().from('projects').select('id, name').eq('creator_id', creatorId)) as { id: string; name: string }[]
  const key = name.trim().toLowerCase()
  const hit = rows.find((p) => p.name.trim().toLowerCase() === key)
  if (hit) return hit.id
  throw new McpError(`You don't have a project called "${clean(name, 80)}". Your projects are: ${rows.map((p) => p.name).join(', ')}.`)
}

// ── list_ideas ───────────────────────────────────────────────────────────────────────────────────────────────
export async function listIdeas(
  creatorId: string,
  args: { since: string; project?: string; status?: string; limit?: number }
): Promise<{ ideas: Card[] }> {
  const status = args.status
  let q = db()
    .from('cards')
    .select(status ? CARD_COLUMNS.replace('thread_cards(threads(', 'thread_cards!inner(threads!inner(') : CARD_COLUMNS)
    .eq('creator_id', creatorId)
    .gte('created_at', new Date(args.since).toISOString())
  if (args.project) q = q.eq('project_id', await projectId(creatorId, args.project))
  if (status) q = q.eq('thread_cards.threads.stage', status)
  const rows = check(await q.order('created_at', { ascending: false }).limit(args.limit ?? 20)) as unknown as CardRow[]
  return { ideas: rows.map(toCard) }
}

// ── search_ideas ─────────────────────────────────────────────────────────────────────────────────────────────
// Ranked by embedding + recency. The query is embedded as a Voyage 'query' against her cards' 'document'
// embeddings (packages/pipeline/embed.ts); similarity is computed here, as threading does (graph.ts), over her most
// recent cards. Only her query text goes to Voyage — never another creator's anything.
const SEARCH_POOL = 2000
const RECENCY_WEIGHT = 0.15
const RECENCY_HALF_LIFE_DAYS = 30

export async function searchIdeas(creatorId: string, args: { query: string; limit?: number }): Promise<{ ideas: (Card & { score: number })[] }> {
  const [qv] = await embed([args.query], 'query')
  const rows = check(
    await db()
      .from('cards')
      .select(`${CARD_COLUMNS}, embedding`)
      .eq('creator_id', creatorId)
      .not('embedding', 'is', null)
      .order('created_at', { ascending: false })
      .limit(SEARCH_POOL)
  ) as unknown as (CardRow & { embedding: string | number[] })[]

  const now = Date.now()
  const scored = rows.map((r) => {
    const e = typeof r.embedding === 'string' ? (JSON.parse(r.embedding) as number[]) : r.embedding
    const ageDays = (now - new Date(r.created_at).getTime()) / 86_400_000
    const recency = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS)
    return { r, score: (1 - RECENCY_WEIGHT) * cosine(qv, e) + RECENCY_WEIGHT * recency }
  })
  scored.sort((a, b) => b.score - a.score)
  return { ideas: scored.slice(0, args.limit ?? 10).map(({ r, score }) => ({ ...toCard(r), score: Math.round(score * 1000) / 1000 })) }
}

// ── get_idea ─────────────────────────────────────────────────────────────────────────────────────────────────
type ActionRow = {
  id: string
  text: string
  due_date: string | null
  done: boolean
  recording_id: string | null
  projects: { name: string } | null
  segments: { start_ms: number } | null
}
const ACTION_COLUMNS = 'id, text, due_date, done, recording_id, projects(name), segments(start_ms)'

type Action = { id: string; text: string | null; due: string | null; status: 'open' | 'done'; project: string | null; cite: Cite | null } & Link

function toAction(a: ActionRow): Action {
  return {
    id: a.id,
    text: clean(a.text, 300),
    due: a.due_date,
    status: a.done ? 'done' : 'open',
    project: clean(a.projects?.name ?? null, 120),
    cite: a.recording_id ? { recording_id: a.recording_id, ms: a.segments?.start_ms ?? 0 } : null,
    ...todoLink(a.id),
  }
}

export async function getIdea(creatorId: string, args: { id: string }) {
  const row = check(
    await db().from('cards').select(CARD_COLUMNS).eq('creator_id', creatorId).eq('id', args.id).maybeSingle()
  ) as unknown as CardRow | null
  if (!row) throw new McpError("I couldn't find that idea in your Ivy. It may have been deleted.")

  const t = threadOf(row)
  const thread = t
    ? (check(
        await db()
          .from('threads')
          .select(`id, title, stage, return_count, last_seen, thread_cards(cards(${CARD_COLUMNS}))`)
          .eq('creator_id', creatorId)
          .eq('id', t.id)
          .maybeSingle()
      ) as unknown as ThreadRow | null)
    : null

  // "Actions on it": the to-dos said in the same recording. Actions aren't linked to a card, only to where they
  // were said.
  const actions = check(
    await db().from('actions').select(ACTION_COLUMNS).eq('creator_id', creatorId).eq('recording_id', row.recording_id)
  ) as unknown as ActionRow[]

  const siblings = (thread?.thread_cards ?? [])
    .flatMap((tc) => (tc.cards && tc.cards.id !== row.id ? [tc.cards] : []))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10)
    .map(toCard)

  return {
    idea: toCard(row),
    thread: thread
      ? {
          id: thread.id,
          name: clean(thread.title, 200),
          stage: thread.stage,
          returns: thread.return_count,
          last_return_at: thread.last_seen,
          ...threadLink(thread.id),
        }
      : null,
    returns: thread?.return_count ?? 0,
    thread_siblings: siblings,
    actions: actions.map(toAction),
  }
}

// ── list_threads ─────────────────────────────────────────────────────────────────────────────────────────────
type ThreadRow = {
  id: string
  title: string
  stage: string
  return_count: number
  last_seen: string
  thread_cards: { cards: CardRow | null }[]
}

export async function listThreads(creatorId: string, args: { min_returns?: number; limit?: number }) {
  let q = db()
    .from('threads')
    .select(`id, title, stage, return_count, last_seen, thread_cards(cards(${CARD_COLUMNS}))`)
    .eq('creator_id', creatorId)
  if (args.min_returns !== undefined) q = q.gte('return_count', args.min_returns)
  const rows = check(await q.order('last_seen', { ascending: false }).limit(args.limit ?? 20)) as unknown as ThreadRow[]

  return {
    threads: rows.map((t) => {
      const cards = t.thread_cards
        .flatMap((tc) => (tc.cards ? [tc.cards] : []))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
      // A thread opens through its newest idea: the idea page shows the thread (apps/mobile/app/idea/[id].tsx).
      const latest = cards[0]
      return {
        id: t.id,
        name: clean(t.title, 200),
        stage: t.stage,
        returns: t.return_count,
        last_return_at: t.last_seen,
        top_cards: cards.slice(0, 3).map(toCard),
        cite: latest ? { recording_id: latest.recording_id, ms: latest.play_from_ms } : null,
        ...threadLink(t.id),
      }
    }),
  }
}

// ── list_actions ─────────────────────────────────────────────────────────────────────────────────────────────
export async function listActions(creatorId: string, args: { status?: 'open' | 'done'; due_before?: string; limit?: number }) {
  let q = db().from('actions').select(ACTION_COLUMNS).eq('creator_id', creatorId)
  if (args.status) q = q.eq('done', args.status === 'done')
  if (args.due_before) q = q.lt('due_date', args.due_before.slice(0, 10))
  const rows = check(
    await q.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(args.limit ?? 30)
  ) as unknown as ActionRow[]
  return { actions: rows.map(toAction) }
}

// ── Sessions (the Mini / DJI long recordings, recordings.kind = 'session') ──────────────────────────────────
// Chapters and the quote bank are Job E and have no tables yet. Until then a session's chapters are its ideas in
// the order she said them (the Mini's own line: "every chapter an idea"), and its quotes are its idea and reference
// segments, clip_score = the energy of the idea made from that segment (null when none was).
type SessionRow = { id: string; title: string | null; duration_ms: number | null; recorded_at: string | null; received_at: string }

async function sessionCards(creatorId: string, recordingIds: string[]) {
  if (recordingIds.length === 0) return [] as CardRow[]
  return check(
    await db().from('cards').select(CARD_COLUMNS).eq('creator_id', creatorId).in('recording_id', recordingIds).order('play_from_ms')
  ) as unknown as CardRow[]
}

export async function listSessions(creatorId: string, args: { since: string; limit?: number }) {
  const rows = check(
    await db()
      .from('recordings')
      .select('id, title, duration_ms, recorded_at, received_at')
      .eq('creator_id', creatorId)
      .eq('kind', 'session')
      .eq('status', 'done')
      .gte('received_at', new Date(args.since).toISOString())
      .order('received_at', { ascending: false })
      .limit(args.limit ?? 10)
  ) as SessionRow[]
  const cards = await sessionCards(creatorId, rows.map((r) => r.id))

  return {
    sessions: rows.map((s) => {
      const chapters = cards
        .filter((c) => c.recording_id === s.id)
        .map((c) => ({ title: clean(c.title, 200), start_ms: c.play_from_ms, cite: { recording_id: s.id, ms: c.play_from_ms }, ...ideaLink(c.id) }))
      return {
        id: s.id,
        title: clean(s.title, 200),
        duration_ms: s.duration_ms,
        recorded_at: s.recorded_at ?? s.received_at,
        chapters,
        cite: { recording_id: s.id, ms: 0 },
        ...recordingLink(s.id),
      }
    }),
  }
}

export async function getSessionQuotes(creatorId: string, args: { session_id: string; limit?: number }) {
  const session = check(
    await db()
      .from('recordings')
      .select('id, kind')
      .eq('creator_id', creatorId)
      .eq('id', args.session_id)
      .maybeSingle()
  ) as { id: string; kind: string } | null
  if (!session) throw new McpError("I couldn't find that session in your Ivy.")
  if (session.kind !== 'session') throw new McpError('That recording is a voice memo, not a session. Ask for its idea or its transcript instead.')

  const segments = check(
    await db()
      .from('segments')
      .select('id, text, speaker, start_ms')
      .eq('creator_id', creatorId)
      .eq('recording_id', session.id)
      .in('type', ['idea', 'reference'])
      .order('start_ms')
  ) as { id: string; text: string; speaker: string | null; start_ms: number }[]
  const cards = check(
    await db().from('cards').select('id, segment_id, energy').eq('creator_id', creatorId).eq('recording_id', session.id)
  ) as { id: string; segment_id: string | null; energy: number | null }[]

  const quotes = segments.map((s) => {
    const card = cards.find((c) => c.segment_id === s.id)
    return {
      text: clean(s.text, 600),
      speaker: s.speaker,
      ms: s.start_ms,
      clip_score: card?.energy ?? null,
      cite: { recording_id: session.id, ms: s.start_ms },
      ...(card ? ideaLink(card.id) : recordingLink(session.id)),
    }
  })
  quotes.sort((a, b) => (b.clip_score ?? -1) - (a.clip_score ?? -1) || a.ms - b.ms)
  return { session_id: session.id, quotes: quotes.slice(0, args.limit ?? 10) }
}

// ── get_transcript ───────────────────────────────────────────────────────────────────────────────────────────
// The only tool that returns what she actually said, word for word — and only for the one recording asked for.
type Utterance = { start_ms: number; end_ms: number; speaker: string | null; text: string }

/** recordings.transcript is the pipeline's utterances (graph.ts), or Deepgram's raw response on a junk row. */
function utterancesOf(t: unknown): Utterance[] {
  if (Array.isArray(t)) {
    return t.flatMap((u) =>
      u && typeof u.text === 'string' && typeof u.start_ms === 'number'
        ? [{ start_ms: u.start_ms, end_ms: u.end_ms ?? u.start_ms, speaker: u.speaker ?? null, text: u.text }]
        : []
    )
  }
  const raw = (t as { results?: { utterances?: { start: number; end: number; speaker?: number; transcript: string }[] } } | null)?.results
  return (raw?.utterances ?? []).map((u) => ({
    start_ms: Math.round(u.start * 1000),
    end_ms: Math.round(u.end * 1000),
    speaker: u.speaker === undefined ? null : String(u.speaker),
    text: u.transcript,
  }))
}

export async function getTranscript(creatorId: string, args: { recording_id: string }) {
  const rec = check(
    await db()
      .from('recordings')
      .select('id, title, kind, status, transcript, recorded_at, received_at')
      .eq('creator_id', creatorId)
      .eq('id', args.recording_id)
      .maybeSingle()
  ) as { id: string; title: string | null; kind: string; status: string; transcript: unknown; recorded_at: string | null; received_at: string } | null
  if (!rec) throw new McpError("I couldn't find that recording in your Ivy.")
  if (rec.status === 'queued' || rec.status === 'processing') throw new McpError('Ivy is still listening to that one. Try again in a minute.')

  const first = check(
    await db().from('cards').select('id').eq('creator_id', creatorId).eq('recording_id', rec.id).order('play_from_ms').limit(1)
  ) as { id: string }[]

  return {
    recording_id: rec.id,
    title: clean(rec.title, 200),
    kind: rec.kind,
    recorded_at: rec.recorded_at ?? rec.received_at,
    utterances: utterancesOf(rec.transcript).map((u) => ({ ...u, text: clean(u.text, 4000) })),
    cite: { recording_id: rec.id, ms: 0 },
    ...recordingLink(rec.id),
  }
}
