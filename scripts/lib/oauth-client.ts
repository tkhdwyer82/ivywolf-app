// scripts/lib/oauth-client.ts
// A test OAuth client for Ivy's authorization server (Job F2): signs in as the standing reviewer through Clerk's
// Frontend API with email + password, as a browser would, then drives authorize → consent → decision and the token
// endpoint. Used by scripts/test-mcp.ts and scripts/test-revoke.ts.

import { createHash, randomBytes } from 'node:crypto'

export function oauthClient(ORIGIN: string) {
  const FAPI = process.env.CLERK_FAPI ?? 'https://safe-mutt-5320.clerk.accounts.dev'
  let reviewer: { userId: string; sessionId: string; dbJwt: string } | null = null

  async function fapi(path: string, body: Record<string, string> = {}) {
    const sep = path.includes('?') ? '&' : '?'
    const r = await fetch(`${FAPI}${path}${sep}__clerk_db_jwt=${reviewer?.dbJwt ?? ''}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body),
    })
    const j = (await r.json()) as any
    if (!r.ok) throw new Error(`Clerk ${path}: ${j.errors?.[0]?.long_message ?? j.errors?.[0]?.message ?? r.status}`)
    return j
  }

  /** Signs in as the reviewer with email + password (a browser's sign-in; not CAPTCHA-gated as sign-up is). */
  async function signInReviewer() {
    if (!process.env.IVY_REVIEWER_EMAIL || !process.env.IVY_REVIEWER_PASSWORD) throw new Error('IVY_REVIEWER_EMAIL / IVY_REVIEWER_PASSWORD not set')
    const dev = (await (await fetch(`${FAPI}/v1/dev_browser`, { method: 'POST' })).json()) as { token: string }
    reviewer = { userId: '', sessionId: '', dbJwt: dev.token }
    const j = await fapi('/v1/client/sign_ins', {
      identifier: process.env.IVY_REVIEWER_EMAIL, password: process.env.IVY_REVIEWER_PASSWORD, strategy: 'password',
    })
    const sessionId = j.response?.created_session_id
    const session = (j.client?.sessions ?? []).find((x: any) => x.id === sessionId)
    if (!sessionId || !session) throw new Error(`reviewer sign-in did not complete: ${j.response?.status}`)
    reviewer = { ...reviewer, userId: session.user.id, sessionId }
  }
  /** Her Clerk session token (60 s), as the app or a browser would carry it — fetched fresh for each use. */
  const sessionJwt = async () => (await fapi(`/v1/client/sessions/${reviewer!.sessionId}/tokens`)).jwt as string

  const b64url = (b: Buffer) => b.toString('base64url')
  function pkce() {
    const verifier = b64url(randomBytes(32))
    return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) }
  }
  const REDIRECT = 'http://127.0.0.1:53682/callback'

  async function form(path: string, body: Record<string, string | string[]>, headers: Record<string, string> = {}) {
    const f = new URLSearchParams()
    for (const [k, v] of Object.entries(body)) for (const x of [v].flat()) f.append(k, x)
    return fetch(`${ORIGIN}${path}`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: f })
  }

  /** authorize → consent → decision, as her. Returns the code (or the error) the client gets back. */
  async function authorizeAs(clientId: string, scopes: string[], challenge: string, state: string) {
    const q = new URLSearchParams({
      response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256',
      scope: 'ideas:read ideas:capture', state, resource: `${ORIGIN}/mcp`,
    })
    const jwt = await sessionJwt()
    const a = await fetch(`${ORIGIN}/oauth/authorize?${q}`, { redirect: 'manual', headers: { Authorization: `Bearer ${jwt}` } })
    const consentUrl = a.headers.get('location') ?? ''
    const id = consentUrl.match(/\/oauth\/consent\/([0-9a-f-]{36})$/)?.[1]
    if (!id) throw new Error(`authorize did not reach consent: ${a.status} ${consentUrl}`)
    const page = await (await fetch(consentUrl, { headers: { Authorization: `Bearer ${jwt}` } })).text()
    const d = await form('/oauth/decision', { id, scope: scopes, decision: 'allow' }, { Authorization: `Bearer ${jwt}` })
    const back = new URL(d.headers.get('location') ?? 'about:blank')
    return { page, back, status: d.status }
  }

  async function tokenCall(body: Record<string, string>) {
    const r = await form('/oauth/token', body)
    return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, any> }
  }

  return {
    FAPI, REDIRECT, b64url, pkce, form, authorizeAs, tokenCall, signInReviewer, sessionJwt,
    reviewer: () => reviewer,
  }
}
