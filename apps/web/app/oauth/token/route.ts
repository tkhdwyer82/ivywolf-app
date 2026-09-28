// POST /oauth/token — codes and refresh tokens for tokens (OAuth 2.1).
//
// authorization_code: the code's client, redirect URI and resource must match what was authorized, the PKCE
//   verifier must hash to the challenge, and the code works once. A second use revokes the grant the first made
//   (it means the code leaked). The grant is a creator_api_keys row (lib/oauth/tokens.ts), so it's live on /mcp at
//   once and listed in Connect your Muse.
// refresh_token: rotated on every use; may narrow scope, never widen it; dead once the grant is revoked.

import { authenticateClient, ClientError } from '@/lib/oauth/clients'
import { json, logOAuthRequest, oauthError, origin, parseScopes, pkceMatches, readParams, resourceOf, sha256 } from '@/lib/oauth/server'
import { issueGrant, refreshGrant, revokeGrant } from '@/lib/oauth/tokens'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

/** Every token request is logged by shape and outcome (never the code, verifier, tokens or secret). */
export async function POST(req: Request) {
  const params = await readParams(req)
  const res = await exchange(req, params)
  const body = res.status === 200 ? null : ((await res.clone().json().catch(() => null)) as { error?: string } | null)
  logOAuthRequest('token', req, params, { status: res.status, error: body?.error })
  return res
}

async function exchange(req: Request, params: Record<string, string>): Promise<Response> {
  let client
  try {
    client = await authenticateClient(req, params)
  } catch (err) {
    if (err instanceof ClientError) return oauthError('invalid_client', err.message, 401)
    throw err
  }
  const issuer = origin(req)

  if (params.grant_type === 'refresh_token') {
    if (!params.refresh_token) return oauthError('invalid_request', 'refresh_token is required.')
    const scope = params.scope ? parseScopes(params.scope) : null
    if (params.scope && !scope) return oauthError('invalid_scope', 'Ivy offers ideas:read and ideas:capture.')
    const out = await refreshGrant(client, params.refresh_token, scope)
    return out ? json(out) : oauthError('invalid_grant', 'That refresh token is no longer valid. Connect again.')
  }

  if (params.grant_type !== 'authorization_code') {
    return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.')
  }
  const { code, code_verifier: verifier, redirect_uri: redirectUri, resource } = params
  if (!code || !verifier) return oauthError('invalid_request', 'code and code_verifier are required.')

  const db = supabaseAdmin()
  const { data: row } = await db
    .from('oauth_authorizations')
    .select('id, creator_id, client_id, redirect_uri, code_challenge, granted_scopes, resource, expires_at, used_at, key_id')
    .eq('code_hash', sha256(code))
    .maybeSingle()
  const invalid = () => oauthError('invalid_grant', 'That authorization code is not valid. Connect again.')
  if (!row || row.client_id !== client.client_id) return invalid()
  if (row.used_at) {
    if (row.key_id) await revokeGrant(row.key_id)
    return invalid()
  }
  if (new Date(row.expires_at).getTime() < Date.now()) return invalid()
  if (redirectUri !== undefined && redirectUri !== row.redirect_uri) return invalid()
  if (resource && resource.replace(/\/$/, '') !== (row.resource ?? resourceOf(issuer))) {
    return oauthError('invalid_target', `The resource must be ${row.resource ?? resourceOf(issuer)}.`)
  }
  if (!pkceMatches(verifier, row.code_challenge)) return oauthError('invalid_grant', "The code verifier doesn't match.")

  // One use: only the caller that sets used_at gets tokens.
  const { data: claimed } = await db
    .from('oauth_authorizations')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('used_at', null)
    .select('id')
  if (!claimed?.length) return invalid()

  const { keyId, response } = await issueGrant(row.creator_id, client, row.granted_scopes as string[])
  await db.from('oauth_authorizations').update({ key_id: keyId }).eq('id', row.id)
  return json(response)
}
