// apps/web/app/api/pinterest/start/route.ts
// Connect Pinterest, step 1 (Job H.0c): the app asks for Pinterest's consent URL and opens it. Signed in (Clerk). Until
// PINTEREST_APP_SECRET is set (trial access pending) this answers 503 with available: false — the app shows "Connect
// Pinterest · coming soon". Pinterest terms: packages/schema/pinterest.ts.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { authorizeUrl, available } from '@/lib/pinterest'

export const runtime = 'nodejs'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!available()) return NextResponse.json({ available: false, error: 'Pinterest is coming soon' }, { status: 503 })
  return NextResponse.json({ available: true, url: authorizeUrl(userId) })
}
