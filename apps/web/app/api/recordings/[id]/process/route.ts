// apps/web/app/api/recordings/[id]/process/route.ts
// The app uploads a recording and inserts its row with the creator's own JWT, then calls this to run the pipeline.
//
// Ownership is checked with supabaseAsUser() — RLS on recordings means a creator can only see their own row, so a
// row that comes back is theirs. Only then does the pipeline worker run, which uses the service role (the one
// server path besides the Stripe webhook allowed to; see lib/supabase.ts).

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { processRecording } from '@ivywolf/pipeline'
import { supabaseAsUser } from '@/lib/supabase'

export const runtime = 'nodejs'
// Deepgram + classify on a few minutes of audio.
export const maxDuration = 300

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await supabaseAsUser()
  const { data: rec, error } = await supabase
    .from('recordings')
    .select('id, transcript, is_junk')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Processed already (transcript set, or marked junk): don't classify twice.
  if (rec.transcript !== null || rec.is_junk) {
    return NextResponse.json({ status: 'already_processed' }, { status: 409 })
  }

  try {
    const result = await processRecording(id)
    return NextResponse.json(
      result.junk
        ? { status: 'junk', reason: result.junk }
        : { status: 'processed', cards: result.out.cards.length, title: result.out.title }
    )
  } catch (err) {
    console.error(`[recordings/process] ${id} failed:`, err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
