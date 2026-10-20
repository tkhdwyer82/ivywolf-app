// apps/web/app/api/recipes/[id]/apply/route.ts
// Apply a recipe to her idea (Job B.10, the merge). POST { idea_id, project_id?, credits } → one card per step in the
// project, written for her idea, each tagged "Step n of {title} · @handle" and carrying its make_prompt for the Make
// button (recipe_application_cards). Price first (W2): `credits` is the price the sheet showed; if it's no longer the
// price nothing is charged (409 with the new price). The charge comes before the model call and is refunded if no
// cards land. Nothing generates here — each step's Make waits for her Generate (TODO(B.8): the Make page).
// Insufficient credits → 402, for the top-up sheet.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { applyRecipe, RecipeError } from '@ivywolf/pipeline'
import { allow } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUS: Record<RecipeError['code'], number> = { not_found: 404, price_changed: 409, insufficient_credits: 402, no_cards: 422, failed: 500 }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allow(`recipes-apply:${userId}`, 10)) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } })
  const { id } = await params
  const body = (await req.json().catch(() => null)) as { idea_id?: unknown; project_id?: unknown; credits?: unknown } | null
  const ideaId = typeof body?.idea_id === 'string' ? body.idea_id : ''
  const projectId = typeof body?.project_id === 'string' ? body.project_id : null
  const credits = typeof body?.credits === 'number' ? body.credits : NaN
  if (!UUID.test(id) || !UUID.test(ideaId) || (projectId && !UUID.test(projectId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!Number.isInteger(credits) || credits < 0) return NextResponse.json({ error: 'Show the price first' }, { status: 400 })

  try {
    const r = await applyRecipe({ creatorId: userId, recipeId: id, ideaId, projectId, quotedCredits: credits })
    return NextResponse.json({ application_id: r.applicationId, project_id: r.projectId, card_ids: r.cardIds, credits: r.credits })
  } catch (err) {
    if (err instanceof RecipeError) {
      if (err.code === 'failed' || err.code === 'no_cards') console.error(`[recipes/apply] ${id}: ${err.message}`)
      return NextResponse.json({ error: err.code === 'no_cards' ? 'Ivy couldn’t fit this recipe to that idea — nothing was charged' : err.message, code: err.code, price: err.detail ?? null }, { status: STATUS[err.code] })
    }
    console.error(`[recipes/apply] ${id}: ${err instanceof Error ? err.message : err}`)
    return NextResponse.json({ error: 'That didn’t work — nothing was charged' }, { status: 500 })
  }
}
