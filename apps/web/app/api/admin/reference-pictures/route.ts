// apps/web/app/api/admin/reference-pictures/route.ts
// POST → { stored, missed } (Job B.2, 0039): backfill cards.reference_picture for the caller's own cards — the same
// backfillReferencePictures() scripts/backfill-reference-pictures.ts runs — so the Unsplash and Pixabay keys stay in
// Vercel. Admin only: the caller's Clerk publicMetadata.role must be 'admin'. Creator-scoped: it only ever touches the
// signed-in creator's cards, never anyone else's. Never Pinterest; no Unsplash download event (that's sent on use).

import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { backfillReferencePictures } from '@ivywolf/pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await (await clerkClient()).users.getUser(userId)
  if ((user.publicMetadata as { role?: string } | null)?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    return NextResponse.json(await backfillReferencePictures(userId))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Backfill failed' }, { status: 500 })
  }
}
