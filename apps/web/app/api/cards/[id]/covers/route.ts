// apps/web/app/api/cards/[id]/covers/route.ts
// ••• → Change cover on the idea page (B.12, behind INSPIRATION_ENABLED — lib/inspiration.ts; off, both are 404):
//   GET  → { items, expires_in }: the Ivy library's six photos nearest the idea's words, signed for an hour
//   POST { item_id } → { ok: true }: that photo becomes the cover, copied into her frames folder and credited
//        "Ivy library" (packages/pipeline/covers.ts). 409 when the cover is her own picture — that's never swapped.
// Only her own card: the pipeline reads it with the service role filtered by her id, so anyone else's id is a 404.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { chooseLibraryCover, coverChoices } from '@ivywolf/pipeline/covers'
import { SIGNED_URL_SECONDS } from '@ivywolf/pipeline/inspiration'
import { inspirationGate } from '@/lib/inspiration'

export const runtime = 'nodejs'
export const maxDuration = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await inspirationGate('covers')
  if (blocked) return blocked
  const { userId } = await auth()
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const items = await coverChoices(userId!, id)
    if (!items) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ items, expires_in: SIGNED_URL_SECONDS })
  } catch (err) {
    console.error(`[cards/covers] ${id} failed:`, err)
    return NextResponse.json({ error: 'Covers failed' }, { status: 502 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await inspirationGate('covers')
  if (blocked) return blocked
  const { userId } = await auth()
  const { id } = await params
  const body = (await req.json().catch(() => null)) as { item_id?: unknown } | null
  const itemId = typeof body?.item_id === 'string' ? body.item_id : ''
  if (!UUID.test(id) || !UUID.test(itemId)) return NextResponse.json({ error: 'card id and item_id are required' }, { status: 400 })
  try {
    const result = await chooseLibraryCover(userId!, id, itemId)
    if (result === 'no-card' || result === 'no-item') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (result === 'own') return NextResponse.json({ error: 'This idea wears her own picture' }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[cards/covers] ${id} set failed:`, err)
    return NextResponse.json({ error: 'Could not change the cover' }, { status: 502 })
  }
}
