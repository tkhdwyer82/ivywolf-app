// apps/web/app/api/inspiration/search/route.ts
// GET /api/inspiration/search?q=&limit=24&people= → { items, expires_in } (inspiration demo, behind
// INSPIRATION_ENABLED — lib/inspiration.ts). Nearest by text embedding with a small boost for keywords the query
// names, about one video in five, each with a signed URL good for an hour. An empty q shows the newest.
// people=none|hands|person keeps only pictures with that much of a person in them.

import { NextResponse } from 'next/server'
import { PEOPLE, SIGNED_URL_SECONDS, inspirationDb, searchInspiration, type People } from '@ivywolf/pipeline/inspiration'
import { clampInt, inspirationGate } from '@/lib/inspiration'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_QUERY = 200

export async function GET(req: Request) {
  const blocked = await inspirationGate('search')
  if (blocked) return blocked

  const params = new URL(req.url).searchParams
  const q = (params.get('q') ?? '').slice(0, MAX_QUERY)
  const limit = clampInt(params.get('limit'), 24, 1, 24)
  const people = params.get('people') || undefined
  if (people && !PEOPLE.includes(people as People)) {
    return NextResponse.json({ error: `people must be one of ${PEOPLE.join(', ')}` }, { status: 400 })
  }

  try {
    const items = await searchInspiration(inspirationDb(), { q, limit, people: people as People | undefined })
    return NextResponse.json({ items, expires_in: SIGNED_URL_SECONDS })
  } catch (err) {
    console.error('[inspiration/search] failed:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 502 })
  }
}
