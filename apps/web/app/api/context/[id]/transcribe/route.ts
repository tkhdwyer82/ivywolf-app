// apps/web/app/api/context/[id]/transcribe/route.ts
// Add context → Voice note (Job C+, Figma 1453:106): write down a voice note she attached to an idea. The note sits in
// the private `context` bucket (0034); Deepgram fetches it from a short-lived signed URL, as recordings are, and the
// words go onto the card_context row. The card itself is never touched — context never rewrites the card.
//
// Everything runs as her (supabaseAsUser): RLS finds only her own row, and only her own folder can be signed.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { transcribe } from '@ivywolf/pipeline'
import { supabaseAsUser } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await supabaseAsUser()
  const { data: row, error } = await supabase.from('card_context').select('id, kind, url, meta').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row || row.kind !== 'voice' || !row.url) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const meta = (row.meta ?? {}) as Record<string, unknown>
  const write = (patch: { content?: string | null; meta: Record<string, unknown> }) => supabase.from('card_context').update(patch).eq('id', id)

  try {
    const { data: signed, error: signError } = await supabase.storage.from('context').createSignedUrl(row.url, 10 * 60)
    if (signError || !signed) throw new Error(`sign: ${signError?.message ?? 'no url'}`)
    const t = await transcribe(signed.signedUrl)
    const words = t.utterances.map((u) => u.text).join(' ').trim()
    await write({ content: words || null, meta: { ...meta, status: 'done', duration_ms: t.duration_ms || meta.duration_ms } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[context/transcribe] ${id} failed:`, err)
    await write({ meta: { ...meta, status: 'failed' } })
    return NextResponse.json({ error: 'Could not transcribe' }, { status: 502 })
  }
}
