// apps/web/app/api/references/route.ts
// GET /api/references?card_id=<uuid> → Reference[] (Job H.0c): free visual references for one of her cards, for More
// ideas to show beside a suggestion (packages/pipeline/references). Creator-scoped: the card is read with her own
// token (RLS), so another creator's card is a 404. 60 calls a minute per creator. Nothing is stored: Unsplash, Pixabay
// and — when she has connected it — her Pinterest pins are fetched live on every call.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { findReferences } from '@ivywolf/pipeline'
import { peopleFor } from '@ivywolf/pipeline/redact'
import { supabaseAsUser } from '@/lib/supabase'
import { accessToken } from '@/lib/pinterest'
import { allow } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 30

const PER_MINUTE = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allow(`references:${userId}`, PER_MINUTE)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } })
  }
  const cardId = new URL(req.url).searchParams.get('card_id') ?? ''
  if (!UUID.test(cardId)) return NextResponse.json({ error: 'card_id is required' }, { status: 400 })

  const supabase = await supabaseAsUser()
  const { data: card, error } = await supabase.from('cards').select('id, recording_id, title, gist, visual_query, shape, source').eq('id', cardId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [people, pinterestToken] = await Promise.all([
    peopleFor(supabase, userId, card.recording_id as string | null).catch(() => [] as string[]),
    accessToken(userId).catch(() => null),
  ])
  try {
    return NextResponse.json(await findReferences(card, { people, pinterestToken }))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'References failed' }, { status: 400 })
  }
}
