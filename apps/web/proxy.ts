// apps/web/proxy.ts
// Next 16 renamed middleware.ts -> proxy.ts. Lifted from gamesfield-app proxy.ts per docs/lift-list.md;
// the public allowlist below is written from scratch, not carried over.
//
// Gamesfield's allowlist had grown to ~40 entries including '/api/projects/(.*)' and '/api/assets' —
// the routes each re-checked auth so nothing was actually exposed, but the middleware had stopped being
// a meaningful control. A route gets added here only with a reason.
//
//   /                 marketing home
//   /sign-in          Clerk catch-all
//   /connector        the connector's public description (Job F2) — reviewers read it signed out
//   /mcp              the Muse connector (Job F): bearer auth of its own (lib/mcp/auth.ts) — a Clerk session
//                     would be wrong here
//   /.well-known/…    OAuth discovery (RFC 9728, RFC 8414): read by clients before anyone signs in
//   /oauth/authorize  decides for itself what a signed-out visitor sees (sends them to sign in and back)
//   /oauth/register   dynamic client registration: clients have no account
//   /oauth/token      client-authenticated, not session-authenticated
//   /oauth/revoke     likewise
//   /api/health       liveness probe, must answer before auth
//   /api/pinterest/callback  Pinterest's OAuth redirect (Job H.0c): the consent browser has no Clerk session; the sealed,
//                     expiring state it carries is the authentication (lib/pinterest.ts)
//   /idea/<id>        Copy link (Job C+): a card she has shared is public, the card alone (title, form, credit), via
//                     shared_card() (0034). The page decides for itself: her own card → the full view; a shared card →
//                     the card; otherwise, signed out → /sign-in and back (as before), signed in → 404.
//
// /oauth/consent and /oauth/decision are deliberately not public: she must be signed in to see or answer consent.
// Nor are /thread, /todo and /recording (the web views the connector links to): signed out → /sign-in and back.
//
// CORS (Job F2): Muse's own origins may call the connector's machine endpoints from a browser. Everything else is
// same-origin as before. The consent page can't be framed (clickjacking an Allow button).
//
// The mobile redirect to /mobile-gate is dropped: the creator app is Expo, and this Next app is
// marketing + admin + MCP only.

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const isApiRoute = createRouteMatcher(['/api/(.*)'])

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/connector',
  '/mcp',
  '/.well-known/(.*)',
  '/oauth/authorize',
  '/oauth/register',
  '/oauth/token',
  '/oauth/revoke',
  '/api/health',
  '/api/pinterest/callback',
  '/idea/(.*)',
])

const isConnectorEndpoint = createRouteMatcher(['/mcp', '/.well-known/(.*)', '/oauth/register', '/oauth/token', '/oauth/revoke'])
const isConsent = createRouteMatcher(['/oauth/consent/(.*)'])

/** muse.ai and its subdomains, https only. */
const MUSE_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*muse\.ai$/

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
    'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { pathname } = request.nextUrl

  const origin = request.headers.get('origin')
  const cors = origin && MUSE_ORIGIN.test(origin) && isConnectorEndpoint(request) ? corsHeaders(origin) : null
  if (request.method === 'OPTIONS' && isConnectorEndpoint(request)) {
    return new NextResponse(null, { status: 204, headers: cors ?? {} })
  }

  // Expose the pathname to server components that need it.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)

  if (!isPublicRoute(request)) {
    if (isApiRoute(request)) {
      // API callers (the app, scripts) get a 401 they can act on, not a redirect to the sign-in page.
      // Each route still checks auth() itself; this is the outer gate.
      const { userId } = await auth()
      if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    } else {
      await auth.protect()
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  if (cors) for (const [k, v] of Object.entries(cors)) response.headers.set(k, v)
  if (isConsent(request)) {
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Content-Security-Policy', "frame-ancestors 'none'")
  }
  return response
}, {
  // Signed-out visitors to a page (/idea, /thread, /todo, /recording, /oauth/consent) go to our own /sign-in and come
  // back to the same URL (redirect_url), not to Clerk's hosted page.
  signInUrl: '/sign-in',
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
