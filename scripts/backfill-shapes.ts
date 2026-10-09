// scripts/backfill-shapes.ts
// Gives cards made before Job B revised (0033) their form: runs the classifier's shape pass (packages/pipeline/shape.ts,
// shape_v1, the same call analyse() makes after classify) over a creator's unshaped cards, recording by recording, and
// writes shape, visual_query, quote, diagram and board as graph.ts does (shape_set_by 'ivy'). It doesn't re-classify:
// no card, thread or segment is created or changed beyond those columns. No photo search (that's photoForCard).
//
//   npx tsx --env-file=.env.local scripts/backfill-shapes.ts              # the test account, dry run: prints, writes nothing
//   npx tsx --env-file=.env.local scripts/backfill-shapes.ts --write
//   CREATOR=user_… npx tsx --env-file=.env.local scripts/backfill-shapes.ts
//
// Never touches a card whose form she chose (shape_set_by 'creator') or one that already has a shape.

import { createClient } from '@supabase/supabase-js'
import { shapeCards } from '../packages/pipeline/shape'
import type { ClassifyOutput } from '../packages/pipeline/classify'

const CREATOR = process.env.CREATOR ?? 'user_3JfYR4D8eJVCL3yieXStYYoqwaH' // the simulator / test account
const WRITE = process.argv.includes('--write')

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: cards, error } = await db
    .from('cards')
    .select('id, recording_id, segment_id, title, gist, confidence, shape, shape_set_by, segments(text)')
    .eq('creator_id', CREATOR)
    .is('shape', null)
    .not('recording_id', 'is', null)
    .order('created_at')
  if (error) throw new Error(error.message)
  const todo = (cards ?? []).filter((c) => c.shape_set_by !== 'creator')
  const { data: people } = await db.from('entities').select('canonical_name').eq('creator_id', CREATOR).eq('kind', 'person')
  const names = (people ?? []).map((p) => p.canonical_name as string)
  console.log(`${CREATOR}: ${todo.length} unshaped card(s)${WRITE ? '' : ' — dry run, nothing written'}\n`)

  const byRecording = new Map<string, typeof todo>()
  for (const c of todo) byRecording.set(c.recording_id as string, [...(byRecording.get(c.recording_id as string) ?? []), c])

  let written = 0
  for (const [recordingId, group] of byRecording) {
    // The shape pass reads each card's title, gist, confidence and its segment's words — nothing else.
    const out = {
      cards: group.map((c, i) => ({ title: c.title, gist: c.gist, confidence: c.confidence, segment_index: i })),
      segments: group.map((c) => ({ text: (c.segments as unknown as { text: string } | null)?.text ?? '' })),
    } as unknown as ClassifyOutput
    const shaped = await shapeCards({ out, people: names })
    for (const [i, c] of group.entries()) {
      const s = shaped.cards[i]
      console.log(`${s.shape.padEnd(7)} ${c.title}${s.visual_query ? `  — "${s.visual_query}"` : ''}`)
      if (!WRITE) continue
      const { error: e } = await db
        .from('cards')
        .update({ shape: s.shape, shape_set_by: 'ivy', visual_query: s.visual_query || null, quote: s.quote, diagram: s.diagram, board: s.board })
        .eq('id', c.id)
        .is('shape', null) // never over a form set since this read
      if (e) console.error(`  ${c.id}: ${e.message}`)
      else written++
    }
    console.log(`  (recording ${recordingId.slice(0, 8)}, shape_version ${shaped.shape_version})`)
  }
  if (WRITE) console.log(`\n${written} card(s) written`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
