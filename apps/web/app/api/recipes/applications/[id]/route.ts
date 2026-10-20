// apps/web/app/api/recipes/applications/[id]/route.ts
// Undo (Job B.10): DELETE → "Remove these n cards" — every card the application made, and nothing else. Her own
// applications only. Not refunded (left for Tim to decide).

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { undoApplication, RecipeError } from '@ivywolf/pipeline'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    return NextResponse.json(await undoApplication({ creatorId: userId, applicationId: id }))
  } catch (err) {
    const status = err instanceof RecipeError && err.code === 'not_found' ? 404 : 500
    if (status === 500) console.error(`[recipes/undo] ${id}: ${err instanceof Error ? err.message : err}`)
    return NextResponse.json({ error: status === 404 ? 'Not found' : 'Those cards didn’t come off — try again' }, { status })
  }
}
