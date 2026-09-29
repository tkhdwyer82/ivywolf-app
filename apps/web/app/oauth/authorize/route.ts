// GET /oauth/authorize — the start of the authorization code flow (OAuth 2.1, PKCE S256 required).
//
// 1. The client and redirect URI are checked first. If either is wrong, the answer is a plain page here — never a
//    redirect, because an unchecked redirect_uri is exactly what an attacker would supply.
// 2. Everything else that's wrong goes back to the client as an OAuth error on its redirect URI (with iss, RFC 9207).
// 3. Signed out → Clerk's sign-in, which comes back here. Signed in → the request is saved (0027
//    oauth_authorizations, bound to her) and she's sent to the consent page to decide.
//
// Public in proxy.ts so this handler, not the middleware, decides what a signed-out visitor sees.

import { auth } from '@clerk/nextjs/server'
import { ClientError, getClient, redirectAllowed } from '@/lib/oauth/clients'
import { errorPage, redirectError } from '@/lib/oauth/respond'
import { origin, parseScopes, REQUEST_TTL_MS, resourceOf } from '@/lib/oauth/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPublicUrl } from 'mcp-handler'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const issuer = origin(req)
  const q = new URL(req.url).searchParams
  const clientId = q.get('client_id') ?? ''

  let client
  try {
    client = await getClient(clientId)
  } catch (err) {
    if (err instanceof ClientError) return errorPage("This app couldn't be identified", err.message)
    throw err
  }
  if (!client) return errorPage("This app isn't registered with Ivy", 'Ask the app to register again, then try connecting once more.')

  const redirectUri = q.get('redirect_uri') ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : '')
  if (!redirectUri || !redirectAllowed(client, redirectUri)) {
    return errorPage("This app's return address doesn't match", `${client.client_name} asked to send you back somewhere it didn't register, so Ivy stopped here.`)
  }

  const state = q.get('state')
  const fail = (error: string, description: string) => redirectError(redirectUri, issuer, error, description, state)
  if (q.get('response_type') !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported.')
  const challenge = q.get('code_challenge')
  if (!challenge || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return fail('invalid_request', 'A PKCE code_challenge is required.')
  if (q.get('code_challenge_method') !== 'S256') return fail('invalid_request', 'code_challenge_method must be S256.')
  const scopes = parseScopes(q.get('scope'))
  if (!scopes) return fail('invalid_scope', 'Ivy offers ideas:read and ideas:capture.')
  const resource = q.get('resource')
  if (resource && resource.replace(/\/$/, '') !== resourceOf(issuer)) return fail('invalid_target', `The resource must be ${resourceOf(issuer)}.`)

  const { userId } = await auth()
  if (!userId) {
    const back = getPublicUrl(req).toString()
    return Response.redirect(`${issuer}/sign-in?redirect_url=${encodeURIComponent(back)}`, 302)
  }

  const db = supabaseAdmin()
  // A reviewer (or anyone) may sign in here before ever opening the app: make her creator row, as the app does on
  // first record (lib/record.ts). Its trigger seeds My things and Ivy Mini.
  const creator = await db.from('creators').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
  if (creator.error) throw new Error(`creator: ${creator.error.message}`)

  const { data, error } = await db
    .from('oauth_authorizations')
    .insert({
      creator_id: userId,
      client_id: client.client_id,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      requested_scopes: scopes,
      state,
      resource: resource ?? resourceOf(issuer),
      expires_at: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`authorization: ${error?.message ?? 'no row'}`)

  return Response.redirect(`${issuer}/oauth/consent/${data.id}`, 302)
}
