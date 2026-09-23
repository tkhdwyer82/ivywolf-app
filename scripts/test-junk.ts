// scripts/test-junk.ts
// The server's junk gate, end to end on the linked project with a throwaway creator (removed afterwards). macOS:
// audio is made with `say` and `ffmpeg`. Calls Deepgram only — junk never reaches the classifier.
//
//   npx tsx --env-file=.env.local scripts/test-junk.ts
//
//   silent: 4 s of silence → status 'junk', junk_reason 'no_speech', no cards
//   short: "hi" (< 3 s) → status 'junk', junk_reason 'too_short', no cards
// Neither may be left in 'processing'.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { claimRecording, processRecording } from '../packages/pipeline/process'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
const CREATOR = 'user_test_junk'
const dir = mkdtempSync(join(tmpdir(), 'ivy-junk-'))

let failed = 0
function check(name: string, pass: boolean, detail = '') {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function audio(how: 'silence' | 'short'): Buffer {
  const out = join(dir, `${how}.m4a`)
  if (how === 'short') {
    execFileSync('say', ['-o', join(dir, 'short.aiff'), 'hi'])
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, 'short.aiff'), '-c:a', 'aac', out])
  } else {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '4', '-c:a', 'aac', out])
  }
  return readFileSync(out)
}

async function run(how: 'silence' | 'short', reason: string) {
  const id = randomUUID()
  const path = `${CREATOR}/${id}.m4a`
  await db.storage.from('recordings').upload(path, audio(how), { contentType: 'audio/mp4' })
  const { error } = await db.from('recordings').insert({ id, creator_id: CREATOR, source: 'phone', storage_path: path, trigger: 'button' })
  if (error) throw new Error(error.message)
  if (!(await claimRecording(id))) throw new Error('claim failed')
  await processRecording(id)
  const { data } = await db.from('recordings').select('status, is_junk, junk_reason').eq('id', id).single()
  const { count } = await db.from('cards').select('id', { count: 'exact', head: true }).eq('recording_id', id)
  check(`${how}: junk (${reason}), no cards`, data?.status === 'junk' && data.is_junk && data.junk_reason === reason && count === 0, JSON.stringify({ ...data, cards: count }))
}

async function cleanup() {
  const { data } = await db.storage.from('recordings').list(CREATOR)
  const paths = (data ?? []).filter((f) => f.id).map((f) => `${CREATOR}/${f.name}`)
  if (paths.length) await db.storage.from('recordings').remove(paths)
  await db.from('creators').delete().eq('id', CREATOR)
}

async function main() {
  await cleanup()
  await db.from('creators').insert({ id: CREATOR })
  await run('silence', 'no_speech')
  await run('short', 'too_short')
}

main()
  .catch((e) => {
    failed++
    console.error('ERROR', e instanceof Error ? `${e.message}${e.cause ? ` (${String((e.cause as Error).message ?? e.cause)})` : ''}` : e)
  })
  .finally(async () => {
    await cleanup()
    console.log(failed === 0 ? 'ALL PASS' : `FAILED (${failed})`)
    process.exit(failed === 0 ? 0 : 1)
  })
