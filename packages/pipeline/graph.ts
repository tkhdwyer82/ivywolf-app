// packages/pipeline/graph.ts
// Writes one classified recording into the graph tables. Service role — this is the pipeline worker, the only
// server code besides the Stripe webhook allowed to bypass RLS (see 0001_graph.sql header).

import { createClient } from '@supabase/supabase-js'
import type { ClassifyOutput } from '@ivywolf/schema'
import type { CreatorContext } from './classify'

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

export async function markJunk(recordingId: string, reason: 'no_speech' | 'too_short', transcript: unknown) {
  check(
    'junk',
    await db()
      .from('recordings')
      .update({ is_junk: true, junk_reason: reason, transcript })
      .eq('id', recordingId)
  )
}

/** Insert segments, then everything that points at a segment. Returns the new card ids. */
export async function writeClassification(args: {
  creatorId: string
  recordingId: string
  transcript: unknown
  out: ClassifyOutput
  promptVersion: string
}): Promise<{ cardIds: string[] }> {
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

  return { cardIds: (cards ?? []).map((c) => c.id) }
}
