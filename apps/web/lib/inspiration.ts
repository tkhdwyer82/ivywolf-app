// apps/web/lib/inspiration.ts
// The inspiration demo's feature flag and shared checks for /api/inspiration/* (packages/pipeline/inspiration.ts).
//
// Flag: INSPIRATION_ENABLED=1 on the server. Off (the default), every inspiration route is a 404 — the app treats a
// 404 from search as "flag off" and hides the test screen and the Ivy library row. The routes read the TEST Supabase
// project through INSPIRATION_SUPABASE_URL / INSPIRATION_SUPABASE_SERVICE_ROLE_KEY, never the production one
// (inspirationDb() refuses if they match).

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { allow } from '@/lib/rateLimit'

const PER_MINUTE = 60

export const inspirationEnabled = () => process.env.INSPIRATION_ENABLED === '1'

/** The flag, a signed-in user and the rate limit, in that order; a response to return early, or null to go on. */
export async function inspirationGate(route: string): Promise<NextResponse | null> {
  if (!inspirationEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allow(`inspiration:${route}:${userId}`, PER_MINUTE)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } })
  }
  return null
}

/** An integer query param clamped to [min, max], or the fallback. */
export function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}
