// scripts/test-delete-recording.ts
// Cascade test for deleting a recording, frames included (0007 + 0015). Runs against the linked project with a
// throwaway creator and removes it afterwards. Draws real frames: three fal calls, about $0.009.
//
//   npx tsx --env-file=.env.local scripts/test-delete-recording.ts
//
// Runs the app's deleteRecording with the service role — the storage policies it relies on under the creator's
// own JWT ("frames: delete own" / "read own") are tested in SQL, in a rolled-back transaction, with 0015.
//
//   A: a card and a "milk" to-do (drawn)      B: a "milk" to-do (the same frame, from the cache)
//   delete A → A's rows and card frame gone; the milk frame stays (B still uses it)
//   delete B → the milk frame goes (last user)
//   C: a "milk" to-do → drawn afresh, not served the removed file from the cache

import { createClient } from '@supabase/supabase-js'
import { frameRecording } from '../packages/pipeline/frames'
import { deleteRecording, framePath } from '../apps/mobile/lib/deleteRecording'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
const CREATOR = 'user_test_delete_recording'
const MILK = 'a carton of milk on a kitchen counter'

let failed = 0
function check(name: string, pass: boolean, detail = '') {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function ok<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

async function exists(url: string | null): Promise<boolean> {
  const path = framePath(url)
  if (!path) return false
  const dir = path.slice(0, path.lastIndexOf('/'))
  const { data } = await db.storage.from('frames').list(dir, { search: path.slice(dir.length + 1) })
  return (data ?? []).some((f) => `${dir}/${f.name}` === path)
}

async function recording(withCard: boolean) {
  const rec = ok(
    'recording',
    await db.from('recordings').insert({ creator_id: CREATOR, source: 'phone', storage_path: `${CREATOR}/none.m4a` }).select('id, storage_path').single()
  ) as { id: string; storage_path: string }
  if (withCard) {
    ok('card', await db.from('cards').insert({
      creator_id: CREATOR, recording_id: rec.id, title: 'Rooftop chase', gist: 'g', play_from_ms: 0, confidence: 0.9,
      frame_brief: 'a figure leaping between city rooftops',
    }))
  }
  ok('action', await db.from('actions').insert({ creator_id: CREATOR, recording_id: rec.id, text: 'Get milk', frame_brief: MILK }))
  await frameRecording(CREATOR, rec.id)
  return rec
}

const frameOf = async (table: 'cards' | 'actions', recordingId: string) =>
  ((ok(table, await db.from(table).select('frame_url, frame_status').eq('recording_id', recordingId).single())) as {
    frame_url: string | null
    frame_status: string
  })

async function cleanup() {
  const paths: string[] = []
  for (const dir of [CREATOR, `${CREATOR}/actions`]) {
    const { data } = await db.storage.from('frames').list(dir)
    paths.push(...(data ?? []).filter((f) => f.id).map((f) => `${dir}/${f.name}`))
  }
  if (paths.length) await db.storage.from('frames').remove(paths)
  await db.from('creators').delete().eq('id', CREATOR)
}

async function main() {
  await cleanup() // a previous run that died half-way
  ok('creator', await db.from('creators').insert({ id: CREATOR }))

  const a = await recording(true)
  const b = await recording(false)
  const cardA = await frameOf('cards', a.id)
  const milkA = await frameOf('actions', a.id)
  const milkB = await frameOf('actions', b.id)
  check('A card framed', cardA.frame_status === 'done' && (await exists(cardA.frame_url)), cardA.frame_status)
  check('B milk served from the cache', milkB.frame_url === milkA.frame_url && milkA.frame_url !== null)

  await deleteRecording(db, a)
  const left = ok('rows', await db.from('cards').select('id').eq('recording_id', a.id)) as unknown[]
  check('delete A: rows gone', left.length === 0)
  check('delete A: card frame removed', !(await exists(cardA.frame_url)))
  check('delete A: shared milk frame kept for B', await exists(milkA.frame_url))

  await deleteRecording(db, b)
  check('delete B: milk frame removed with its last user', !(await exists(milkA.frame_url)))

  const c = await recording(false)
  const milkC = await frameOf('actions', c.id)
  check(
    'C: milk drawn afresh, not the removed file',
    milkC.frame_status === 'done' && milkC.frame_url !== milkA.frame_url && (await exists(milkC.frame_url))
  )
  await deleteRecording(db, c)
  check('delete C: milk frame removed', !(await exists(milkC.frame_url)))

  const costs = ok('costs', await db.from('frame_generations').select('cached, cost_usd').eq('creator_id', CREATOR)) as {
    cached: boolean
    cost_usd: number
  }[]
  console.log(`frames: ${costs.filter((x) => !x.cached).length} drawn, ${costs.filter((x) => x.cached).length} cached, $${costs.reduce((s, x) => s + Number(x.cost_usd), 0).toFixed(3)}`)
}

main()
  .catch((e) => {
    failed++
    console.error('ERROR', e instanceof Error ? e.message : e)
  })
  .finally(async () => {
    await cleanup()
    console.log(failed === 0 ? 'ALL PASS' : `FAILED (${failed})`)
    process.exit(failed === 0 ? 0 : 1)
  })
