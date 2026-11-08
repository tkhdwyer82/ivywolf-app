// packages/pipeline/scripts/upload-inspiration.ts
// Upload a local folder of reference pictures and clips into the inspiration-test bucket (TEST project) under one
// folder — a library category ("nothing", "box"). Then run index:inspiration to tag and embed them.
//
//   npm run upload:inspiration -w @ivywolf/pipeline -- "<local dir>" <folder> [--dry-run]
//
// The rules (the same as the first library):
//   - names are slugs of the file's title; a generic name (IMG_2421, "_ (10)", a hash) becomes <folder>-NNN or
//     <folder>-clip-NNN, numbered on from what's there (inspiration.ts: libraryPaths);
//   - HEIC/HEIF → JPEG (sips); every photo is stored as .jpeg;
//   - anything over 50 MB is compressed first: a photo to a 4096 px JPEG, a video to H.264 with its long edge ≤ 1920;
//   - existing files are skipped: a file whose bytes are already in the folder (the bucket's MD5 eTag) isn't uploaded
//     again, so a re-run only sends what's new.
// Keys come from .env.local and are never printed.

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { INSPIRATION_BUCKET, inspirationDb, kindOf, libraryExt, libraryPaths } from '../inspiration'

const [dir, folder] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const DRY = process.argv.includes('--dry-run')
const MAX_BYTES = 50 * 1024 * 1024
const run = promisify(execFile)
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex')

/** The bytes to upload: HEIC converted, anything over MAX_BYTES compressed. */
async function prepare(file: string, tmp: string): Promise<{ bytes: Buffer; note: string }> {
  const ext = file.split('.').pop()!.toLowerCase()
  let bytes = await readFile(file)
  const notes: string[] = []
  if (ext === 'heic' || ext === 'heif') {
    const out = join(tmp, `${md5(bytes)}.jpeg`)
    await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', file, '--out', out])
    bytes = await readFile(out)
    notes.push('HEIC→JPEG')
  }
  if (bytes.length > MAX_BYTES) {
    const before = bytes.length
    if (kindOf(`x.${libraryExt(file)}`) === 'video') {
      const out = join(tmp, `${md5(bytes)}.mp4`)
      await run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'",
        '-c:v', 'libx264', '-crf', '26', '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
        '-fflags', '+bitexact', out])
      bytes = await readFile(out)
    } else {
      bytes = await sharp(bytes).rotate().resize(4096, 4096, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    }
    notes.push(`compressed ${(before / 1048576).toFixed(0)} → ${(bytes.length / 1048576).toFixed(1)} MB`)
  }
  return { bytes, note: notes.join(', ') }
}

async function main() {
  if (!dir || !folder || !/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(folder)) {
    throw new Error('usage: upload-inspiration "<local dir>" <folder>   (folder: lowercase slug, e.g. box)')
  }
  const db = inspirationDb()
  const { data: listed, error } = await db.storage.from(INSPIRATION_BUCKET).list(folder, { limit: 1000 })
  if (error) throw new Error(`list ${folder}: ${error.message}`)
  const there = (listed ?? []).filter((o) => o.id && !o.name.startsWith('.'))
  const existing = there.map((o) => `${folder}/${o.name}`)
  const etags = new Set(there.map((o) => String((o.metadata as { eTag?: string })?.eTag ?? '').replace(/"/g, '')))

  const files = (await readdir(dir)).filter((f) => !f.startsWith('.'))
  const skippedType = files.filter((f) => !libraryExt(f))
  const tmp = await mkdtemp(join(tmpdir(), 'inspo-up-'))
  const ready: { file: string; bytes: Buffer; note: string }[] = []
  const already: string[] = []
  try {
    for (const f of files.filter((f) => libraryExt(f))) {
      const p = await prepare(join(dir, f), tmp)
      if (etags.has(md5(p.bytes))) already.push(f)
      else ready.push({ file: f, ...p })
    }
    const paths = libraryPaths(ready.map((r) => r.file), folder, existing)
    let uploaded = 0
    const failed: string[] = []
    for (const r of ready) {
      const path = paths.get(r.file)!
      const ext = path.split('.').pop()!
      const contentType = ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'mov' ? 'video/quicktime' : 'video/mp4'
      console.log(`  ${DRY ? '→' : '↑'} ${path}  ← ${r.file}${r.note ? `  (${r.note})` : ''}`)
      if (DRY) continue
      const { error: upErr } = await db.storage.from(INSPIRATION_BUCKET).upload(path, r.bytes, { contentType, upsert: false })
      if (upErr) failed.push(`${r.file}: ${upErr.message}`)
      else uploaded++
    }
    console.log(`\n${DRY ? 'Would upload' : 'Uploaded'}: ${DRY ? ready.length : uploaded} to ${INSPIRATION_BUCKET}/${folder}/`)
    console.log(`Skipped (already there): ${already.length}${already.map((f) => `\n  - ${f}`).join('')}`)
    if (skippedType.length) console.log(`Skipped (not a photo or video): ${skippedType.length}${skippedType.map((f) => `\n  - ${f}`).join('')}`)
    console.log(`Failed: ${failed.length}${failed.map((f) => `\n  - ${f}`).join('')}`)
    if (failed.length) process.exitCode = 1
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
