// scripts/run-h0-tests.ts
// Job H.0a's three live runs through the gateway, from one idea on the simulator / test account:
//   Kling 3.0 Standard (5 s), Seedance 2.5 (5 s), and SOUL V2 (image) with a character reference.
// Prints estimate vs actual cost and latency per run, and where each output now lives. Spends real Higgsfield credits.
//
//   npx tsx --env-file=.env.local scripts/run-h0-tests.ts                      # all three
//   ONLY=soul-2 SOUL_ID=<uuid> npx tsx --env-file=.env.local scripts/run-h0-tests.ts
//
// CARD_ID picks the idea (default: the test account's "Rooftop chase ending with Ivy Mini"). SOUL_ID is a completed
// Soul ID (v2) on this Higgsfield account; without it the Soul run is skipped. Needs migration 0035 applied.

import { createClient } from '@supabase/supabase-js'
import { generate, type Ref } from '../packages/pipeline/generate'
import { peopleFor } from '../packages/pipeline/redact'

const TEST_ACCOUNT = 'user_3JfYR4D8eJVCL3yieXStYYoqwaH'
const CARD_ID = process.env.CARD_ID ?? '9f449fb5-6068-4915-bc53-f1d9127379b1'

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: card, error } = await supabase.from('cards').select('id, creator_id, recording_id, title, gist').eq('id', CARD_ID).single()
  if (error || !card) throw new Error(`card ${CARD_ID}: ${error?.message ?? 'missing'}`)
  if (card.creator_id !== TEST_ACCOUNT) throw new Error('Refusing: that card is not the test account’s (never send another creator’s data).')
  const { data: pack } = await supabase.from('style_packs').select('tone_words').eq('creator_id', TEST_ACCOUNT).maybeSingle()
  const tone = ((pack?.tone_words as string[] | undefined) ?? []).join(', ')
  const brief = [card.title, card.gist, tone && `Look: ${tone}`].filter(Boolean).join('. ')
  const people = await peopleFor(supabase, TEST_ACCOUNT, card.recording_id as string | null)

  const soulId = process.env.SOUL_ID
  const runs: { model: string; refs?: Ref[] }[] = [
    { model: 'kling-3.0-std-t2v' },
    { model: 'seedance-2.5-t2v' },
    ...(soulId ? [{ model: 'soul-2', refs: [{ kind: 'character' as const, ids: { higgsfield: soulId } }] }] : []),
  ].filter((r) => !process.env.ONLY || process.env.ONLY.split(',').includes(r.model))
  if (!soulId) console.warn('SOUL_ID not set: skipping the SOUL V2 run.')

  const rows = []
  for (const r of runs) {
    console.log(`→ ${r.model} …`)
    try {
      const out = await generate({ creatorId: TEST_ACCOUNT, model: r.model, brief, refs: r.refs, cardId: card.id, people })
      rows.push({ model: r.model, route: out.route, status: out.status, estimate_usd: out.estimateUsd, actual_usd: out.actualUsd, latency_s: out.latencyMs == null ? null : +(out.latencyMs / 1000).toFixed(1), output: out.outputUrl, error: out.error })
    } catch (e) {
      rows.push({ model: r.model, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }
  console.table(rows.map(({ output, ...r }) => r))
  for (const r of rows) if ('output' in r && r.output) console.log(`${r.model}: ${r.output}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
