// scripts/test-redact.ts
// The name guard (redact.ts): no person heard in a recording reaches Unsplash or fal.ai by name, whatever the prompts
// produced. Part 1 is pure. Part 2 runs against the linked project with a throwaway creator (removed afterwards) and
// stubs Unsplash and fal at fetch, so nothing leaves and nothing is spent:
//
//   npx tsx --env-file=.env.local scripts/test-redact.ts
//
//   writeClassification stores the recording's people (name, canonical, aliases heard, aliases on file) in meta.people
//   frameRecording sends Unsplash a visual_query and fal a prompt with none of those words, and logs that it stripped
//   a recording with no meta.people (classified before the guard) falls back to the creator's known people
//   a brief that was nothing but a name is not drawn at all

import { createClient } from '@supabase/supabase-js'
import { stripPeople } from '../packages/pipeline/redact'
import { frameRecording, photoForCard } from '../packages/pipeline/frames'
import { writeClassification } from '../packages/pipeline/graph'
import { PROMPT_VERSION } from '../packages/pipeline/classify'

let failed = 0
function check(name: string, pass: boolean, detail = '') {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── Part 1: stripPeople ──────────────────────────────────────────────────────────────────────────────────────
let r = stripPeople('Mara wrapping a candle box', ['Mara'])
check('a name is removed', r.text === 'wrapping a candle box' && r.removed === 1, JSON.stringify(r))
r = stripPeople("ARABELLA's dog on a beach", ['Arabella Stone'])
check("any case, possessive 's with it, multi-word names by word", r.text === 'dog on a beach' && r.removed === 1, JSON.stringify(r))
r = stripPeople('Arabella Stone, laughing at a café', ['Arabella Stone'])
check('punctuation left by a removed name is tidied', r.text === 'laughing at a café' && r.removed === 2, JSON.stringify(r))
r = stripPeople('a paper bag of lemons', ['Mara'])
check('no name, no change', r.text === 'a paper bag of lemons' && r.removed === 0)
r = stripPeople('Marathon runners at dawn', ['Mara'])
check('whole words only: Mara is not in Marathon', r.text === 'Marathon runners at dawn' && r.removed === 0)
r = stripPeople('Jo and a dog', ['J', 'Jo'])
check('one-letter names are ignored, two-letter ones match', r.text === 'and a dog' && r.removed === 1, JSON.stringify(r))
r = stripPeople('Abela', ['Abela'])
check('a query that was only a name comes back empty', r.text === '' && r.removed === 1, JSON.stringify(r))

// ── Part 2: the pipeline, with Unsplash and fal stubbed ──────────────────────────────────────────────────────
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const CREATOR = 'user_test_redact'
process.env.UNSPLASH_ACCESS_KEY ||= 'stub'
process.env.FAL_KEY ||= 'stub'

const outbound: { to: 'unsplash' | 'fal'; text: string }[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  if (url.host === 'api.unsplash.com') {
    outbound.push({ to: 'unsplash', text: url.searchParams.get('query') ?? '' })
    return new Response(JSON.stringify({ results: [] }), { status: 200 })
  }
  if (url.host === 'fal.run') {
    outbound.push({ to: 'fal', text: JSON.parse(String(init?.body ?? '{}')).prompt ?? '' })
    return new Response('stubbed', { status: 503 })
  }
  return realFetch(input, init)
}) as typeof fetch

const warnings: string[] = []
const realWarn = console.warn
console.warn = (...a: unknown[]) => {
  warnings.push(a.map(String).join(' '))
  realWarn(...a)
}

function ok<T>(label: string, res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`${label}: ${res.error.message}`)
  return res.data
}
const NAMES = /arabella|abela|bella|stone|mara/i

async function main() {
  await db.from('creators').delete().eq('id', CREATOR)
  ok('creator', await db.from('creators').insert({ id: CREATOR, handle: 'test_redact' }))
  // Known to Ivy already, with an alias the transcript didn't use this time.
  ok('entity', await db.from('entities').insert({ creator_id: CREATOR, kind: 'person', canonical_name: 'Arabella Stone', aliases: ['Bella'], resolved: true }))

  const rec = ok('recording', await db.from('recordings').insert({ creator_id: CREATOR, source: 'phone', storage_path: `${CREATOR}/a.m4a` }).select('id').single())!
  await writeClassification({
    creatorId: CREATOR,
    recordingId: rec.id,
    transcript: [],
    promptVersion: PROMPT_VERSION,
    projectId: null,
    out: {
      trigger: 'none', title: 'Test', segments: [], cards: [], actions: [], loose_ends: [], requests: [], style_signals: [], shape_version: null,
      entities: [
        { name: 'Abela', kind: 'person', canonical: 'Arabella Stone', aliases_seen: ['Abela'] },
        { name: 'Mara', kind: 'person', canonical: null, aliases_seen: [] },
        { name: 'Kinfolk', kind: 'brand', canonical: null, aliases_seen: [] },
      ],
    },
  })
  const meta = ok('meta', await db.from('recordings').select('meta').eq('id', rec.id).single())!.meta as { people?: string[] }
  const people = new Set((meta.people ?? []).map((p) => p.toLowerCase()))
  check('meta.people: names heard, canonical and aliases on file; not brands',
    ['abela', 'arabella stone', 'bella', 'mara'].every((n) => people.has(n)) && !people.has('kinfolk'), JSON.stringify(meta.people))

  ok('card', await db.from('cards').insert({
    creator_id: CREATOR, recording_id: rec.id, title: 'Box', gist: 'g', play_from_ms: 0, confidence: 0.9,
    shape: 'photo', shape_set_by: 'ivy', visual_query: "Abela's hands wrapping a candle box",
  }))
  ok('action', await db.from('actions').insert({ creator_id: CREATOR, recording_id: rec.id, text: 'Call Mara', frame_brief: 'Mara with a parcel at a post office counter' }))
  ok('action', await db.from('actions').insert({ creator_id: CREATOR, recording_id: rec.id, text: 'Ask Bella', frame_brief: 'Bella' }))
  await frameRecording(CREATOR, rec.id)

  const unsplash = outbound.filter((o) => o.to === 'unsplash')
  const fal = outbound.filter((o) => o.to === 'fal')
  check('Unsplash gets the query without the name', unsplash.length === 1 && unsplash[0].text === 'hands wrapping a candle box', JSON.stringify(unsplash))
  check('fal gets the brief without the name', fal.length === 1 && fal[0].text.startsWith('with a parcel at a post office counter') && !NAMES.test(fal[0].text), JSON.stringify(fal))
  const nameOnly = ok('a', await db.from('actions').select('frame_status').eq('creator_id', CREATOR).eq('text', 'Ask Bella').single())!
  check('a brief that was only a name is not drawn', nameOnly.frame_status === 'typographic', nameOnly.frame_status)
  check('each strip is logged, as a count, never the name',
    warnings.filter((w) => w.includes('name word(s)')).length === 3 && !warnings.some((w) => w.includes('name word(s)') && NAMES.test(w)), JSON.stringify(warnings))

  // A recording classified before the guard: no meta.people → the creator's known people.
  outbound.length = 0
  const old = ok('old recording', await db.from('recordings').insert({ creator_id: CREATOR, source: 'phone', storage_path: `${CREATOR}/b.m4a`, meta: { prompt_version: 'classify_v6' } }).select('id').single())!
  const oldCard = ok('old card', await db.from('cards').insert({
    creator_id: CREATOR, recording_id: old.id, title: 'Old', gist: 'g', play_from_ms: 0, confidence: 0.9,
    shape: 'photo', shape_set_by: 'creator', visual_query: 'Bella Stone on a rooftop',
  }).select('id').single())!
  await photoForCard(CREATOR, oldCard.id) // as Change view → Photo calls it
  check('no meta.people: the creator’s known people are stripped instead', outbound.length === 1 && outbound[0].text === 'on a rooftop', JSON.stringify(outbound))
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
