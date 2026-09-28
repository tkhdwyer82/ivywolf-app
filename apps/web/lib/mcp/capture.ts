// apps/web/lib/mcp/capture.ts
// capture_idea — the connector's one write (Job F §2 rule 2). A ramble from Muse becomes a text recording (0026:
// source 'muse', kind 'text', no audio) and goes through the same pipeline as ⊕: claimed, then processed after the
// response by classify_v6's text path (packages/pipeline/process.ts). Its cards land in Home like any other.
//
// Nothing else is written, and nothing is generated on Muse's say-so: no boards, no takes, no credits. The text is
// her words as Muse passed them — stored as data, classified like a memo, never executed.
//
// Idempotent (§2 rule 6): agents retry. The (creator, idempotency_key) pair is claimed in capture_idempotency (0025)
// before the recording is written, so a retry — even one racing the first call — gets the first recording back
// instead of a second copy of the idea.

import { createHash } from 'crypto'
import { after } from 'next/server'
import { claimRecording, markFailed, processRecording, textUtterances } from '@ivywolf/pipeline'
import { supabaseAdmin } from '../supabase'
import { clean, McpError, type Link } from './handlers'

const notes = (): Link => ({ link: 'ivywolf://notes', web_link: 'https://app.ivywolf.com.au/notes' })

/** A claim older than this with no recording is from a call that died between claiming and writing. */
const STALE_CLAIM_MS = 60_000

type Captured = { recording_id: string; status: string; replayed?: true } & Link

export async function captureIdea(
  creatorId: string,
  args: { text: string; idempotency_key: string; context?: string }
): Promise<Captured> {
  const text = clean(args.text, Number.MAX_SAFE_INTEGER) ?? ''
  const utterances = textUtterances(text)
  if (utterances.length === 0) throw new McpError("There's nothing in that idea to add. Say it again with the words in.")

  const db = supabaseAdmin()
  const textHash = createHash('sha256').update(text).digest('hex')
  const key = args.idempotency_key

  // ── Claim the key, or answer with what it already filed ──────────────────────────────────────────────────
  for (let attempt = 0; ; attempt++) {
    const claim = await db.from('capture_idempotency').insert({ creator_id: creatorId, key, text_hash: textHash })
    if (!claim.error) break
    if (claim.error.code !== '23505') throw new Error(`capture claim: ${claim.error.message}`)

    const { data: prior } = await db
      .from('capture_idempotency')
      .select('text_hash, recording_id, created_at, recordings(status)')
      .eq('creator_id', creatorId)
      .eq('key', key)
      .maybeSingle()
    const p = prior as { text_hash: string; recording_id: string | null; created_at: string; recordings: { status: string } | null } | null
    if (p && p.text_hash !== textHash) {
      throw new McpError('That idempotency key was already used for a different idea. Send a new key for a new idea.')
    }
    if (p?.recording_id) return { recording_id: p.recording_id, status: p.recordings?.status ?? 'queued', replayed: true, ...notes() }
    if (attempt > 0) throw new McpError("Ivy is already adding that idea. It'll be in Home in a minute.")
    if (p && Date.now() - new Date(p.created_at).getTime() < STALE_CLAIM_MS) {
      throw new McpError("Ivy is already adding that idea. It'll be in Home in a minute.")
    }
    // Gone (its recording was deleted) or stale: clear it and claim again, once.
    await db.from('capture_idempotency').delete().eq('creator_id', creatorId).eq('key', key).is('recording_id', null)
  }

  // Her zone as her phone last reported it, so "for Thursday" resolves against her day, not the server's (0009).
  const { data: last } = await db
    .from('recordings')
    .select('recorded_tz')
    .eq('creator_id', creatorId)
    .not('recorded_tz', 'is', null)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: rec, error } = await db
    .from('recordings')
    .insert({
      creator_id: creatorId,
      source: 'muse',
      kind: 'text',
      storage_path: null,
      trigger: 'muse',
      recorded_at: new Date().toISOString(),
      recorded_tz: last?.recorded_tz ?? null,
      transcript: utterances,
      meta: { text, context: clean(args.context ?? null, 120) },
    })
    .select('id')
    .single()
  if (error || !rec) {
    // Release the key so her agent's retry can file it.
    await db.from('capture_idempotency').delete().eq('creator_id', creatorId).eq('key', key)
    throw new Error(`capture insert: ${error?.message ?? 'no row'}`)
  }
  const bound = await db.from('capture_idempotency').update({ recording_id: rec.id }).eq('creator_id', creatorId).eq('key', key)
  if (bound.error) console.warn(`[mcp/capture] ${rec.id}: idempotency key not bound: ${bound.error.message}`)

  // Enqueue as the process route does: claim (queued → processing) then run after the response.
  if (await claimRecording(rec.id)) {
    after(async () => {
      try {
        await processRecording(rec.id)
      } catch (err) {
        console.error(`[mcp/capture] ${rec.id} failed:`, err)
        await markFailed(rec.id, err instanceof Error ? err.message : String(err)).catch(() => {})
      }
    })
  }

  return { recording_id: rec.id, status: 'queued', ...notes() }
}
