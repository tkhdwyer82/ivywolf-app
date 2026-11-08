// apps/web/app/api/admin/covers/route.ts
// POST → repairs for the caller's own cards that need keys only Vercel holds (Unsplash, Pixabay) (B.12):
//   - keepPixabayPictures: Pixabay reference pictures stored before they were copied — fetched again by id and copied
//     into frames/<creator>/references/ (their links expire after about a day);
//   - rebuildPrevious: covers set before they were undoable get the previous picture back for ••• → Restore (an
//     Unsplash photo searched again with the same words, marked refound; otherwise the empty slot).
// Admin only (Clerk publicMetadata.role 'admin'), creator-scoped: never anyone else's cards.

import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { keepPixabayPictures, rebuildPrevious } from '@ivywolf/pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await (await clerkClient()).users.getUser(userId)
  if ((user.publicMetadata as { role?: string } | null)?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const pixabay = await keepPixabayPictures(userId)
    const previous = await rebuildPrevious(userId)
    return NextResponse.json({ pixabay, previous })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Repair failed' }, { status: 500 })
  }
}
