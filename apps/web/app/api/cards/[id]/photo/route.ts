// apps/web/app/api/cards/[id]/photo/route.ts
// Change view → Photo on a card that has no photo yet (Job B revised). The app has already set shape = 'photo'
// (shape_set_by 'creator') with her own JWT; this finds the picture through the same Unsplash lane a new photo card
// takes (packages/pipeline/frames.ts photoForCard), credited and download-tracked.
//
// Ownership is checked with supabaseAsUser() — RLS on cards means only her own card comes back. The search runs
// before the response (one Unsplash call, ≤ 15 s), so the app can show the photo, or say none was found.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { photoForCard } from '@ivywolf/pipeline'
import { supabaseAsUser } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await supabaseAsUser()
  const { data: card, error } = await supabase.from('cards').select('id, frame_url, frame_status, frame_attribution, source').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Already has a picture (a credited Unsplash photo, or one she imported): never replace it with a search. A frame
  // drawn before Job B isn't one — the app never shows it (Job I, cardPicture) — so it doesn't block the search; its
  // URL stays in frame_generations and its file in storage.
  const credited = (card.frame_attribution as { provider?: string } | null)?.provider === 'unsplash'
  if (card.frame_status === 'done' && card.frame_url && (credited || card.source === 'import')) return NextResponse.json({ photo: true })

  try {
    return NextResponse.json({ photo: await photoForCard(userId, id) })
  } catch (err) {
    console.error(`[cards/photo] ${id} failed:`, err)
    return NextResponse.json({ error: 'Could not find a photo' }, { status: 502 })
  }
}
