// apps/web/app/api/inspiration/listen/route.ts
// POST /api/inspiration/listen (body: a few seconds of audio, audio/mp4 or audio/m4a) → { text } (inspiration demo,
// behind INSPIRATION_ENABLED — lib/inspiration.ts). The test screen's mic: what she said, as a search query. The
// bytes go to Deepgram in the request (packages/pipeline/transcribe.ts transcribeQuery) and are stored nowhere.

import { NextResponse } from 'next/server'
import { transcribeQuery } from '@ivywolf/pipeline/transcribe'
import { inspirationGate } from '@/lib/inspiration'

export const runtime = 'nodejs'
export const maxDuration = 30

/** About 30 s of the app's mic preset; a search query is a sentence. */
const MAX_BYTES = 1_000_000
const AUDIO = /^audio\/(mp4|m4a|x-m4a|aac|mpeg|wav|webm)$/

export async function POST(req: Request) {
  const blocked = await inspirationGate('listen')
  if (blocked) return blocked

  const contentType = (req.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!AUDIO.test(contentType)) return NextResponse.json({ error: 'Send audio (audio/mp4)' }, { status: 415 })
  const audio = await req.arrayBuffer()
  if (audio.byteLength === 0) return NextResponse.json({ error: 'No audio' }, { status: 400 })
  if (audio.byteLength > MAX_BYTES) return NextResponse.json({ error: 'Too long — say a few words' }, { status: 413 })

  try {
    return NextResponse.json({ text: await transcribeQuery(audio, contentType) })
  } catch (err) {
    console.error('[inspiration/listen] failed:', err)
    return NextResponse.json({ error: 'Couldn’t hear that' }, { status: 502 })
  }
}
