// scripts/test-imports.ts
// Add to ideas, end to end on the linked project with a throwaway creator (removed afterwards). macOS: the audio is
// made with `say` and `ffmpeg`. Calls Deepgram, Claude and Voyage like any recording; draws no frames.
//
//   npx tsx --env-file=.env.local scripts/test-imports.ts
//
//   short: an image + "for the restock reel" (< 3 s) → not junk; one import card, frame = the poster
//   silent: a video poster + 4 s of silence → not junk; a card "A video you added"
//   then deleteRecording removes each import's original and poster with it

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { claimRecording, processRecording } from '../packages/pipeline/process'
import { deleteRecording, framePath } from '../apps/mobile/lib/deleteRecording'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
const CREATOR = 'user_test_imports'
const dir = mkdtempSync(join(tmpdir(), 'ivy-imports-'))

let failed = 0
function check(name: string, pass: boolean, detail = '') {
  if (!pass) failed++
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function audio(name: string, how: 'say' | 'silence'): Buffer {
  const out = join(dir, `${name}.m4a`)
  if (how === 'say') {
    execFileSync('say', ['-o', join(dir, `${name}.aiff`), 'for the restock reel'])
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, `${name}.aiff`), '-c:a', 'aac', out])
  } else {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '4', '-c:a', 'aac', out])
  }
  return readFileSync(out)
}

function poster(): Buffer {
  const out = join(dir, 'poster.jpg')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0xD8F27A:s=300x400', '-frames:v', '1', out])
  return readFileSync(out)
}

async function exists(bucket: string, path: string): Promise<boolean> {
  const folder = path.slice(0, path.lastIndexOf('/'))
  const { data } = await db.storage.from(bucket).list(folder, { search: path.slice(folder.length + 1) })
  return (data ?? []).some((f) => `${folder}/${f.name}` === path)
}

async function run(name: string, kind: 'image' | 'video', how: 'say' | 'silence') {
  const id = randomUUID()
  const original = `${CREATOR}/${id}.${kind === 'image' ? 'jpg' : 'mov'}`
  const posterPath = `${CREATOR}/imports/${id}.jpg`
  await db.storage.from('imports').upload(original, poster(), { contentType: kind === 'image' ? 'image/jpeg' : 'video/quicktime' })
  await db.storage.from('frames').upload(posterPath, poster(), { contentType: 'image/jpeg' })
  const storagePath = `${CREATOR}/${id}.m4a`
  await db.storage.from('recordings').upload(storagePath, audio(name, how), { contentType: 'audio/mp4' })
  const { error } = await db.from('recordings').insert({
    id,
    creator_id: CREATOR,
    source: 'phone',
    storage_path: storagePath,
    trigger: 'import',
    recorded_at: new Date().toISOString(),
    meta: { import: { kind, original_path: original, poster_path: posterPath } },
  })
  if (error) throw new Error(`recording: ${error.message}`)
  if (!(await claimRecording(id))) throw new Error('claim failed')
  await processRecording(id)

  const { data: rec } = await db.from('recordings').select('status, is_junk').eq('id', id).single()
  const { data: cards } = await db.from('cards').select('title, source, media_path, frame_url, frame_status').eq('recording_id', id)
  check(`${name}: recording done, not junk`, rec?.status === 'done' && rec?.is_junk === false, `${rec?.status}`)
  const imp = (cards ?? []).filter((c) => c.source === 'import')
  check(
    `${name}: one import card, framed with the poster`,
    imp.length === 1 && imp[0].frame_status === 'done' && framePath(imp[0].frame_url) === posterPath && imp[0].media_path === original,
    JSON.stringify(cards?.map((c) => ({ title: c.title, source: c.source, frame_status: c.frame_status })))
  )
  return { id, storage_path: storagePath, original, posterPath }
}

async function cleanup() {
  for (const [bucket, dirs] of [
    ['frames', [CREATOR, `${CREATOR}/imports`, `${CREATOR}/actions`]],
    ['imports', [CREATOR]],
    ['recordings', [CREATOR]],
  ] as const) {
    for (const d of dirs) {
      const { data } = await db.storage.from(bucket).list(d)
      const paths = (data ?? []).filter((f) => f.id).map((f) => `${d}/${f.name}`)
      if (paths.length) await db.storage.from(bucket).remove(paths)
    }
  }
  await db.from('creators').delete().eq('id', CREATOR)
}

async function main() {
  await cleanup()
  const { error } = await db.from('creators').insert({ id: CREATOR })
  if (error) throw new Error(error.message)

  const short = await run('short', 'image', 'say')
  const silent = await run('silent', 'video', 'silence')
  const { data: silentCard } = await db.from('cards').select('title').eq('recording_id', silent.id).single()
  check('silent: card titled for what was added', silentCard?.title === 'A video you added', silentCard?.title)

  for (const r of [short, silent]) {
    await deleteRecording(db, r)
    check(`delete: original and poster gone (${r.original.split('/')[1]})`, !(await exists('imports', r.original)) && !(await exists('frames', r.posterPath)))
  }
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
