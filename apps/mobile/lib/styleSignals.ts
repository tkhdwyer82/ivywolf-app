// apps/mobile/lib/styleSignals.ts
// Her taste as events (0028 style_signals). One writer: write_style_signal(kind, payload) in Postgres, which this
// calls — Job D's take picks use it; More ideas reaches it through the suggestion_signals bridge (0032), not here.
// payload.field and payload.source are lifted into their own columns; the whole payload is kept.
// Pinterest terms, rule 2 (packages/schema/pinterest.ts): pins are never inputs to style_signals — a signal whose
// source is Pinterest is dropped here, before it reaches Postgres, and returns 0.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isPinterestSource } from '@ivywolf/schema'

export type StyleSignalKind =
  | 'suggestion_pin'
  | 'suggestion_dismiss'
  | 'suggestion_hide'
  | 'suggestion_open'
  | 'suggestion_play_why'
  | 'take_pick'
  | (string & {})

export async function writeStyleSignal(
  supabase: SupabaseClient,
  kind: StyleSignalKind,
  payload: { field?: string; source?: string } & Record<string, unknown> = {}
): Promise<number> {
  if (isPinterestSource(payload.source)) return 0
  const { data, error } = await supabase.rpc('write_style_signal', { p_kind: kind, p_payload: payload })
  if (error) throw new Error(`style signal: ${error.message}`)
  return data as number
}
