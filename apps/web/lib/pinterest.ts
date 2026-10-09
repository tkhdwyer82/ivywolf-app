// apps/web/lib/pinterest.ts
// The Pinterest connector (Job H.0c): OAuth 2.0 authorization code with PKCE and state, tokens in Supabase Vault, the
// connection row in creator_connections. Pinterest's developer terms (packages/schema/pinterest.ts):
//   - store only the OAuth token (and its refresh token) — in Vault, as one secret, never in a table or a log;
//   - nothing else of hers from Pinterest is ever stored: pins are fetched live per request (pipeline references);
//   - disconnect deletes the token and the connection row in the same request.
//
// PINTEREST_APP_ID is set; PINTEREST_APP_SECRET isn't yet (trial access pending). Until it is, available() is false:
// Connect shows "coming soon", start refuses, and findReferences skips Pinterest.
//
// State: there's no table for an OAuth round trip. The state Pinterest carries back is the creator id, the PKCE
// verifier, a nonce and an expiry, sealed with AES-256-GCM under a key derived from the app secret — so it can't be
// read or forged, and the verifier never leaves us in the clear. Pinterest's docs don't mention PKCE; the challenge
// and verifier are sent anyway (an OAuth server ignores what it doesn't use) and become real protection if it does.

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { deleteSecret, getSecret, storeSecret, vaultSecretName } from './vault'
import { supabaseAdmin } from './supabase'
import { PINTEREST } from '@ivywolf/schema'

export const PINTEREST_REDIRECT = 'https://app.ivywolf.com.au/api/pinterest/callback'
export const PINTEREST_SCOPES = ['boards:read', 'pins:read']
const AUTHORIZE = 'https://www.pinterest.com/oauth/'
const TOKEN = 'https://api.pinterest.com/v5/oauth/token'
const STATE_TTL_MS = 10 * 60_000
/** Refresh this long before the access token runs out. */
const REFRESH_EARLY_MS = 5 * 60_000

export const available = () => !!process.env.PINTEREST_APP_ID && !!process.env.PINTEREST_APP_SECRET

const appId = () => process.env.PINTEREST_APP_ID!
const appSecret = () => process.env.PINTEREST_APP_SECRET!
const stateKey = () => Buffer.from(hkdfSync('sha256', appSecret(), 'ivywolf', 'pinterest-oauth-state', 32))
const b64url = (b: Buffer) => b.toString('base64url')

// ── State + PKCE ────────────────────────────────────────────────────────────────────────────────────────────────

interface StatePayload {
  creatorId: string
  verifier: string
  nonce: string
  exp: number
}

export function sealState(p: StatePayload, key = stateKey()): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([c.update(JSON.stringify(p), 'utf8'), c.final()])
  return b64url(Buffer.concat([iv, c.getAuthTag(), body]))
}

/** The creator and verifier from a state, or null if it was tampered with, isn't ours, or has expired. */
export function openState(state: string, key = stateKey(), now = Date.now()): StatePayload | null {
  try {
    const raw = Buffer.from(state, 'base64url')
    const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    const p = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')) as StatePayload
    return typeof p.creatorId === 'string' && typeof p.verifier === 'string' && p.exp > now ? p : null
  } catch {
    return null
  }
}

export const challengeFor = (verifier: string) => b64url(createHash('sha256').update(verifier).digest())

/** Where to send her to authorise Ivy: Pinterest's consent page, with scopes, state and the PKCE challenge. */
export function authorizeUrl(creatorId: string): string {
  if (!available()) throw new Error('Pinterest is not available yet')
  const verifier = b64url(randomBytes(32))
  const state = sealState({ creatorId, verifier, nonce: b64url(randomBytes(12)), exp: Date.now() + STATE_TTL_MS })
  const params = new URLSearchParams({
    client_id: appId(),
    redirect_uri: PINTEREST_REDIRECT,
    response_type: 'code',
    scope: PINTEREST_SCOPES.join(','),
    state,
    code_challenge: challengeFor(verifier),
    code_challenge_method: 'S256',
  })
  return `${AUTHORIZE}?${params}`
}

// ── Tokens ──────────────────────────────────────────────────────────────────────────────────────────────────────

interface Tokens {
  access_token: string
  refresh_token: string | null
  /** ms since epoch */
  expires_at: number
  scope: string
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${appId()}:${appSecret()}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  // Never log the body of a successful response: it is the token.
  if (!res.ok) throw new Error(`pinterest token ${res.status}: ${text.slice(0, 200)}`)
  const t = JSON.parse(text) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }
  return {
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? null,
    expires_at: Date.now() + (t.expires_in ?? 30 * 24 * 3600) * 1000,
    scope: t.scope ?? PINTEREST_SCOPES.join(','),
  }
}

const secretName = (creatorId: string) => vaultSecretName(creatorId, PINTEREST)

/** The callback: trade the code for tokens, keep them in Vault, mark her connected. */
export async function connect(creatorId: string, code: string, verifier: string): Promise<void> {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: PINTEREST_REDIRECT, code_verifier: verifier })
  await storeSecret(secretName(creatorId), JSON.stringify(tokens), 'Pinterest OAuth (access + refresh token) — the only Pinterest data Ivy keeps')
  const { error } = await supabaseAdmin().from('creator_connections').upsert({ creator_id: creatorId, slug: PINTEREST, connected_at: new Date().toISOString() })
  if (error) {
    await deleteSecret(secretName(creatorId)).catch(() => {}) // no half-connected state: no row, no token
    throw new Error(`creator_connections: ${error.message}`)
  }
}

/** Disconnect: the token and the connection row go together. Nothing else of hers from Pinterest exists to delete. */
export async function disconnect(creatorId: string): Promise<void> {
  await deleteSecret(secretName(creatorId))
  const { error } = await supabaseAdmin().from('creator_connections').delete().eq('creator_id', creatorId).eq('slug', PINTEREST)
  if (error) throw new Error(`creator_connections: ${error.message}`)
}

export async function isConnected(creatorId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from('creator_connections').select('slug').eq('creator_id', creatorId).eq('slug', PINTEREST).maybeSingle()
  return !!data
}

/**
 * Her access token for this request, refreshed first if it's about to run out. Null when Pinterest isn't available,
 * she hasn't connected, or the refresh fails (then the source is skipped; she reconnects in Settings).
 */
export async function accessToken(creatorId: string): Promise<string | null> {
  if (!available()) return null
  const raw = await getSecret(secretName(creatorId)).catch(() => null)
  if (!raw) return null
  const t = JSON.parse(raw) as Tokens
  if (t.expires_at - REFRESH_EARLY_MS > Date.now()) return t.access_token
  if (!t.refresh_token) return null
  try {
    const next = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token })
    await storeSecret(secretName(creatorId), JSON.stringify({ ...next, refresh_token: next.refresh_token ?? t.refresh_token }))
    return next.access_token
  } catch (err) {
    console.warn(`[pinterest] refresh failed for ${creatorId}: ${err instanceof Error ? err.message.slice(0, 80) : 'error'}`)
    return null
  }
}
