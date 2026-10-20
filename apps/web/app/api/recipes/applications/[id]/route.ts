// apps/web/app/api/recipes/applications/[id]/route.ts
// Undo (Job B.10): DELETE → "Remove these n cards" — every card the application made, and nothing else. Her own
// applications only. Within the Undo pill's 10 s (+ 5 s for a late tap) the charge is refunded in full, the use comes
// off the recipe and any author share is taken back; after that the cards go and the charge stands.
// → { removed, refunded }

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
