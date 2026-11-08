// packages/pipeline/scripts/backfill-covers.ts
// The cover ladder (covers.ts) for ideas made before it: the ones whose cover came from (d) — an Unsplash photo, a
// reference picture or the hue — and that have no picture of her own. Three modes, one creator at a time:
//
//   npm run backfill:covers -w @ivywolf/pipeline -- --creator <id> --scores 10
//       the N most recent ideas: their top library match, its similarity and the step the ladder would take
//   npm run backfill:covers -w @ivywolf/pipeline -- --creator <id> --preview 5 --out <dir> [--threshold 0.3]
//       before/after for N (d) ideas, written to <dir> (before.jpg / after.jpg + preview.json). No card is changed;
//       a generated "after" is spent ($0.0398 each) but stored only in <dir>
//   npm run backfill:covers -w @ivywolf/pipeline -- --creator <id> --apply [--threshold 0.45]
//       run the ladder on every (d) idea and write the covers
//   npm run backfill:covers -w @ivywolf/pipeline -- --creator <id> --regenerate <card id>,<card id>
//       draw step c again for these ideas (lettering-checked); what they wear now is kept for Restore
//
// Production data: reads with the service role. Keys come from .env.local and are never printed.

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { INSPIRATION_BUCKET, inspirationDb } from '../inspiration'
import { peopleFor } from '../redact'
import {
  COVER_MODEL, COVER_USD, chooseCover, libraryThreshold, coverCard, coverSubject, generateCover, ladderCover,
  libraryMatches, ownCover, type CoverCard,
} from '../covers'


const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i < 0 ? undefined : process.argv[i + 1]
}
const creator = arg('creator')
const threshold = Number(arg('threshold') ?? libraryThreshold())
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const lib = inspirationDb()

type Row = CoverCard & {
  created_at: string
  frame_url: string | null
  frame_status: string
  reference_picture: { url?: string } | null
}
const COLUMNS = 'id, creator_id, recording_id, title, gist, visual_query, source, frame_attribution, created_at, frame_url, frame_status, reference_picture'

/** What the idea wears now, in the ladder's terms. */
function coverNow(c: Row): { from: string; url: string | null } {
  if (ownCover(c)) return { from: 'a · her photo', url: c.frame_url }
  if (c.frame_attribution?.provider === 'ivy_library') return { from: 'b · Ivy library', url: c.frame_url }
  if (c.frame_attribution?.provider === 'ivy_generated') return { from: 'c · generated', url: c.frame_url }
  if (c.frame_status === 'done' && c.frame_attribution?.provider === 'unsplash') return { from: 'd · Unsplash', url: c.frame_url }
  if (c.reference_picture?.url) return { from: 'd · reference', url: c.reference_picture.url }
  return { from: 'd · hue', url: null }
}

async function ideas(limit?: number): Promise<Row[]> {
  let q = db.from('cards').select(COLUMNS).eq('creator_id', creator!).is('trashed_at', null).order('created_at', { ascending: false })
  if (limit) q = q.limit(limit)
  const { data, error } = await q
  if (error) throw new Error(`cards: ${error.message}`)
  return data as Row[]
}

/** Cards with a picture of her own from Add context or the Create flow: that picture wins anyway, so skip them. */
async function withOwnPictures(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const [ctx, runs] = await Promise.all([
    db.from('card_context').select('card_id, meta').eq('kind', 'image').in('card_id', ids),
    db.from('generation_runs').select('card_id').eq('status', 'completed').not('output_url', 'is', null).in('card_id', ids),
  ])
  const own = new Set<string>()
  for (const r of (ctx.data ?? []) as { card_id: string; meta: { role?: string } | null }[]) if ((r.meta?.role ?? 'idea') !== 'style') own.add(r.card_id)
  for (const r of (runs.data ?? []) as { card_id: string }[]) own.add(r.card_id)
  return own
}

/** The (d) ideas, newest first. */
async function fromD(): Promise<Row[]> {
  const all = await ideas()
  const own = await withOwnPictures(all.map((c) => c.id))
  return all.filter((c) => !ownCover(c) && !ladderCover(c) && !own.has(c.id))
}

async function scores(n: number) {
  const rows = await ideas(n)
  console.log(`The ${rows.length} most recent ideas (threshold ${threshold}):\n`)
  const out = []
  for (const c of rows) {
    const matches = await libraryMatches(c, lib)
    const photos = matches.filter((m) => m.kind === 'photo')
    const step = chooseCover(c, matches, threshold).step
    const row = {
      title: c.title, created_at: c.created_at, now: coverNow(c).from, step,
      top: photos.slice(0, 3).map((p) => ({ path: p.path, similarity: Math.round(p.similarity * 1000) / 1000 })),
    }
    out.push(row)
    console.log(`${row.top[0]?.similarity.toFixed(3) ?? '  —  '}  ${step.padEnd(8)}  ${c.title.slice(0, 60).padEnd(60)}  ${row.top[0]?.path ?? ''}`)
  }
  const dir = arg('out')
  if (dir) {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'scores.json'), JSON.stringify(out, null, 2))
  }
}

async function fetchJpeg(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null)
  if (!res?.ok) return null
  return sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(600, 800, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()
}

async function preview(n: number, dir: string) {
  await mkdir(dir, { recursive: true })
  const rows = (await fromD()).slice(0, n)
  const manifest = []
  let spent = 0
  for (const c of rows) {
    const now = coverNow(c)
    const matches = await libraryMatches(c, lib)
    const choice = chooseCover(c, matches, threshold)
    const d = join(dir, c.id)
    await mkdir(d, { recursive: true })
    const before = now.url ? await fetchJpeg(now.url) : null
    if (before) await writeFile(join(d, 'before.jpg'), before)
    let after: Buffer | null = null
    let detail = ''
    if (choice.step === 'library') {
      const { data } = await lib.storage.from(INSPIRATION_BUCKET).download(choice.item.path)
      if (data) after = await sharp(Buffer.from(await data.arrayBuffer())).rotate().resize(600, 800, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()
      detail = `${choice.item.path} (${choice.item.similarity.toFixed(3)})`
    } else if (choice.step === 'generate') {
      const people = await peopleFor(db, c.creator_id, c.recording_id).catch(() => [])
      const subject = coverSubject(c, people)
      after = await generateCover(subject, choice.refs, lib)
      spent += COVER_USD
      detail = `“${subject}” on ${COVER_MODEL}, styled on ${choice.refs.map((r) => `${r.path} (${r.similarity.toFixed(3)})`).join(', ')}`
    }
    if (after) await writeFile(join(d, 'after.jpg'), after)
    const row = { id: c.id, title: c.title, gist: c.gist, before: now.from, after: choice.step, detail, hasBefore: !!before, hasAfter: !!after }
    manifest.push(row)
    console.log(`${c.title.slice(0, 50).padEnd(50)}  ${now.from.padEnd(14)} → ${choice.step}  ${detail}`)
  }
  await writeFile(join(dir, 'preview.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nPreview in ${dir}; spent $${spent.toFixed(4)} on generation. No card was changed.`)
}

async function apply() {
  const rows = await fromD()
  console.log(`${rows.length} ideas whose cover came from (d); threshold ${threshold}`)
  const tally: Record<string, number> = {}
  let spent = 0
  const failed: string[] = []
  for (const c of rows) {
    const r = await coverCard(c, { supabase: db, lib, threshold })
    tally[r.step] = (tally[r.step] ?? 0) + 1
    spent += r.cost_usd
    if (r.error) failed.push(`${c.title}: ${r.error}`)
    console.log(`  ${r.step.padEnd(8)} ${c.title}`)
  }
  console.log(`\n${Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join(' · ')}; spent $${spent.toFixed(4)}`)
  console.log(`Failed (left as they were): ${failed.length}${failed.map((f) => `\n  - ${f}`).join('')}`)
  if (failed.length) process.exitCode = 1
}

async function regenerate(ids: string[]) {
  const { data, error } = await db.from('cards').select(COLUMNS).eq('creator_id', creator!).in('id', ids)
  if (error) throw new Error(`cards: ${error.message}`)
  let spent = 0
  for (const c of data as Row[]) {
    const r = await coverCard(c, { supabase: db, lib, forceGenerate: true })
    spent += r.cost_usd
    console.log(`  ${r.step.padEnd(8)} ${c.title}${r.rejected?.length ? `  (rejected: ${r.rejected.join('; ')})` : ''}${r.error ? `  — ${r.error}` : ''}`)
    if (r.step !== 'generate') process.exitCode = 1
  }
  console.log(`\n${data!.length} regenerated; spent $${spent.toFixed(4)}`)
}

async function main() {
  if (!creator) throw new Error('--creator <id> is required')
  if (arg('scores')) return scores(Number(arg('scores')))
  if (arg('preview')) return preview(Number(arg('preview')), arg('out') ?? 'covers-preview')
  if (process.argv.includes('--apply')) return apply()
  if (arg('regenerate')) return regenerate(arg('regenerate')!.split(','))
  throw new Error('one of --scores N, --preview N --out <dir>, --apply')
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})

