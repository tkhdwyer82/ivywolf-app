// apps/web/proxy.ts
// Next 16 renamed middleware.ts -> proxy.ts. Lifted from gamesfield-app proxy.ts per docs/lift-list.md;
// the public allowlist below is written from scratch, not carried over.
//
// Gamesfield's allowlist had grown to ~40 entries including '/api/projects/(.*)' and '/api/assets' —
// the routes each re-checked auth so nothing was actually exposed, but the middleware had stopped being
// a meaningful control. Four entries, and a route gets added here only with a reason.
//
//   /            marketing home
//   /sign-in     Clerk catch-all
//   /api/mcp     bearer-token auth of its own (lib/mcp/auth.ts) — a Clerk session would be wrong here
//   /api/health  liveness probe, must answer before auth
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
  '/api/mcp(.*)',
  '/api/health',
])

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { pathname } = request.nextUrl

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

  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
