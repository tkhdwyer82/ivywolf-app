// scripts/test-meta-merge.ts
// Classification merges into recordings.meta instead of replacing it: a Muse capture keeps the text and context it
// arrived with. Runs against the linked project with a throwaway creator (removed afterwards). The recording is written
// as lib/mcp/capture.ts writes one and processed by the real pipeline — one Claude classify, one shape call and Voyage
// embeddings — with Unsplash and fal stubbed at fetch, so no picture is searched for or drawn.
//
//   npx tsx --env-file=.env.local scripts/test-meta-merge.ts

import { createClient } from '@supabase/supabase-js'
import { processRecording, textUtterances } from '../packages/pipeline/process'

let failed = 0
function check(name: string, pass: boolean, detail = '') {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
function ok<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const CREATOR = 'user_test_meta_merge'
const TEXT = 'Open the candle restock video with Mara catching the box on the rooftop. Remind me to book the rooftop for Saturday.'
const CONTEXT = 'from Charm'

process.env.UNSPLASH_ACCESS_KEY ||= 'stub'
process.env.FAL_KEY ||= 'stub'
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const host = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).host
  if (host === 'api.unsplash.com') return new Response(JSON.stringify({ results: [] }), { status: 200 })
  if (host === 'fal.run') return new Response('stubbed', { status: 503 })
  return realFetch(input, init)
}) as typeof fetch

async function main() {
  await db.from('creators').delete().eq('id', CREATOR)
  ok('creator', await db.from('creators').insert({ id: CREATOR, handle: 'test_meta_merge' }))

  // As capture.ts inserts it, already claimed (claimRecording: queued → processing).
  const rec = ok('recording', await db.from('recordings').insert({
    creator_id: CREATOR, source: 'muse', kind: 'text', storage_path: null, trigger: 'muse', status: 'processing',
    recorded_at: new Date().toISOString(), transcript: textUtterances(TEXT), meta: { text: TEXT, context: CONTEXT },
  }).select('id').single())!

  const result = await processRecording(rec.id)
  check('the capture was classified, not junked', result.junk === null, String(result.junk))

  const after = ok('after', await db.from('recordings').select('status, source, meta').eq('id', rec.id).single())! as {
    status: string; source: string; meta: Record<string, unknown>
  }
  check('meta keeps the captured text', after.meta.text === TEXT, JSON.stringify(after.meta.text))
  check('meta keeps the context', after.meta.context === CONTEXT, JSON.stringify(after.meta.context))
  check('meta gains the classification fields', typeof after.meta.prompt_version === 'string' && Array.isArray(after.meta.people), JSON.stringify(after.meta))
  check('the recording is done and still from Muse (the "via Muse" badge reads source)', after.status === 'done' && after.source === 'muse', `${after.status} ${after.source}`)
  const cards = ok('cards', await db.from('cards').select('id').eq('recording_id', rec.id))!
  check('it made at least one card', cards.length > 0, String(cards.length))
}

main()
  .catch((err) => {
    failed++
    console.error(err)
  })
  .finally(async () => {
    globalThis.fetch = realFetch
    await db.from('creators').delete().eq('id', CREATOR)
    console.log(failed ? `\n${failed} failed` : '\nall passed')
    process.exit(failed ? 1 : 0)
  })
