// apps/web/app/api/recordings/[id]/process/route.ts
// The app uploads a recording and inserts its row (status 'queued') with the creator's own JWT, then calls this.
// It returns immediately; the app polls recordings.status.
//
// 1. Ownership is checked with supabaseAsUser() — RLS on recordings means only the creator's own row comes back.
// 2. claimRecording() moves the row queued → processing in one conditional UPDATE, so a duplicate submit (double
//    tap, retry) gets 409 instead of a second pipeline run.
// 3. The pipeline runs after the response via after(), with the service role (the pipeline worker; lib/supabase.ts).
//    On Vercel, after() keeps the function alive up to maxDuration.

import { after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { claimRecording, markFailed, processRecording } from '@ivywolf/pipeline'
import { supabaseAsUser } from '@/lib/supabase'

export const runtime = 'nodejs'
// Deepgram + classify on a few minutes of audio, run after the response.
export const maxDuration = 300

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await supabaseAsUser()
  const { data: rec, error } = await supabase.from('recordings').select('id, status').eq('id', id).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await claimRecording(id))) {
    return NextResponse.json({ status: rec.status, error: 'Already submitted' }, { status: 409 })
  }

  after(async () => {
    try {
      await processRecording(id)
    } catch (err) {
      console.error(`[recordings/process] ${id} failed:`, err)
      await markFailed(id, err instanceof Error ? err.message : String(err)).catch((e) =>
        console.error(`[recordings/process] ${id} could not be marked failed:`, e)
      )
    }
  })

  return NextResponse.json({ status: 'processing' }, { status: 202 })
}
