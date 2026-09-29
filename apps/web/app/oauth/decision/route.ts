// POST /oauth/decision — the consent page's form. Allow: a one-time code for the scopes she left ticked, bound to
// the PKCE challenge, back to the client's verified redirect URI. Don't allow (or nothing ticked): access_denied.
//
// The authorization id is the form's only reference, and it's honoured only for the signed-in creator it was made
// for, undecided and unexpired — so a forged post can only ever decide her own pending request.

import { auth } from '@clerk/nextjs/server'
import { errorPage, redirectCode, redirectError } from '@/lib/oauth/respond'
import { CODE_TTL_MS, origin, sha256, token } from '@/lib/oauth/server'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return errorPage('Sign in again', 'Your Ivy sign-in ended. Go back to the app and connect again.', 401)

  const form = await req.formData()
  const id = String(form.get('id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return errorPage('This link has expired', 'Go back to the app and connect again.')
  const ticked = form.getAll('scope').map(String)
  const allow = form.get('decision') === 'allow'

  const db = supabaseAdmin()
  const { data: row } = await db
    .from('oauth_authorizations')
    .select('id, creator_id, redirect_uri, requested_scopes, state, expires_at, decided_at')
    .eq('id', id)
    .maybeSingle()
  if (!row || row.creator_id !== userId || row.decided_at || new Date(row.expires_at).getTime() < Date.now()) {
    return errorPage('This link has expired', 'Go back to the app and connect again.')
  }

  const issuer = origin(req)
  const granted = (row.requested_scopes as string[]).filter((s) => ticked.includes(s))
  const now = new Date().toISOString()

  if (!allow || granted.length === 0) {
    await db.from('oauth_authorizations').update({ decided_at: now, granted_scopes: [] }).eq('id', id).is('decided_at', null)
    return redirectError(row.redirect_uri, issuer, 'access_denied', 'Access was not allowed.', row.state, 303)
  }

  const code = token('iv_ac_')
  const { data: decided } = await db
    .from('oauth_authorizations')
    .update({ decided_at: now, granted_scopes: granted, code_hash: sha256(code), expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() })
    .eq('id', id)
    .is('decided_at', null)
    .select('id')
  if (!decided?.length) return errorPage('This link has expired', 'Go back to the app and connect again.')

  return redirectCode(row.redirect_uri, issuer, code, row.state)
}
