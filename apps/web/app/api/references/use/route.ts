// apps/web/app/api/references/use/route.ts
// POST { source, track_url } — she opened a reference (Job H). Unsplash's download event is sent then, and only then
// (Unsplash API guidelines: on use, not on display; packages/pipeline/references/unsplash.ts trackReferenceUse). Other
// sources need nothing. Only Unsplash's own download endpoint is ever called.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { trackReferenceUse } from '@ivywolf/pipeline'
import { allow } from '@/lib/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allow(`reference-use:${userId}`, 60)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  const body = (await req.json().catch(() => ({}))) as { source?: string; track_url?: string }
  let host = ''
  try {
    host = new URL(body.track_url ?? '').hostname
  } catch {}
  if (body.source !== 'unsplash' || host !== 'api.unsplash.com') return NextResponse.json({ tracked: false })
  await trackReferenceUse({ source: 'unsplash', id: '', thumb_url: '', full_url: '', link_url: '', credit: { name: '', url: '' }, width: 0, height: 0, track_url: body.track_url })
  return NextResponse.json({ tracked: true })
}
