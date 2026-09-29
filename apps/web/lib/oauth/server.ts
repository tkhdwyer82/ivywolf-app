// apps/web/lib/oauth/server.ts
// Ivy's OAuth 2.1 authorization server for the Muse connector (Job F2; 0027_oauth.sql). What it advertises, and the
// small pieces every endpoint shares.
//
// The MCP authorization spec (2026-07-28) as muse-ready's AUTH003 reads it: RFC 9728 protected-resource metadata
// pointing at this server, RFC 8414 server metadata, PKCE S256 only, client ID metadata documents preferred with
// dynamic registration (RFC 7591) still offered, and `iss` on the authorization response (RFC 9207).
//
// The issuer is the origin the request came in on, so the same code serves production, previews and localhost —
// each is its own issuer, and a token from one is never accepted by another (they share a database, but the
// `resource` a code was issued for is checked at the token endpoint).

import { createHash, randomBytes } from 'crypto'
import { getPublicOrigin } from 'mcp-handler'
import { SCOPES } from '../mcp/auth'

/**
 * Access tokens last 30 days, refresh tokens until the grant is revoked (rotated on every use). Long on purpose:
 * Muse has been reported unable to keep up with short-lived tokens (muse-ready AUTH002). Revoking the grant in
 * Connect your Muse ends both at once, so the lifetime is not what protects her.
 */
export const ACCESS_TTL_S = 30 * 24 * 3600
/** From /oauth/authorize to her decision: long enough to sign in. */
export const REQUEST_TTL_MS = 15 * 60 * 1000
/** From her decision to the code exchange. */
export const CODE_TTL_MS = 5 * 60 * 1000

export const origin = (req: Request) => getPublicOrigin(req)
/** The protected resource (RFC 8707/9728): the MCP endpoint. */
export const resourceOf = (issuer: string) => `${issuer}/mcp`

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const token = (prefix: string) => prefix + randomBytes(32).toString('base64url')

/** RFC 9728 — served at /.well-known/oauth-protected-resource and …/mcp. */
export function protectedResourceMetadata(issuer: string) {
  return {
    resource: resourceOf(issuer),
    authorization_servers: [issuer],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Ivy Wolf',
    resource_documentation: `${issuer}/connector`,
  }
}

/** RFC 8414 — served at /.well-known/oauth-authorization-server. Not an OpenID provider: no id_token, no openid-configuration. */
export function authorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    scopes_supported: [...SCOPES],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${issuer}/connector`,
  }
}

const NO_STORE = { 'Cache-Control': 'no-store', Pragma: 'no-cache' }

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } })

/** An OAuth error response (RFC 6749 §5.2). The description is a plain sentence; clients may show it. */
export const oauthError = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status)

/** Token and revocation endpoints take form bodies (the standard) and, leniently, JSON or multipart. */
export async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    return form ? Object.fromEntries([...form.entries()].flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))) : {}
  }
  if (type.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    return Object.fromEntries(Object.entries(body).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])))
  }
  return Object.fromEntries(new URLSearchParams(await req.text()))
}

/** Scope string → the known scopes in it, or null if it names one we don't have. */
export function parseScopes(scope: string | null | undefined): string[] | null {
  if (!scope?.trim()) return [...SCOPES]
  const asked = [...new Set(scope.trim().split(/\s+/))]
  return asked.every((s) => (SCOPES as readonly string[]).includes(s)) ? asked : null
}

/** PKCE S256 (RFC 7636 §4.6). */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false
  return createHash('sha256').update(verifier).digest('base64url') === challenge
}

/**
 * One line per token/revocation request: its shape, never its secrets — content type, how the client authenticated
 * (basic / post / none), which parameters came (names only), what kind of token (by prefix), the client id, the
 * user agent, and the outcome. So a failed call from a client (Muse's revoke, 28 Sep) can be read back from the logs.
 */
export function logOAuthRequest(endpoint: string, req: Request, params: Record<string, string>, extra: Record<string, unknown>) {
  const tokenKind = (t: string | undefined) => (t ? (t.match(/^(iv_at_|iv_rt_|iv_ac_|iv_)/)?.[1] ?? 'other') : undefined)
  const auth = req.headers.get('authorization')
  console.log(
    `[oauth/${endpoint}]`,
    JSON.stringify({
      content_type: req.headers.get('content-type'),
      auth_scheme: auth ? auth.split(/\s+/)[0] : null,
      params: Object.keys(params).sort(),
      token_kind: tokenKind(params.token ?? params.refresh_token ?? params.code),
      token_type_hint: params.token_type_hint,
      grant_type: params.grant_type,
      client_id: params.client_id,
      user_agent: req.headers.get('user-agent'),
      ...extra,
    })
  )
}
