// packages/pipeline/graph.ts
// Writes one classified recording into the graph tables. Service role — this is the pipeline worker, the only
// server code besides the Stripe webhook allowed to bypass RLS (see 0001_graph.sql header).

import { createClient } from '@supabase/supabase-js'
import type { ClassifyOutput } from '@ivywolf/schema'
import { randomUUID } from 'node:crypto'
import type { CreatorContext } from './classify'
import { cardText, embed } from './embed'
import {
  assignCards,
  mean,
  MERGE_PROPOSE_MIN,
  proposeMerges,
  type Assignment,
  type MergeProposal,
  type ThreadState,
} from './threading'

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

function check<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

/** check(), for queries that must return rows (select / insert…select). */
function need<T>(label: string, r: { data: T; error: { message: string } | null }): NonNullable<T> {
  const data = check(label, r)
  if (data === null || data === undefined) throw new Error(`${label}: no data returned`)
  return data
}

export async function loadCreatorContext(creatorId: string): Promise<CreatorContext> {
  const supabase = db()
  const creator = need(
    'creator',
    await supabase.from('creators').select('handle, niche').eq('id', creatorId).single()
  )
  const people = check(
    'entities',
    await supabase
      .from('entities')
      .select('canonical_name, aliases')
      .eq('creator_id', creatorId)
      .eq('kind', 'person')
  )
  const threads = check(
    'threads',
    await supabase
      .from('threads')
      .select('title')
      .eq('creator_id', creatorId)
      .order('last_seen', { ascending: false })
      .limit(20)
  )
  return {
    handle: creator.handle,
    niche: creator.niche,
    people: (people ?? []).map((p) => ({ canonical: p.canonical_name, aliases: p.aliases })),
    recent_thread_titles: (threads ?? []).map((t) => t.title),
  }
}

/**
 * Move a recording from 'queued' to 'processing'. True only for the one caller that won — this is the lock
 * against duplicate submits (see 0006_recording_status.sql).
 */
export async function claimRecording(recordingId: string): Promise<boolean> {
  return check('claim', await db().rpc('claim_recording', { p_recording_id: recordingId })) === true
}

export async function markJunk(recordingId: string, reason: 'no_speech' | 'too_short', transcript: unknown) {
  check(
    'junk',
    await db()
      .from('recordings')
      .update({ is_junk: true, junk_reason: reason, transcript, status: 'junk' })
      .eq('id', recordingId)
  )
}

export async function markDone(recordingId: string) {
  check('done', await db().from('recordings').update({ status: 'done' }).eq('id', recordingId))
}

/** 'failed' is terminal: graph writes aren't transactional, so a half-written recording must not be re-run. */
export async function markFailed(recordingId: string, error: string) {
  check(
    'failed',
    await db()
      .from('recordings')
      .update({ status: 'failed', processing_error: error.slice(0, 2000) })
      .eq('id', recordingId)
  )
}

/** Insert segments, then everything that points at a segment. Returns the new cards. */
export async function writeClassification(args: {
  creatorId: string
  recordingId: string
  transcript: unknown
  out: ClassifyOutput
  promptVersion: string
}): Promise<{ cards: { id: string; title: string; gist: string; candidateThreads: string[] }[] }> {
  const { creatorId, recordingId, out } = args
  const supabase = db()

  check(
    'recording',
    await supabase
      .from('recordings')
      .update({
        title: out.title,
        transcript: args.transcript,
        trigger: out.trigger === 'wake_word' ? 'wake_word' : undefined,
        meta: { prompt_version: args.promptVersion, style_signals: out.style_signals },
      })
      .eq('id', recordingId)
  )

  const segRows = need(
    'segments',
    await supabase
      .from('segments')
      .insert(
        out.segments.map((s) => ({
          recording_id: recordingId,
          creator_id: creatorId,
          type: s.type,
          start_ms: s.start_ms,
          end_ms: s.end_ms,
          text: s.text,
          speaker: s.speaker,
          confidence: s.confidence,
          boundary_marker: s.boundary_marker,
        }))
      )
      .select('id')
  )
  // Insert order is preserved by PostgREST, so index i here is segment i in the classifier output.
  const segId = (i: number) => segRows[i]?.id ?? null

  for (const [i, s] of out.segments.entries()) {
    if (s.type === 'retracted' && s.retracted_by !== null && segId(s.retracted_by)) {
      check(
        'retracted_by',
        await supabase.from('segments').update({ retracted_by: segId(s.retracted_by) }).eq('id', segId(i))
      )
    }
  }

  const cards = out.cards.length
    ? check(
        'cards',
        await supabase
          .from('cards')
          .insert(
            out.cards.map((c) => ({
              creator_id: creatorId,
              recording_id: recordingId,
              segment_id: segId(c.segment_index),
              title: c.title,
              gist: c.gist,
              play_from_ms: c.play_from_ms,
              confidence: c.confidence,
              energy: c.energy,
              is_reference: c.is_reference,
            }))
          )
          .select('id')
      )
    : []

  if (out.actions.length) {
    check(
      'actions',
      await supabase.from('actions').insert(
        out.actions.map((a) => ({
          creator_id: creatorId,
          recording_id: recordingId,
          segment_id: segId(a.segment_index),
          text: a.text,
          scope: a.scope,
          priority: a.priority,
          due_date: a.due_date,
        }))
      )
    )
  }

  if (out.loose_ends.length) {
    check(
      'loose_ends',
      await supabase.from('loose_ends').insert(
        out.loose_ends.map((l) => ({
          creator_id: creatorId,
          recording_id: recordingId,
          segment_id: segId(l.segment_index),
          text: l.text,
          needs: l.needs,
        }))
      )
    )
  }

  if (out.requests.length) {
    check(
      'requests',
      await supabase.from('requests').insert(
        out.requests.map((r) => ({
          creator_id: creatorId,
          recording_id: recordingId,
          segment_id: segId(r.segment_index),
          kind: r.kind,
          text: r.text,
        }))
      )
    )
  }

  // Entities: unknown names are recorded unresolved under the name heard; known ones gain the aliases seen.
  for (const e of out.entities) {
    const name = e.canonical ?? e.name
    const existing = check(
      'entity lookup',
      await supabase
        .from('entities')
        .select('id, aliases')
        .eq('creator_id', creatorId)
        .eq('canonical_name', name)
        .maybeSingle()
    )
    const aliases = [...new Set([...(existing?.aliases ?? []), ...e.aliases_seen])]
    check(
      'entity upsert',
      await supabase.from('entities').upsert(
        { creator_id: creatorId, kind: e.kind, canonical_name: name, aliases, resolved: e.canonical !== null },
        { onConflict: 'creator_id,canonical_name' }
      )
    )
  }

  // Insert order is preserved, so cards[i] is out.cards[i].
  return {
    cards: (cards ?? []).map((c, i) => ({
      id: c.id,
      title: out.cards[i].title,
      gist: out.cards[i].gist,
      candidateThreads: out.cards[i].candidate_threads,
    })),
  }
}

/** pgvector columns come back from PostgREST as text: "[0.1,0.2,…]". */
const parseVector = (v: unknown): number[] | null =>
  typeof v === 'string' ? (JSON.parse(v) as number[]) : Array.isArray(v) ? (v as number[]) : null
const toVector = (v: number[]) => `[${v.join(',')}]`

export interface ThreadingResult {
  assignments: Assignment[]
  merges: MergeProposal[]
}

/**
 * Thread identity for a recording's new cards (CA2): embed, attach to the nearest thread or start one, move the
 * centroids, and propose merges across threads. Uses the same pure functions as the eval (threading.ts).
 * Loads the creator's whole card set — fine at pilot scale; move the nearest-thread search into SQL (the HNSW
 * index on cards.embedding) when creators have thousands of cards.
 */
export async function threadNewCards(
  creatorId: string,
  cards: { id: string; title: string; gist: string; candidateThreads: string[] }[]
): Promise<ThreadingResult> {
  if (cards.length === 0) return { assignments: [], merges: [] }
  const supabase = db()

  const vectors = await embed(cards.map(cardText))
  for (const [i, card] of cards.entries()) {
    check('card embedding', await supabase.from('cards').update({ embedding: toVector(vectors[i]) }).eq('id', card.id))
  }

  const existing = need(
    'threads',
    await supabase
      .from('threads')
      .select('id, title, thread_cards(cards(id, embedding))')
      .eq('creator_id', creatorId)
  )
  const threads: ThreadState[] = existing.map((t) => ({
    id: t.id,
    title: t.title,
    cards: (t.thread_cards as unknown as { cards: { id: string; embedding: unknown } | null }[]).flatMap((tc) => {
      const e = tc.cards ? parseVector(tc.cards.embedding) : null
      return tc.cards && e ? [{ id: tc.cards.id, embedding: e }] : []
    }),
  })).filter((t) => t.cards.length > 0)

  const assignments = assignCards(
    cards.map((c, i) => ({ id: c.id, title: c.title, embedding: vectors[i], candidateThreads: c.candidateThreads })),
    threads,
    () => randomUUID()
  )

  const now = new Date().toISOString()
  for (const a of assignments) {
    const thread = threads.find((t) => t.id === a.threadId)!
    if (a.created) {
      check('thread insert', await supabase.from('threads').insert({ id: a.threadId, creator_id: creatorId, title: thread.title }))
    } else {
      const current = need('thread', await supabase.from('threads').select('return_count').eq('id', a.threadId).single())
      check(
        'thread bump',
        await supabase
          .from('threads')
          .update({ return_count: current.return_count + 1, last_seen: now })
          .eq('id', a.threadId)
      )
    }
    check('thread_cards', await supabase.from('thread_cards').insert({ thread_id: a.threadId, card_id: a.cardId }))
  }

  // Centroids of every thread that gained a card.
  for (const id of new Set(assignments.map((a) => a.threadId))) {
    const t = threads.find((x) => x.id === id)!
    check(
      'thread centroid',
      await supabase.from('threads').update({ embedding: toVector(mean(t.cards.map((c) => c.embedding))) }).eq('id', id)
    )
  }

  const merges = proposeMerges(new Set(cards.map((c) => c.id)), threads)
  for (const m of merges) {
    const { error } = await supabase.from('merge_suggestions').insert({
      creator_id: creatorId,
      a_card_id: m.aCardId,
      b_card_id: m.bCardId,
      similarity: m.similarity,
      rationale: `cards in different threads, cosine ${m.similarity.toFixed(3)} ≥ ${MERGE_PROPOSE_MIN}`,
    })
    // 23505: this pair was already proposed (merge_suggestions_pair_idx, either order).
    if (error && error.code !== '23505') throw new Error(`merge_suggestions: ${error.message}`)
  }
  return { assignments, merges }
}
