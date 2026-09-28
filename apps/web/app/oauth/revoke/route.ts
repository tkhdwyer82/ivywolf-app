// POST /oauth/revoke — RFC 7009. The grant an access or refresh token belongs to is revoked, if it's the calling
// client's. Always 200 for a well-formed request, whether or not the token was known.
import { authenticateClient, ClientError } from '@/lib/oauth/clients'
import { oauthError, readParams } from '@/lib/oauth/server'
import { revokeToken } from '@/lib/oauth/tokens'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const params = await readParams(req)
  try {
    const client = await authenticateClient(req, params)
    if (params.token) await revokeToken(client, params.token)
    return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof ClientError) return oauthError(err.code, err.message, 401)
    console.error('[oauth/revoke]', err)
    return oauthError('server_error', 'Revocation failed. Try again.', 500)
  }
}
