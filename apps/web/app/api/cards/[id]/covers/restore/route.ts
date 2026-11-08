// apps/web/app/api/cards/[id]/covers/restore/route.ts
// POST → { ok: true }: ••• → Restore previous cover (B.12). The picture the ladder or Change cover replaced goes back
// (packages/pipeline/covers.ts restoreCover); 404 when it isn't her card, 409 when there's nothing to restore. Not
// behind INSPIRATION_ENABLED: with the library switched off she can still undo what it did.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { restoreCover } from '@ivywolf/pipeline/covers'
import { allow } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allow(`cover-restore:${userId}`, 30)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const r = await restoreCover(userId, id)
    if (r === 'no-card') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (r === 'none') return NextResponse.json({ error: 'No previous cover' }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[cards/covers/restore] ${id} failed:`, err)
    return NextResponse.json({ error: 'Could not restore the cover' }, { status: 502 })
  }
}
