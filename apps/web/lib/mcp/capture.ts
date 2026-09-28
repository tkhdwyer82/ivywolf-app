// apps/web/lib/mcp/capture.ts
// capture_idea — the connector's one write (Job F §2 rule 2). A ramble from Muse becomes a text recording (0026:
// source 'muse', kind 'text', no audio) and goes through the same pipeline as ⊕: claimed, then processed after the
// response by classify_v6's text path (packages/pipeline/process.ts). Its cards land in Home like any other.
//
// Nothing else is written, and nothing is generated on Muse's say-so: no boards, no takes, no credits. The text is
// her words as Muse passed them — stored as data, classified like a memo, never executed.

import { after } from 'next/server'
import { claimRecording, markFailed, processRecording, textUtterances } from '@ivywolf/pipeline'
import { supabaseAdmin } from '../supabase'
import { clean, McpError, type Link } from './handlers'

const notes = (): Link => ({ link: 'ivywolf://notes', web_link: 'https://app.ivywolf.com.au/notes' })

export async function captureIdea(
  creatorId: string,
  args: { text: string; idempotency_key: string; context?: string }
): Promise<{ recording_id: string; status: 'queued' } & Link> {
  const text = clean(args.text, Number.MAX_SAFE_INTEGER) ?? ''
  const utterances = textUtterances(text)
  if (utterances.length === 0) throw new McpError("There's nothing in that idea to add. Say it again with the words in.")

  const db = supabaseAdmin()

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
      meta: { text, context: clean(args.context ?? null, 120), idempotency_key: args.idempotency_key },
    })
    .select('id')
    .single()
  if (error || !rec) throw new Error(`capture insert: ${error?.message ?? 'no row'}`)

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
