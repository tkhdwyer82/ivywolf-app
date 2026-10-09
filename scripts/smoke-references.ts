// scripts/smoke-references.ts
// Live smoke for Job H.0c: one real card through Unsplash and Pixabay (Pinterest isn't live: its app secret is
// pending), printing the 6 references with their credits. Needs UNSPLASH_ACCESS_KEY and PIXABAY_API_KEY.
//
//   npx tsx --env-file=.env.local scripts/smoke-references.ts             # the test account's rooftop card
//   CARD_ID=<uuid> npx tsx --env-file=.env.local scripts/smoke-references.ts
//
// Read-only: one card read, two searches. Nothing is written; no Unsplash download event is sent (that's for use).

import { createClient } from '@supabase/supabase-js'
import { findReferences, referenceQuery } from '../packages/pipeline/references'
import { peopleFor } from '../packages/pipeline/redact'

const CARD_ID = process.env.CARD_ID ?? '9f449fb5-6068-4915-bc53-f1d9127379b1'

async function main() {
  for (const k of ['UNSPLASH_ACCESS_KEY', 'PIXABAY_API_KEY']) if (!process.env[k]) console.warn(`${k} is not set: that source will be skipped`)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: card, error } = await db.from('cards').select('id, creator_id, recording_id, title, gist, visual_query, shape, source').eq('id', CARD_ID).single()
  if (error || !card) throw new Error(`card ${CARD_ID}: ${error?.message ?? 'missing'}`)
  const people = await peopleFor(db, card.creator_id as string, card.recording_id as string | null)
  console.log(`card: ${card.title}\nquery: "${referenceQuery(card, people)}" (shape ${card.shape ?? 'none'})\n`)

  const t = Date.now()
  const refs = await findReferences(card, { sources: ['unsplash', 'pixabay'], people })
  console.log(`${refs.length} references in ${Date.now() - t} ms\n`)
  refs.forEach((r, i) =>
    console.log(`${i + 1}. [${r.source}] ${r.width}×${r.height}  ${r.credit.name}\n   credit: ${r.credit.url}\n   link:   ${r.link_url}\n   thumb:  ${r.thumb_url}\n`)
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
