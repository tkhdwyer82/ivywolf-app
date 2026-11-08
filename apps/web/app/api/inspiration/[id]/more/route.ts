// apps/web/app/api/inspiration/[id]/more/route.ts
// GET /api/inspiration/{id}/more?limit=6 → { items, expires_in } (inspiration demo, behind INSPIRATION_ENABLED —
// lib/inspiration.ts). "More like this" for one library item: pictures that look alike (image embedding) alternated
// with ones of the same look (same folder), never the item itself and never two near-duplicates side by side.

import { NextResponse } from 'next/server'
import { SIGNED_URL_SECONDS, inspirationDb, moreLikeThis } from '@ivywolf/pipeline/inspiration'
import { clampInt, inspirationGate } from '@/lib/inspiration'

export const runtime = 'nodejs'
export const maxDuration = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await inspirationGate('more')
  if (blocked) return blocked

  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const limit = clampInt(new URL(req.url).searchParams.get('limit'), 6, 1, 24)

  try {
    const items = await moreLikeThis(inspirationDb(), id, limit)
    if (!items) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ items, expires_in: SIGNED_URL_SECONDS })
  } catch (err) {
    console.error(`[inspiration/more] ${id} failed:`, err)
    return NextResponse.json({ error: 'More like this failed' }, { status: 502 })
  }
}
