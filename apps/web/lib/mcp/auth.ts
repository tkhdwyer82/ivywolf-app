// apps/web/lib/mcp/auth.ts
// API-key auth for the MCP server. Lifted from gamesfield-app lib/mcp/handlers.ts:11-28 (resolveApiKey)
// per docs/lift-list.md. Prefix is `iv_`, not `gf_`.
//
// This is rule 6's outer edge: "any tool out via MCP; the graph is never exposed to a competitor's app."
// A key identifies one creator and nothing else — every handler must scope its queries by the returned id.

import { createHash, randomBytes } from 'crypto'
import type { AuthInfo } from '@modelcontextprotocol/server'
import { supabaseAdmin } from '../supabase'

export const API_KEY_PREFIX = 'iv_'

/** Job F §2 rule 4: two scopes. Sessions and chapters are part of ideas:read. */
export type Scope = 'ideas:read' | 'ideas:capture'

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/** Mint a new key. The raw value is returned once and never stored. */
export function generateApiKey(): { raw: string; hash: string } {
  const raw = API_KEY_PREFIX + randomBytes(32).toString('hex')
  return { raw, hash: hashApiKey(raw) }
}

export const SCOPES: readonly Scope[] = ['ideas:read', 'ideas:capture']

/** The consent words (Job F §4), shown wherever she grants a scope: the app's Connect your Muse and the web consent page. */
export const SCOPE_WORDS: Record<Scope, string> = {
  'ideas:read': 'Let Muse read your ideas',
  'ideas:capture': 'Let Muse add ideas to Ivy',
}

/**
 * Resolve a bearer token — a pasted key, or an OAuth access token (0027: a key row with a client_id and an expiry)
 * — to a creator id and its scopes, or null.
 * Service role by necessity: the caller is an external tool with an API key, not a Clerk session,
 * so there is no user JWT for RLS to act on.
 */
export async function resolveApiKey(apiKey: string): Promise<{ keyId: string; creatorId: string; scopes: Scope[] } | null> {
  const supabase = supabaseAdmin()
  const keyHash = hashApiKey(apiKey)

  const { data, error } = await supabase
    .from('creator_api_keys')
    .select('id, creator_id, scopes, revoked_at, expires_at')
    .eq('hash', keyHash)
    .maybeSingle()

  if (error || !data || data.revoked_at) return null
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null

  // Last-used bump; never block the call on it. A supabase-js query only runs once it's awaited or .then()'d —
  // Gamesfield's `void supabase.from(…).update(…)` never sent anything, so last_used_at was never set.
  supabase
    .from('creator_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(({ error }) => error && console.warn('[mcp] last_used_at:', error.message))

  const scopes = (data.scopes as string[]).filter((s): s is Scope => (SCOPES as string[]).includes(s))
  return { keyId: data.id, creatorId: data.creator_id, scopes }
}

/**
 * The MCP route's verifier (mcp-handler withMcpAuth): bearer key → AuthInfo, or undefined → 401.
 * The creator id rides in `extra`; tools read it from ctx.http.authInfo and never from the request.
 */
export async function verifyBearer(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer?.startsWith(API_KEY_PREFIX)) return undefined
  const key = await resolveApiKey(bearer)
  if (!key) return undefined
  return { token: bearer, clientId: `api_key:${key.keyId}`, scopes: key.scopes, extra: { creatorId: key.creatorId, keyId: key.keyId } }
}

export const scopesOf = (auth: { scopes: string[] } | undefined): string[] => auth?.scopes ?? []
