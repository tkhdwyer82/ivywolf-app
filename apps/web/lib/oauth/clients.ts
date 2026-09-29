// apps/web/lib/oauth/clients.ts
// OAuth clients (0027 oauth_clients): the two ways an unknown client can identify itself.
//
//   Registered (RFC 7591)        POST /oauth/register → a random client_id. Open to anyone, as the spec intends;
//                                capped at REGISTRATIONS_PER_MINUTE across all clients so the table can't be flooded.
//   Metadata document (CIMD)     client_id is an https URL serving the client's metadata; fetched at authorization
//                                and cached for CIMD_CACHE_MS. The fetch is guarded: https only, public addresses only,
//                                no redirects, 5 s, 64 KiB.
//
// Redirect URIs (RFC 8252 / OAuth 2.1): https anywhere (Muse was seen calling back to agent.meta.ai — no host
// allow-list, which is what broke Muse elsewhere), http only on loopback (any port), or a private-use scheme with a
// dot in it (com.example.app:/cb). Matched exactly, except a loopback URI's port.

import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { supabaseAdmin } from '../supabase'
import { sha256, token } from './server'

export type Client = {
  client_id: string
  kind: 'registered' | 'metadata_document'
  client_name: string
  client_uri: string | null
  redirect_uris: string[]
  token_endpoint_auth_method: 'none' | 'client_secret_post' | 'client_secret_basic'
  secret_hash: string | null
}

const REGISTRATIONS_PER_MINUTE = 30
const CIMD_CACHE_MS = 60 * 60 * 1000
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export class ClientError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

/** Is this an acceptable redirect URI to register? Returns the reason if not. */
export function redirectProblem(uri: unknown): string | null {
  if (typeof uri !== 'string' || uri.length > 2000) return 'is not a string URL'
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return 'is not an absolute URL'
  }
  if (u.hash) return 'has a fragment'
  if (u.protocol === 'https:') return null
  if (u.protocol === 'http:') return LOOPBACK.has(u.hostname) ? null : 'uses http on a non-loopback host'
  if (/^(javascript|data|file|vbscript|blob):$/.test(u.protocol)) return 'uses a forbidden scheme'
  return u.protocol.slice(0, -1).includes('.') ? null : 'uses a custom scheme without a dot (RFC 8252 §7.1)'
}

/** Exact match, except a loopback http URI may use any port (RFC 8252 §7.3). */
export function redirectAllowed(client: Client, uri: string): boolean {
  if (client.redirect_uris.includes(uri)) return true
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return false
  }
  if (u.protocol !== 'http:' || !LOOPBACK.has(u.hostname)) return false
  return client.redirect_uris.some((r) => {
    const x = new URL(r)
    return x.protocol === 'http:' && x.hostname === u.hostname && x.pathname === u.pathname && x.search === u.search
  })
}

const AUTH_METHODS = ['none', 'client_secret_post', 'client_secret_basic'] as const
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** RFC 7591 registration. Returns the response body (201). */
export async function registerClient(body: Record<string, unknown>) {
  const uris = body.redirect_uris
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) {
    throw new ClientError('invalid_redirect_uri', 'redirect_uris must list between 1 and 10 URIs.')
  }
  for (const u of uris) {
    const why = redirectProblem(u)
    if (why) throw new ClientError('invalid_redirect_uri', `The redirect URI ${String(u).slice(0, 200)} ${why}.`)
  }
  const method = (body.token_endpoint_auth_method ?? 'none') as (typeof AUTH_METHODS)[number]
  if (!AUTH_METHODS.includes(method)) {
    throw new ClientError('invalid_client_metadata', `token_endpoint_auth_method must be one of ${AUTH_METHODS.join(', ')}.`)
  }
  const grants = (body.grant_types ?? ['authorization_code']) as unknown[]
  if (!Array.isArray(grants) || grants.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) {
    throw new ClientError('invalid_client_metadata', 'Only authorization_code and refresh_token grants are supported.')
  }
  const responses = (body.response_types ?? ['code']) as unknown[]
  if (!Array.isArray(responses) || responses.some((r) => r !== 'code')) {
    throw new ClientError('invalid_client_metadata', 'Only the code response type is supported.')
  }

  const db = supabaseAdmin()
  const { count } = await db
    .from('oauth_clients')
    .select('client_id', { count: 'exact', head: true })
    .eq('kind', 'registered')
    .gt('created_at', new Date(Date.now() - 60_000).toISOString())
  if ((count ?? 0) >= REGISTRATIONS_PER_MINUTE) {
    throw new ClientError('temporarily_unavailable', 'Too many registrations right now. Try again in a minute.')
  }

  const clientId = token('ivc_')
  const secret = method === 'none' ? null : token('ivs_')
  const client_name = str(body.client_name, 120) ?? 'An MCP client'
  const client_uri = str(body.client_uri, 500)
  const { error } = await db.from('oauth_clients').insert({
    client_id: clientId,
    kind: 'registered',
    client_name,
    client_uri,
    redirect_uris: uris,
    token_endpoint_auth_method: method,
    secret_hash: secret ? sha256(secret) : null,
    metadata: body,
  })
  if (error) throw new Error(`register: ${error.message}`)

  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_name,
    ...(client_uri ? { client_uri } : {}),
    redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: method,
  }
}

// ── Client ID metadata documents ─────────────────────────────────────────────────────────────────────────────
const isMetadataUrl = (id: string) => id.startsWith('https://')

/** True for loopback, private, link-local, CGNAT, multicast and cloud-metadata addresses. */
function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  }
  const x = ip.toLowerCase()
  if (x.startsWith('::ffff:')) return privateAddress(x.slice(7))
  return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') ||
    x.startsWith('fea') || x.startsWith('feb') || x.startsWith('ff')
}

async function fetchMetadataDocument(url: string): Promise<Record<string, unknown>> {
  const u = new URL(url)
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) {
    throw new ClientError('invalid_client', 'The client ID must be a plain https URL.')
  }
  const addrs = await lookup(u.hostname, { all: true }).catch(() => [])
  if (addrs.length === 0 || addrs.some((a) => privateAddress(a.address))) {
    throw new ClientError('invalid_client', "The client's metadata document isn't on a public host.")
  }
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } }).catch(() => null)
  if (!res?.ok) throw new ClientError('invalid_client', "The client's metadata document couldn't be fetched.")
  const reader = res.body?.getReader()
  let text = ''
  const decoder = new TextDecoder()
  for (let read = 0; reader; ) {
    const { done, value } = await reader.read()
    if (done) break
    read += value.length
    if (read > 64 * 1024) {
      await reader.cancel()
      throw new ClientError('invalid_client', "The client's metadata document is too large.")
    }
    text += decoder.decode(value, { stream: true })
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new ClientError('invalid_client', "The client's metadata document isn't JSON.")
  }
}

/** A client by id: a registered row, or a metadata document (fetched, checked, cached). Null if unknown. */
export async function getClient(clientId: string, opts: { refresh?: boolean } = {}): Promise<Client | null> {
  if (!clientId || clientId.length > 500) return null
  const db = supabaseAdmin()
  const { data } = await db
    .from('oauth_clients')
    .select('client_id, kind, client_name, client_uri, redirect_uris, token_endpoint_auth_method, secret_hash, refreshed_at')
    .eq('client_id', clientId)
    .maybeSingle()
  const row = data as (Client & { refreshed_at: string }) | null
  if (!isMetadataUrl(clientId)) return row
  if (row && !opts.refresh && Date.now() - new Date(row.refreshed_at).getTime() < CIMD_CACHE_MS) return row

  const doc = await fetchMetadataDocument(clientId)
  if (doc.client_id !== clientId) throw new ClientError('invalid_client', "The metadata document's client_id doesn't match its URL.")
  const uris = doc.redirect_uris
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || uris.some((u) => redirectProblem(u))) {
    throw new ClientError('invalid_client', "The metadata document's redirect_uris aren't usable.")
  }
  if ((doc.token_endpoint_auth_method ?? 'none') !== 'none') {
    throw new ClientError('invalid_client', 'Metadata-document clients must be public (token_endpoint_auth_method none).')
  }
  const client: Client = {
    client_id: clientId,
    kind: 'metadata_document',
    client_name: str(doc.client_name, 120) ?? new URL(clientId).hostname,
    client_uri: str(doc.client_uri, 500),
    redirect_uris: uris as string[],
    token_endpoint_auth_method: 'none',
    secret_hash: null,
  }
  const { error } = await db.from('oauth_clients').upsert({ ...client, metadata: doc, refreshed_at: new Date().toISOString() })
  if (error) throw new Error(`cimd upsert: ${error.message}`)
  return client
}

/** What client credentials a request carries, and how: HTTP Basic, or client_id/client_secret in the body. */
export function presentedCredentials(req: Request, params: Record<string, string>): { id: string | null; secret: string | null; via: 'basic' | 'post' | null } {
  const basic = req.headers.get('authorization')?.match(/^Basic\s+(.+)$/i)
  if (basic) {
    const decoded = Buffer.from(basic[1], 'base64').toString()
    const colon = decoded.indexOf(':')
    const u = colon < 0 ? decoded : decoded.slice(0, colon)
    const p = colon < 0 ? '' : decoded.slice(colon + 1)
    const dec = (x: string) => {
      try {
        return decodeURIComponent(x.replace(/\+/g, ' '))
      } catch {
        return x
      }
    }
    return { id: dec(u) || null, secret: dec(p) || null, via: 'basic' }
  }
  if (params.client_id) return { id: params.client_id, secret: params.client_secret || null, via: 'post' }
  return { id: null, secret: null, via: null }
}

/**
 * Client authentication at the token and revocation endpoints. Public clients send only client_id (in the body or
 * as a Basic username with an empty password); confidential ones their secret, by either method — the secret is
 * what's checked, not which of the two standard places it came in. Returns the client or throws invalid_client.
 */
export async function authenticateClient(req: Request, params: Record<string, string>): Promise<Client> {
  const { id, secret } = presentedCredentials(req, params)
  const client = id ? await getClient(id).catch(() => null) : null
  if (!client) throw new ClientError('invalid_client', 'Unknown client.')
  if (client.token_endpoint_auth_method === 'none') return client
  if (!secret || sha256(secret) !== client.secret_hash) throw new ClientError('invalid_client', 'Client authentication failed.')
  return client
}
