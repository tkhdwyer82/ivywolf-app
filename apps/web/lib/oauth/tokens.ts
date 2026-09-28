// apps/web/lib/oauth/tokens.ts
// Grants: what a code or refresh token turns into. A grant is a creator_api_keys row with a client_id (0027), so the
// MCP route verifies an access token exactly as it does a pasted key (lib/mcp/auth.ts: hash lookup, scopes,
// revoked_at, expires_at), and Connect your Muse lists and revokes it with her keys.
//
// Tokens are opaque and stored hashed: iv_at_… (access) and iv_rt_… (refresh). Every refresh rotates both.

import { supabaseAdmin } from '../supabase'
import type { Client } from './clients'
import { ACCESS_TTL_S, sha256, token } from './server'

export type TokenResponse = {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

const expiry = () => new Date(Date.now() + ACCESS_TTL_S * 1000).toISOString()
const label = (client: Client) => client.client_name.slice(0, 60)

function pair(scopes: string[]): { access: string; refresh: string; response: TokenResponse } {
  const access = token('iv_at_')
  const refresh = token('iv_rt_')
  return {
    access,
    refresh,
    response: { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes.join(' ') },
  }
}

export async function issueGrant(creatorId: string, client: Client, scopes: string[]): Promise<{ keyId: string; response: TokenResponse }> {
  const t = pair(scopes)
  const { data, error } = await supabaseAdmin()
    .from('creator_api_keys')
    .insert({
      creator_id: creatorId,
      hash: sha256(t.access),
      refresh_hash: sha256(t.refresh),
      scopes,
      label: label(client),
      client_id: client.client_id,
      expires_at: expiry(),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`grant: ${error?.message ?? 'no row'}`)
  return { keyId: data.id, response: t.response }
}

/**
 * Refresh: the grant whose refresh token this is, for this client, not revoked → both tokens rotated in one
 * conditional update (a refresh token works once). A narrower `scope` may be asked for; never a wider one.
 */
export async function refreshGrant(client: Client, refreshToken: string, scope: string[] | null): Promise<TokenResponse | null> {
  const db = supabaseAdmin()
  const old = sha256(refreshToken)
  const { data: grant } = await db
    .from('creator_api_keys')
    .select('id, scopes')
    .eq('refresh_hash', old)
    .eq('client_id', client.client_id)
    .is('revoked_at', null)
    .maybeSingle()
  if (!grant) return null
  const scopes = scope ?? (grant.scopes as string[])
  if (scopes.some((s) => !(grant.scopes as string[]).includes(s))) return null

  const t = pair(scopes)
  const { data: rotated } = await db
    .from('creator_api_keys')
    .update({ hash: sha256(t.access), refresh_hash: sha256(t.refresh), scopes, expires_at: expiry() })
    .eq('id', grant.id)
    .eq('refresh_hash', old)
    .is('revoked_at', null)
    .select('id')
  return rotated?.length ? t.response : null
}

/** RFC 7009: revoke the grant an access or refresh token belongs to, if it's this client's. Silent either way. */
export async function revokeToken(client: Client, raw: string): Promise<void> {
  const h = sha256(raw)
  const db = supabaseAdmin()
  const now = new Date().toISOString()
  await db.from('creator_api_keys').update({ revoked_at: now }).eq('client_id', client.client_id).eq('hash', h).is('revoked_at', null)
  await db.from('creator_api_keys').update({ revoked_at: now }).eq('client_id', client.client_id).eq('refresh_hash', h).is('revoked_at', null)
}

/** A code used twice is a stolen code: the grant it was exchanged for is revoked (OAuth 2.1 §4.1.3). */
export async function revokeGrant(keyId: string): Promise<void> {
  await supabaseAdmin().from('creator_api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', keyId).is('revoked_at', null)
}
