// POST /oauth/revoke — RFC 7009. Revokes the grant an access or refresh token belongs to (either token ends both).
//
// A public client (token_endpoint_auth_method none — Muse registers as one) may send just the token: RFC 7009 asks
// for client authentication only from clients that have credentials, and the token is the proof. Until 28 Sep this
// endpoint demanded a client_id from everyone, so Muse's revoke got 401 and its grant stayed live. A client that
// does present credentials must pass them, and then only its own grants are touched; a confidential client's grant
// can't be revoked without its secret. Every other outcome is 200, known token or not (§2.2).
// Each request is logged by shape (lib/oauth/server.ts logOAuthRequest), never by secret.

import { authenticateClient, ClientError, presentedCredentials } from '@/lib/oauth/clients'
import { logOAuthRequest, oauthError, readParams } from '@/lib/oauth/server'
import { revokeToken } from '@/lib/oauth/tokens'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const params = await readParams(req)
  const presented = presentedCredentials(req, params)
  const log = (extra: Record<string, unknown>) => logOAuthRequest('revoke', req, params, { client_auth: presented.via ?? 'none', ...extra })
  try {
    const client = presented.via ? await authenticateClient(req, params) : null
    if (!params.token) {
      log({ outcome: 'invalid_request' })
      return oauthError('invalid_request', 'token is required.')
    }
    const outcome = await revokeToken(client, params.token)
    log({ outcome, client_id: client?.client_id ?? params.client_id })
    if (outcome === 'client_auth_required') return oauthError('invalid_client', 'This client must authenticate to revoke its tokens.', 401)
    return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof ClientError) {
      log({ outcome: 'invalid_client', reason: err.message })
      return oauthError(err.code, err.message, 401)
    }
    console.error('[oauth/revoke]', err)
    return oauthError('server_error', 'Revocation failed. Try again.', 500)
  }
}
