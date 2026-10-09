// scripts/run-h0-tests.ts
// Live runs through the gateway, from one idea on the simulator / test account (H.0a, H.0b): Kling 3.0 Standard and
// Seedance 2.5 (5 s) on each route, Seedance at 480p on the cheaper route, and SOUL V2 when a Soul ID is given.
// Prints estimate vs actual cost and latency per run, and where each output now lives. Spends real Higgsfield credits.
//
//   npx tsx --env-file=.env.local scripts/run-h0-tests.ts                      # all three
//   ONLY='kling fal,seedance fal' npx tsx --env-file=.env.local scripts/run-h0-tests.ts
//   ONLY=soul SOUL_ID=<uuid> npx tsx --env-file=.env.local scripts/run-h0-tests.ts
//
// CARD_ID picks the idea (default: the test account's "Rooftop chase ending with Ivy Mini"). SOUL_ID is a completed
// Soul ID (v2) on this Higgsfield account; without it the Soul run is skipped. Needs migration 0035 applied.

import { createClient } from '@supabase/supabase-js'
import { generate, type Ref } from '../packages/pipeline/generate'
import { peopleFor } from '../packages/pipeline/redact'
import { buildBrief } from '../packages/pipeline/generate/brief'

const TEST_ACCOUNT = 'user_3JfYR4D8eJVCL3yieXStYYoqwaH'
const CARD_ID = process.env.CARD_ID ?? '9f449fb5-6068-4915-bc53-f1d9127379b1'

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: card, error } = await supabase.from('cards').select('id, creator_id, recording_id, title, gist').eq('id', CARD_ID).single()
  if (error || !card) throw new Error(`card ${CARD_ID}: ${error?.message ?? 'missing'}`)
  if (card.creator_id !== TEST_ACCOUNT) throw new Error('Refusing: that card is not the test account’s (never send another creator’s data).')
  const { data: pack } = await supabase.from('style_packs').select('tone_words').eq('creator_id', TEST_ACCOUNT).maybeSingle()
  // Job H.0a: the Figma idea is "Rooftop chase, night"; this card is its test-account twin, so night is added. The
  // style pack fills gaps and never contradicts the idea (brief.ts): "soft daylight" goes, "film grain" stays.
  const built = buildBrief({ idea: [`${card.title}, at night`, card.gist as string], tone: (pack?.tone_words as string[] | undefined) ?? [] })
  if (built.dropped.length) console.log(`brief: dropped ${built.dropped.map((d) => `"${d.word}" (${d.because.join('/')})`).join(', ')}`)
  const brief = built.text
  const people = await peopleFor(supabase, TEST_ACCOUNT, card.recording_id as string | null)

  // H.0b: each video model through fal and Higgsfield (forced), then Seedance at 480p on whichever route is cheaper.
  // H.0a's runs used the earlier brief, which still carried "soft daylight"; these use buildBrief.
  type Run = { label: string; model: string; route?: 'higgsfield' | 'fal'; params?: Record<string, unknown>; refs?: Ref[] }
  const soulId = process.env.SOUL_ID
  const all: Run[] = [
    { label: 'kling fal', model: 'kling-3.0-std-t2v', route: 'fal' },
    { label: 'kling higgsfield', model: 'kling-3.0-std-t2v', route: 'higgsfield' },
    { label: 'seedance fal', model: 'seedance-2.5-t2v', route: 'fal' },
    { label: 'seedance higgsfield', model: 'seedance-2.5-t2v', route: 'higgsfield' },
    { label: 'seedance 480p cheapest', model: 'seedance-2.5-t2v', params: { resolution: '480p' } },
    ...(soulId ? [{ label: 'soul', model: 'soul-2', refs: [{ kind: 'character' as const, ids: { higgsfield: soulId } }] }] : []),
  ]
  const runs = all.filter((r) => !process.env.ONLY || process.env.ONLY.split(',').includes(r.label))
  console.log(`brief: ${brief}`)

  // In parallel: separate requests on separate routes; latency is each request's own submit → terminal.
  const rows = await Promise.all(
    runs.map(async (r) => {
      const resolution = r.model.startsWith('seedance') ? String(r.params?.resolution ?? '720p') : '720p'
      try {
        const out = await generate({ creatorId: TEST_ACCOUNT, model: r.model, brief, refs: r.refs, params: r.params, route: r.route, cardId: card.id, people })
        const others = out.estimates.filter((e) => e.route !== out.route).map((e) => `${e.route} ${e.estimate ? '$' + e.estimate.usd : e.error}`).join(', ')
        return { run: r.label, route: out.route, resolution, status: out.status, estimate_usd: out.estimateUsd, actual_usd: out.actualUsd, latency_s: out.latencyMs == null ? null : +(out.latencyMs / 1000).toFixed(1), other_route: others, runId: out.runId, output: out.outputUrl, error: out.error }
      } catch (e) {
        return { run: r.label, resolution, status: 'error', error: e instanceof Error ? e.message : String(e) }
      }
    })
  )
  console.table(rows.map(({ output, runId, ...r }) => r))
  for (const r of rows) if ('output' in r && r.output) console.log(`${r.run}\t${r.runId}\t${r.output}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
