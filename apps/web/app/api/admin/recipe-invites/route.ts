// apps/web/app/api/admin/recipe-invites/route.ts
// GET → the recipe authors invited and not yet accepted, each with an email draft for Tim to send by hand (Job B.10).
// Nothing is ever sent from here. Admin only: the caller's Clerk publicMetadata.role must be 'admin'.

import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

/** TODO(Tim): the invite copy. A placeholder until then; the share comes from recipe_authors.payout_share. */
function draft(a: { platform: string; handle: string; payout_share: number | string }, recipes: { title: string; uses: number }[]) {
  const share = Math.round(Number(a.payout_share) * 100)
  return [
    `To: @${a.handle} (${a.platform}) — find a contact address first`,
    `Subject: Your how-to is a recipe on Ivy Wolf`,
    ``,
    `[INVITE COPY — Tim to write]`,
    `Recipes from your post: ${recipes.map((r) => `“${r.title}” (${r.uses} used)`).join(', ') || '—'}.`,
    `Nothing is published under your name until you accept. Once you do, you earn ${share}% of the credits each time one is applied.`,
  ].join('\n')
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await (await clerkClient()).users.getUser(userId)
  if ((user.publicMetadata as { role?: string } | null)?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin()
    .from('recipe_authors')
    .select('id, platform, handle, invited_at, payout_share, recipes(title, uses)')
    .not('invited_at', 'is', null)
    .is('accepted_at', null)
    .order('invited_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const invites = (data ?? []).map((a) => {
    const recipes = (a.recipes as unknown as { title: string; uses: number }[]) ?? []
    return { id: a.id, platform: a.platform, handle: a.handle, invited_at: a.invited_at, draft: draft(a, recipes) }
  })
  return NextResponse.json({ invites })
}
