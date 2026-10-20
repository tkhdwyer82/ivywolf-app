// apps/web/app/api/recipes/[id]/invite/route.ts
// "Invite @handle?" (Job B.10): POST → records the invite on recipe_authors (invited_at, invited_by) and marks her
// recipe 'invited' — still private to her. No email is sent: Tim drafts and sends invites by hand from
// GET /api/admin/recipe-invites. Publishing waits for recipe_authors.accepted_at (0042's trigger).

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { inviteAuthor, RecipeError } from '@ivywolf/pipeline'
import { allow } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allow(`recipes-invite:${userId}`, 10)) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const { authorId } = await inviteAuthor({ creatorId: userId, recipeId: id })
    return NextResponse.json({ author_id: authorId })
  } catch (err) {
    const status = err instanceof RecipeError && err.code === 'not_found' ? 404 : 500
    if (status === 500) console.error(`[recipes/invite] ${id}: ${err instanceof Error ? err.message : err}`)
    return NextResponse.json({ error: status === 404 ? 'Not found' : 'That didn’t save — try again' }, { status })
  }
}
