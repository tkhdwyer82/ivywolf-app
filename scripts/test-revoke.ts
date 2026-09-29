// scripts/test-revoke.ts
// RFC 7009 revocation, end to end, as the reviewer (Job F2). Muse's revoke of its grant failed on 28 Sep: Muse is a
// public client and the endpoint demanded a client_id, so it answered 401 and the grant stayed live. This registers
// throwaway clients, gets real tokens through consent, revokes them every way RFC 7009 allows, and checks each token
// is dead where it matters — /mcp for an access token, /oauth/token for a refresh token.
//
//   MCP_URL=https://ivywolf-api.vercel.app/mcp npx tsx --env-file=.env.local scripts/test-revoke.ts
//
// Needs IVY_REVIEWER_EMAIL / IVY_REVIEWER_PASSWORD, and a server that can verify Clerk sessions (production).
// Removes its clients afterwards, and with them every grant it made.

import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { oauthClient } from './lib/oauth-client'

const MCP_URL = process.env.MCP_URL ?? 'http://localhost:3000/mcp'
const ORIGIN = new URL(MCP_URL).origin
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { REDIRECT, pkce, form, authorizeAs, tokenCall, signInReviewer } = oauthClient(ORIGIN)

let failed = 0
function check(name: string, pass: boolean, detail = '') {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const registered: string[] = []
async function register(name: string, method: 'none' | 'client_secret_basic') {
  const r = await fetch(`${ORIGIN}/oauth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: method }),
  })
  const c = (await r.json()) as { client_id: string; client_secret?: string }
  registered.push(c.client_id)
  return c
}

const basic = (id: string, secret = '') => `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString('base64')}`

/** Consent as the reviewer, then exchange the code. Confidential clients authenticate with Basic. */
async function grant(client: { client_id: string; client_secret?: string }) {
  const { verifier, challenge } = pkce()
  const { back } = await authorizeAs(client.client_id, ['ideas:read'], challenge, randomUUID())
  const body = { grant_type: 'authorization_code', code: back.searchParams.get('code')!, redirect_uri: REDIRECT, code_verifier: verifier }
  const r = client.client_secret
    ? await form('/oauth/token', body, { Authorization: basic(client.client_id, client.client_secret) })
    : await form('/oauth/token', { ...body, client_id: client.client_id })
  const j = (await r.json()) as { access_token: string; refresh_token: string }
  if (!j.access_token) throw new Error(`no token: ${r.status} ${JSON.stringify(j)}`)
  return j
}

/** Is an access token alive on /mcp? */
async function accessAlive(token: string) {
  const r = await fetch(MCP_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  })
  return r.status === 200
}
/** Is a refresh token alive? (A live one is used up by this, so only ask of tokens that should be dead.) */
async function refreshAlive(client: { client_id: string; client_secret?: string }, token: string) {
  const r = client.client_secret
    ? await form('/oauth/token', { grant_type: 'refresh_token', refresh_token: token }, { Authorization: basic(client.client_id, client.client_secret) })
    : await tokenCall({ grant_type: 'refresh_token', refresh_token: token, client_id: client.client_id })
  return r.status === 200
}

async function main() {
  const as = (await (await fetch(`${ORIGIN}/.well-known/oauth-authorization-server`)).json()) as Record<string, any>
  check('metadata advertises revocation_endpoint', as.revocation_endpoint === `${ORIGIN}/oauth/revoke` &&
    as.revocation_endpoint_auth_methods_supported?.includes('none'), `${as.revocation_endpoint} ${as.revocation_endpoint_auth_methods_supported}`)

  await signInReviewer()
  const pub = await register('Ivy revoke test (public)', 'none')

  // The request Muse most likely sent: a public client, the token and nothing else.
  let t = await grant(pub)
  check('a fresh token works', await accessAlive(t.access_token))
  let r = await form('/oauth/revoke', { token: t.access_token })
  check('public client: token only, no client_id → 200', r.status === 200, String(r.status))
  check('  the access token is dead on /mcp', !(await accessAlive(t.access_token)))
  check('  its refresh token is dead too', !(await refreshAlive(pub, t.refresh_token)))

  t = await grant(pub)
  r = await form('/oauth/revoke', { token: t.refresh_token, token_type_hint: 'refresh_token', client_id: pub.client_id })
  check('public client: refresh token + client_id in the body → 200', r.status === 200, String(r.status))
  check('  the access token from the same grant is dead', !(await accessAlive(t.access_token)))
  check('  the refresh token is dead', !(await refreshAlive(pub, t.refresh_token)))

  t = await grant(pub)
  r = await form('/oauth/revoke', { token: t.access_token, token_type_hint: 'access_token' }, { Authorization: basic(pub.client_id) })
  check('public client: Basic with client_id and empty secret → 200', r.status === 200, String(r.status))
  check('  the access token is dead', !(await accessAlive(t.access_token)))

  t = await grant(pub)
  r = await fetch(`${ORIGIN}/oauth/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t.access_token }) })
  check('public client: JSON body → 200', r.status === 200, String(r.status))
  check('  the access token is dead', !(await accessAlive(t.access_token)))

  r = await form('/oauth/revoke', { token: t.access_token })
  check('revoking again is still 200', r.status === 200, String(r.status))
  r = await form('/oauth/revoke', { token: `iv_at_${randomBytes(32).toString('base64url')}` })
  check('an unknown token is 200 (RFC 7009 §2.2)', r.status === 200, String(r.status))

  // Confidential client: its grants need its secret.
  const conf = await register('Ivy revoke test (confidential)', 'client_secret_basic')
  t = await grant(conf)
  r = await form('/oauth/revoke', { token: t.access_token })
  check('confidential client: no credentials → 401 invalid_client', r.status === 401 && (await r.json()).error === 'invalid_client', String(r.status))
  check('  and the token still works', await accessAlive(t.access_token))
  r = await form('/oauth/revoke', { token: t.access_token }, { Authorization: basic(conf.client_id, 'wrong') })
  check('confidential client: wrong secret → 401', r.status === 401, String(r.status))
  check('  and the token still works', await accessAlive(t.access_token))
  r = await form('/oauth/revoke', { token: t.access_token }, { Authorization: basic(conf.client_id, conf.client_secret) })
  check('confidential client: Basic credentials → 200', r.status === 200, String(r.status))
  check('  the access token is dead', !(await accessAlive(t.access_token)))
  check('  its refresh token is dead too', !(await refreshAlive(conf, t.refresh_token)))
  t = await grant(conf)
  r = await form('/oauth/revoke', { token: t.refresh_token, client_id: conf.client_id, client_secret: conf.client_secret! })
  check('confidential client: secret in the body also accepted → 200', r.status === 200, String(r.status))
  check('  the access token is dead', !(await accessAlive(t.access_token)))

  // One client can't revoke another's grant (200, as §2.2 asks, but nothing happens).
  t = await grant(conf)
  r = await form('/oauth/revoke', { token: t.access_token, client_id: pub.client_id })
  check("another client's token: 200, and nothing revoked", r.status === 200 && (await accessAlive(t.access_token)), String(r.status))

  const { data: rows } = await db.from('creator_api_keys').select('revoked_at').in('client_id', registered)
  const live = (rows ?? []).filter((x) => !x.revoked_at).length
  check('every grant this run revoked is marked revoked (one left live on purpose)', live === 1, `${live} live of ${rows?.length}`)
}

void (async () => {
  try {
    await main()
  } catch (err) {
    failed++
    console.error('FAIL  run stopped:', err)
  } finally {
    if (registered.length) await db.from('oauth_clients').delete().in('client_id', registered)
    console.log(failed ? `\n${failed} failed` : '\nall passed')
    process.exit(failed ? 1 : 0)
  }
})()
