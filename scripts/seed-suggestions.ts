// scripts/seed-suggestions.ts
// More ideas (Job G §4) before Job H's adapters: writes five suggestions per thread from a JSON file.
//
//   npx tsx --env-file=.env.local scripts/seed-suggestions.ts <file.json>            # dry run
//   npx tsx --env-file=.env.local scripts/seed-suggestions.ts <file.json> --write
//
// scripts/seed/suggestions.fixture.json is fixture data for the simulator test account only (fake handles and URLs).
// Pilot creators are seeded from Tim's JSON.
//
// The file: { "threads": [ { "creator_id", "thread_id" | "thread_title", "suggestions": [five of
//   { field, source, source_url?, source_handle?, source_score?, title, why?, near_card_title?, frame_url? | frame_file? }] } ] }
// frame_file is an image beside the JSON: uploaded to the frames bucket under <creator>/fixture/, its public URL used.
// Never 'pinterest': Pinterest's terms allow storing only the OAuth token — no pins, pin images or board data
// (packages/schema/pinterest.ts). Pinterest suggestions are fetched live and never seeded.
// Rank is the order in the file. A thread is found by id, or by its exact title for that creator; the project is
// the thread's. near_card_title names a card in that thread: it becomes near_card_id, and the why line's recording
// and moment are that card's (why_recording_id, why_ms), so "…you said 'box tips over first' on Thu 0:31" plays from
// there. A reseed expires the thread's suggestions still shown (never touching pinned, dismissed or hidden ones —
// a dismissed suggestion never comes back). Makes no network calls but Supabase: no adapters here (Job H).

import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const PER_THREAD = 5

const Suggestion = z.object({
  field: z.enum(['format', 'sound', 'aesthetic', 'topic', 'graph']),
  source: z.enum(['youtube', 'tiktok', 'graph']), // no 'pinterest': see the header
  source_url: z.string().url().optional(),
  source_handle: z.string().optional(),
  source_score: z.number().positive().optional(),
  title: z.string().min(1),
  why: z.string().optional(),
  near_card_title: z.string().optional(),
  frame_url: z.string().url().optional(),
  frame_file: z.string().optional(),
})
const Seed = z.object({
  threads: z.array(
    z
      .object({
        creator_id: z.string().min(1),
        thread_id: z.string().uuid().optional(),
        thread_title: z.string().optional(),
        suggestions: z.array(Suggestion).length(PER_THREAD),
      })
      .refine((t) => t.thread_id || t.thread_title, 'thread_id or thread_title is required')
  ),
})

const [file, ...flags] = process.argv.slice(2)
if (!file) throw new Error('usage: seed-suggestions.ts <file.json> [--write]')
const write = flags.includes('--write')
const seed = Seed.parse(JSON.parse(readFileSync(file, 'utf8')))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

async function main() {
  for (const t of seed.threads) {
    const q = db.from('threads').select('id, title, project_id, return_count').eq('creator_id', t.creator_id)
    const threads = need('thread', await (t.thread_id ? q.eq('id', t.thread_id) : q.eq('title', t.thread_title!)))
    if (threads.length !== 1) throw new Error(`${t.creator_id}: ${threads.length} threads match ${t.thread_id ?? `"${t.thread_title}"`}`)
    const thread = threads[0]

    const cards = need(
      'cards',
      await db.from('thread_cards').select('cards(id, title, recording_id, play_from_ms)').eq('thread_id', thread.id)
    ) as unknown as { cards: { id: string; title: string; recording_id: string | null; play_from_ms: number } | null }[]
    const near = (title?: string) => {
      if (!title) return null
      const c = cards.map((r) => r.cards).find((c) => c?.title === title)
      if (!c) throw new Error(`"${thread.title}": no card titled "${title}"`)
      return c
    }

    const frameOf = async (s: z.infer<typeof Suggestion>) => {
      if (!s.frame_file) return s.frame_url ?? null
      const path = `${t.creator_id}/fixture/${basename(s.frame_file)}`
      if (!write) return `(upload ${path})`
      need('frame', await db.storage.from('frames').upload(path, readFileSync(resolve(dirname(file), s.frame_file)), { contentType: 'image/png', upsert: true }))
      return db.storage.from('frames').getPublicUrl(path).data.publicUrl
    }
    const frames = await Promise.all(t.suggestions.map(frameOf))
    const rows = t.suggestions.map((s, i) => {
      const c = near(s.near_card_title)
      return {
        creator_id: t.creator_id,
        project_id: thread.project_id,
        thread_id: thread.id,
        near_card_id: c?.id ?? null,
        field: s.field,
        source: s.source,
        source_url: s.source_url ?? null,
        source_handle: s.source_handle ?? null,
        source_score: s.source_score ?? null,
        title: s.title,
        why: s.why ?? null,
        why_recording_id: s.why ? (c?.recording_id ?? null) : null,
        why_ms: s.why ? (c?.play_from_ms ?? null) : null,
        frame_url: frames[i],
        rank: i + 1,
      }
    })

    const gate = thread.return_count >= 3 ? '' : ` — returns ${thread.return_count} < 3: More ideas stays hidden until she comes back to it`
    console.log(`${write ? 'seeding' : 'would seed'} ${rows.length} on "${thread.title}" (${t.creator_id})${thread.project_id ? '' : ' — thread has no project'}${gate}`)
    if (!write) continue

    need('expire', await db.from('suggestions').update({ status: 'expired' }).eq('thread_id', thread.id).eq('status', 'shown'))
    need('insert', await db.from('suggestions').insert(rows))
  }
  if (!write) console.log('dry run — add --write to seed')
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
