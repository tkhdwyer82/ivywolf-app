// scripts/backfill-frames.ts
// Frame every existing card and to-do still at frame_status 'none'. Rows from before classify_v6 have no
// frame_brief, so each such recording's stored transcript is re-classified with the shipping prompt (one Claude
// call, no re-transcription) and only frame_brief is taken from it — matched by time: a card by play_from_ms, a
// to-do by its segment's start, each within 3 s. Nothing else on the row changes. Unmatched rows go typographic.
//
//   npx tsx --env-file=.env.local scripts/backfill-frames.ts [--dry-run]

import { createClient } from '@supabase/supabase-js'
import type { Utterance } from '@ivywolf/schema'
import { classify, PROMPT_VERSION, recordedDay } from '../packages/pipeline/classify'
import { loadCreatorContext } from '../packages/pipeline/graph'
import { frameRecording } from '../packages/pipeline/frames'

const TOLERANCE_MS = 3000
const dryRun = process.argv.includes('--dry-run')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

function ok<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

async function main() {
  const cards = ok('cards', await db.from('cards').select('id, recording_id, creator_id, title, play_from_ms, frame_brief').eq('frame_status', 'none')) as {
    id: string; recording_id: string; creator_id: string; title: string; play_from_ms: number; frame_brief: string | null
  }[]
  const actions = ok('actions', await db.from('actions').select('id, recording_id, creator_id, text, frame_brief, segments(start_ms)').eq('frame_status', 'none')) as unknown as {
    id: string; recording_id: string | null; creator_id: string; text: string; frame_brief: string | null; segments: { start_ms: number } | null
  }[]
  console.log(`at 'none': ${cards.length} card(s), ${actions.length} to-do(s)`)

  const recordings = new Map<string, string>() // recording id → creator id
  for (const r of [...cards, ...actions]) if (r.recording_id) recordings.set(r.recording_id, r.creator_id)

  for (const [recordingId, creatorId] of recordings) {
    const needsBriefs =
      cards.some((c) => c.recording_id === recordingId && c.frame_brief === null) ||
      actions.some((a) => a.recording_id === recordingId && a.frame_brief === null)
    if (needsBriefs) {
      const rec = ok('recording', await db.from('recordings').select('transcript, source, recorded_at, recorded_tz').eq('id', recordingId).single()) as {
        transcript: Utterance[] | null; source: never; recorded_at: string | null; recorded_tz: string | null
      }
      if (Array.isArray(rec.transcript) && rec.transcript.length) {
        const out = await classify({
          utterances: rec.transcript,
          creator: await loadCreatorContext(creatorId),
          source: rec.source,
          recorded: recordedDay(rec.recorded_at, rec.recorded_tz),
        })
        for (const c of cards.filter((x) => x.recording_id === recordingId && x.frame_brief === null)) {
          const match = out.cards.find((o) => Math.abs(o.play_from_ms - c.play_from_ms) <= TOLERANCE_MS)
          console.log(`card "${c.title}": ${match ? `"${match.frame_brief}"` : 'no match → typographic'}`)
          if (match && !dryRun) ok('card brief', await db.from('cards').update({ frame_brief: match.frame_brief }).eq('id', c.id))
        }
        for (const a of actions.filter((x) => x.recording_id === recordingId && x.frame_brief === null)) {
          const match = a.segments
            ? out.actions.find((o) => Math.abs((out.segments[o.segment_index]?.start_ms ?? -1e9) - a.segments!.start_ms) <= TOLERANCE_MS)
            : undefined
          console.log(`to-do "${a.text}": ${match ? `"${match.frame_brief}"` : 'no match → typographic'}`)
          if (match && !dryRun) ok('action brief', await db.from('actions').update({ frame_brief: match.frame_brief }).eq('id', a.id))
        }
      } else {
        console.log(`recording ${recordingId}: no stored transcript → typographic`)
      }
    }
    if (!dryRun) await frameRecording(creatorId, recordingId)
  }
  if (dryRun) return
  const after = ok('after', await db.from('cards').select('title, frame_status, frame_url').in('recording_id', [...recordings.keys()]))
  const afterA = ok('after', await db.from('actions').select('text, frame_status, frame_url').in('recording_id', [...recordings.keys()]))
  console.log(JSON.stringify({ prompt: PROMPT_VERSION, cards: after, actions: afterA }, null, 1))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
