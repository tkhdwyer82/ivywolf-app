// packages/pipeline/scripts/index-inspiration.ts
// Index the inspiration-test bucket (TEST project) into inspiration_items: for each file not yet indexed, tag it
// (Claude), embed the tags (voyage-3) and the picture (voyage-multimodal-3.5), and upsert the row. A video is
// tagged from three frames (25/50/75% through, ffmpeg) and embedded from the middle one. Idempotent: a path that already has both embeddings is skipped,
// so re-running only picks up new files. A row tagged before `people` existed (prompt v1) gets only `people` filled
// in, from the same v2 tagging call — its caption, keywords and embeddings are kept. Keys come from .env.local and
// are never printed.
//
//   npm run index:inspiration -w @ivywolf/pipeline [-- --dry-run] [-- --reindex-videos]
//
// --reindex-videos redoes every video row (tags and embeddings), e.g. after the v3 switch from first frame to three.

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { embed } from '../embed'
import { INSPIRATION_BUCKET, folderOf, inspirationDb, inspirationText, kindOf, pendingPaths } from '../inspiration'
import { embedPicture, tagPicture } from '../inspirationTag'

const DRY = process.argv.includes('--dry-run')
const REINDEX_VIDEOS = process.argv.includes('--reindex-videos')
/** Where in a video its frames are taken, as fractions of its length; the middle one is embedded. */
const FRAME_AT = [0.25, 0.5, 0.75]
const CONCURRENCY = 4
/** Long edge sent to the models; Claude downsizes anything larger anyway. */
const MAX_EDGE = 1568

const db = inspirationDb()
const run = promisify(execFile)

/** Every object path under the bucket, recursing into folders (entries with no id are folders). */
async function listAll(prefix = ''): Promise<string[]> {
  const out: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(INSPIRATION_BUCKET).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`list ${prefix || '/'}: ${error.message}`)
    for (const e of data) {
      const path = prefix ? `${prefix}/${e.name}` : e.name
      if (e.id === null) out.push(...(await listAll(path)))
      else if (!e.name.startsWith('.')) out.push(path)
    }
    if (data.length < 1000) return out
  }
}

/** A video's frames at FRAME_AT, as JPEGs. */
async function framesOf(video: Buffer, ext: string): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), 'inspo-'))
  try {
    const src = join(dir, `in.${ext}`)
    await writeFile(src, video)
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src])
    const duration = Number.parseFloat(stdout) || 0
    const frames: Buffer[] = []
    for (const [i, at] of FRAME_AT.entries()) {
      const dst = join(dir, `frame-${i}.jpg`)
      await run('ffmpeg', ['-v', 'error', '-ss', (duration * at).toFixed(2), '-i', src, '-frames:v', '1', '-q:v', '2', dst])
      frames.push(await readFile(dst))
    }
    return frames
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const toJpeg = (b: Buffer) =>
  sharp(b).rotate().resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()

/**
 * What the models see, upright, JPEG, long edge ≤ MAX_EDGE: a photo as itself; a video as its frames at FRAME_AT
 * (all tagged), the middle one embedded and measured.
 */
async function pictureOf(path: string) {
  const kind = kindOf(path)!
  const { data, error } = await db.storage.from(INSPIRATION_BUCKET).download(path)
  if (error) throw new Error(`download: ${error.message}`)
  const file = Buffer.from(await data.arrayBuffer())
  const stills = kind === 'video' ? await framesOf(file, path.split('.').pop()!) : [file]
  const main = stills[Math.floor(stills.length / 2)]

  const { width, height } = await sharp(main).rotate().metadata()
  const frames = await Promise.all(stills.map(toJpeg))
  return { kind, frames, jpeg: frames[Math.floor(frames.length / 2)], width, height }
}

async function indexOne(path: string) {
  const { kind, frames, jpeg, width, height } = await pictureOf(path)
  const [tags, image_embedding] = await Promise.all([tagPicture(frames), embedPicture(jpeg)])
  const [text_embedding] = await embed([inspirationText(tags)])

  const { error: upsertError } = await db.from('inspiration_items').upsert(
    {
      path, kind, folder: folderOf(path), width, height, ...tags,
      text_embedding: JSON.stringify(text_embedding),
      image_embedding: JSON.stringify(image_embedding),
    },
    { onConflict: 'path' }
  )
  if (upsertError) throw new Error(`upsert: ${upsertError.message}`)
  return tags
}

/** A row tagged before `people` existed: fill in only that. */
async function backfillPeople(path: string) {
  const tags = await tagPicture((await pictureOf(path)).frames)
  const { error } = await db.from('inspiration_items').update({ people: tags.people }).eq('path', path)
  if (error) throw new Error(`update people: ${error.message}`)
  return tags
}

async function main() {
  const started = Date.now()
  const listed = await listAll()
  const { data: rows, error } = await db
    .from('inspiration_items').select('path, people').not('text_embedding', 'is', null).not('image_embedding', 'is', null)
  if (error) throw new Error(`read rows: ${error.message}`)
  const done = new Set(rows.map((r) => r.path as string).filter((p) => !(REINDEX_VIDEOS && kindOf(p) === 'video')))
  const todo = pendingPaths(listed, done)
  const noPeople = rows.filter((r) => !r.people && listed.includes(r.path)).map((r) => r.path as string).sort()
  const ignored = listed.filter((p) => !kindOf(p))

  console.log(`${listed.length} files in ${INSPIRATION_BUCKET}; ${done.size} already indexed; ${todo.length} to do; ${noPeople.length} need people`)
  const failed: string[] = []
  let indexed = 0, backfilled = 0
  if (!DRY) {
    const queue = [...todo.map((path) => ({ path, full: true })), ...noPeople.map((path) => ({ path, full: false }))]
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      for (let job; (job = queue.shift()); ) {
        const { path, full } = job
        try {
          if (full) {
            const t = await indexOne(path)
            indexed++
            console.log(`  ✓ ${path} — ${t.shot} · ${t.people} · ${t.caption}`)
          } else {
            const t = await backfillPeople(path)
            backfilled++
            console.log(`  ✓ ${path} — people: ${t.people}`)
          }
        } catch (e) {
          failed.push(`${path}: ${(e as Error).message}`)
          console.log(`  ✗ ${path}`)
        }
      }
    }))
  }

  const kinds = todo.reduce<Record<string, number>>((m, p) => ({ ...m, [kindOf(p)!]: (m[kindOf(p)!] ?? 0) + 1 }), {})
  console.log(`\n${DRY ? 'Would index' : 'Indexed'}: ${DRY ? todo.length : indexed} (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'})`)
  console.log(`${DRY ? 'Would backfill' : 'Backfilled'} people: ${DRY ? noPeople.length : backfilled}`)
  console.log(`Skipped (already indexed): ${done.size}`)
  if (ignored.length) console.log(`Ignored (not a photo/video): ${ignored.length}`)
  console.log(`Failed: ${failed.length}${failed.map((f) => `\n  - ${f}`).join('')}`)
  console.log(`Took ${((Date.now() - started) / 1000).toFixed(1)} s`)
  if (failed.length) process.exitCode = 1
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
