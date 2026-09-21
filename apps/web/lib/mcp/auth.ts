// apps/web/lib/mcp/auth.ts
// API-key auth for the MCP server. Lifted from gamesfield-app lib/mcp/handlers.ts:11-28 (resolveApiKey)
// per docs/lift-list.md. Prefix is `iv_`, not `gf_`.
//
// This is rule 6's outer edge: "any tool out via MCP; the graph is never exposed to a competitor's app."
// A key identifies one creator and nothing else — every handler must scope its queries by the returned id.

import { createHash, randomBytes } from 'crypto'
import { supabaseAdmin } from '../supabase'

export const API_KEY_PREFIX = 'iv_'

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** Mint a new key. The raw value is returned once and never stored. */
export function generateApiKey(): { raw: string; hash: string } {
  const raw = API_KEY_PREFIX + randomBytes(32).toString('hex')
  return { raw, hash: hashApiKey(raw) }
}

/**
 * Resolve a bearer token to a creator id, or null.
 * Service role by necessity: the caller is an external tool with an API key, not a Clerk session,
 * so there is no user JWT for RLS to act on.
 */
export async function resolveApiKey(apiKey: string): Promise<{ creatorId: string } | null> {
  const supabase = supabaseAdmin()
  const keyHash = hashApiKey(apiKey)

  const { data, error } = await supabase
    .from('api_keys')
    .select('creator_id, revoked_at')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (error || !data || data.revoked_at) return null

  // Fire-and-forget last-used bump; never block the call on it.
  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('key_hash', keyHash)

  return { creatorId: data.creator_id }
}
