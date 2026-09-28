// POST /oauth/register — dynamic client registration (RFC 7591) for clients that can't use a client ID metadata
// document. Open by design; lib/oauth/clients.ts caps the rate and checks every redirect URI.
import { ClientError, registerClient } from '@/lib/oauth/clients'
import { json, oauthError } from '@/lib/oauth/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body)) return oauthError('invalid_client_metadata', 'Send the client metadata as a JSON object.')
  try {
    return json(await registerClient(body), 201)
  } catch (err) {
    if (err instanceof ClientError) return oauthError(err.code, err.message, err.code === 'temporarily_unavailable' ? 429 : 400)
    console.error('[oauth/register]', err)
    return oauthError('server_error', 'Registration failed. Try again.', 500)
  }
}
