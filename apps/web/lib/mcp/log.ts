// apps/web/lib/mcp/log.ts
// agent_calls (0025): every tool call, logged apart from the app with source 'muse' (Job F §2 rule 7).
// The row is opened when the call starts and closed with how it went. Logging never fails a call.

import { supabaseAdmin } from '../supabase'

/** Arguments that are her words — never logged (0025 header). Everything else is the shape of the ask. */
const FREE_TEXT = new Set(['query', 'text', 'context', 'idempotency_key'])

export function paramsOf(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {}
  return Object.fromEntries(Object.entries(args).filter(([k, v]) => !FREE_TEXT.has(k) && (typeof v !== 'string' || v.length <= 64)))
}

export async function startCall(creatorId: string, keyId: string | null, tool: string, args: unknown): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('agent_calls')
    .insert({ creator_id: creatorId, key_id: keyId, tool, params: paramsOf(args) })
    .select('id')
    .single()
  if (error) console.warn('[mcp] agent_calls start:', error.message)
  return data?.id ?? null
}

export async function finishCall(id: string | null, startedAt: number, ok: boolean, error: string | null) {
  if (!id) return
  const r = await supabaseAdmin()
    .from('agent_calls')
    .update({ ok, error, latency_ms: Math.round(performance.now() - startedAt) })
    .eq('id', id)
  if (r.error) console.warn('[mcp] agent_calls finish:', r.error.message)
}
