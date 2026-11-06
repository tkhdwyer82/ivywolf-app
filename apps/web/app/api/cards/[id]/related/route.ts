// apps/web/app/api/cards/[id]/related/route.ts
// More to explore (Job B.8a, idea page I1): GET → her other ideas most like this one, by cosine similarity on the
// embeddings the cards already have (packages/pipeline/embed.ts), the same way the MCP's search_ideas ranks. No model
// call, nothing stored, free. Read under her RLS: only her own cards are ever compared or returned. ?limit= up to 24.
// Returns ids in order; the app reads the cards themselves (CARD_COLUMNS), as Home does.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { cosine } from '@ivywolf/pipeline'
import { supabaseAsUser } from '@/lib/supabase'
import { allow } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Her most recent cards compared against; more than enough for a pilot creator. */
const POOL = 1000
const DEFAULT_LIMIT = 12
const MAX_LIMIT = 24

const vector = (e: unknown): number[] | null => {
  if (Array.isArray(e)) return e as number[]
  if (typeof e === 'string') {
    try {
      return JSON.parse(e) as number[]
    } catch {
      return null
    }
  }
  return null
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allow(`related:${userId}`, 60)) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || DEFAULT_LIMIT))

  const supabase = await supabaseAsUser()
  const { data: card } = await supabase.from('cards').select('id, embedding').eq('id', id).maybeSingle()
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const me = vector(card.embedding)
  // No embedding yet (just recorded, or a pinned card): nothing to rank by. The page shows no section rather than a guess.
  if (!me) return NextResponse.json({ ids: [] })

  const { data: rows, error } = await supabase
    .from('cards')
    .select('id, embedding')
    .neq('id', id)
    .is('trashed_at', null)
    .not('embedding', 'is', null)
    .order('created_at', { ascending: false })
    .limit(POOL)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ranked = (rows ?? [])
    .map((r) => ({ id: r.id as string, v: vector(r.embedding) }))
    .filter((r): r is { id: string; v: number[] } => !!r.v && r.v.length === me.length)
    .map((r) => ({ id: r.id, score: cosine(me, r.v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  return NextResponse.json({ ids: ranked.map((r) => r.id) })
}
