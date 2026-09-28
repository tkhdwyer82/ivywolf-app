// apps/web/lib/mcp/log.ts
// agent_calls (0025): every tool call, logged apart from the app with source 'muse' (Job F §2 rule 7).
// The row is opened when the call starts (and the rate limit checked in the same step) and closed with how it went.
// Logging never fails a call.

import { supabaseAdmin } from '../supabase'

/** Arguments that are her words — never logged (0025 header). Everything else is the shape of the ask. */
const FREE_TEXT = new Set(['query', 'text', 'context', 'idempotency_key'])

export function paramsOf(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {}
  return Object.fromEntries(Object.entries(args).filter(([k, v]) => !FREE_TEXT.has(k) && (typeof v !== 'string' || v.length <= 64)))
}

/**
 * Rate limit and open the call's row in one step (0025 start_agent_call: 60 a minute per creator, 10 captures).
 * If the log can't be reached the call goes ahead unlogged and unlimited — the database it would count in is the
 * one that's failing, and the tool will say so itself.
 */
export async function startCall(
  creatorId: string,
  keyId: string | null,
  tool: string,
  args: unknown
): Promise<{ id: string | null; allowed: boolean }> {
  const { data, error } = await supabaseAdmin()
    .rpc('start_agent_call', { p_creator: creatorId, p_key: keyId, p_tool: tool, p_params: paramsOf(args) })
    .single<{ call_id: string; allowed: boolean }>()
  if (error || !data) {
    console.warn('[mcp] start_agent_call:', error?.message ?? 'no row')
    return { id: null, allowed: true }
  }
  return { id: data.call_id, allowed: data.allowed }
}

export async function finishCall(id: string | null, startedAt: number, ok: boolean, error: string | null) {
  if (!id) return
  const r = await supabaseAdmin()
    .from('agent_calls')
    .update({ ok, error, latency_ms: Math.round(performance.now() - startedAt) })
    .eq('id', id)
  if (r.error) console.warn('[mcp] agent_calls finish:', r.error.message)
}
