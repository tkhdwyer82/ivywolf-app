// scripts/backfill-meta-people.ts
// Backfill for recordings classified before abf3b8f/4b31eb3: meta.people (the name guard, redact.ts) and, on Muse
// captures that lost it, meta.text. No model calls. Dry run unless --write:
//
//   npx tsx --env-file=.env.local scripts/backfill-meta-people.ts            # counts and a sample, writes nothing
//   npx tsx --env-file=.env.local scripts/backfill-meta-people.ts --write
//
// people: the creator's person entities (canonical name or any alias) heard as a whole word in the recording's
// transcript, each with every name it's on file under. text: a Muse capture's transcript utterances joined by spaces
// (textUtterances split it at sentence ends; paragraph breaks are not recoverable), marked meta.text_from_transcript.
// A recording that names nobody gets no meta.people: unset, the guard falls back to all of the creator's people, which
// is stricter than an empty list. Always merged into meta, never replacing it, and only keys that are missing are added. The standing reviewer
// account is never touched.

import { createClient } from '@supabase/supabase-js'

const WRITE = process.argv.includes('--write')
const REVIEWER = 'user_3Jw9ArVlwAiKJ8lYCkJ60DnvUZQ'
const PAGE = 500

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

type Rec = { id: string; creator_id: string; source: string; kind: string; status: string; meta: Record<string, unknown> | null; transcript: unknown }
type Person = { canonical: string; names: string[] }

const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1))

/** The transcript's words, from the pipeline's utterances or a raw Deepgram response. */
function transcriptText(t: unknown): string {
  if (Array.isArray(t)) return t.map((u) => (u && typeof u.text === 'string' ? u.text : '')).join(' ')
  const raw = (t as { results?: { utterances?: { transcript: string }[] } } | null)?.results
  return (raw?.utterances ?? []).map((u) => u.transcript).join(' ')
}

/** A person is heard when every word of one of their names appears in the transcript. */
function heard(person: Person, said: Set<string>): boolean {
  return person.names.some((n) => {
    const w = [...words(n)]
    return w.length > 0 && w.every((x) => said.has(x))
  })
}

async function main() {
  const people = new Map<string, Person[]>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('entities').select('creator_id, canonical_name, aliases').eq('kind', 'person').neq('creator_id', REVIEWER).range(from, from + PAGE - 1)
    if (error) throw new Error(`entities: ${error.message}`)
    for (const e of data ?? []) {
      const list = people.get(e.creator_id) ?? []
      list.push({ canonical: e.canonical_name, names: [e.canonical_name, ...((e.aliases as string[] | null) ?? [])].filter((n) => n.trim()) })
      people.set(e.creator_id, list)
    }
    if ((data ?? []).length < PAGE) break
  }

  let scanned = 0
  const creators = new Set<string>()
  const plans: { rec: Rec; patch: Record<string, unknown> }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('recordings')
      .select('id, creator_id, source, kind, status, meta, transcript')
      .eq('status', 'done')
      .neq('creator_id', REVIEWER)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`recordings: ${error.message}`)
    for (const rec of (data ?? []) as Rec[]) {
      scanned++
      const meta = rec.meta && typeof rec.meta === 'object' && !Array.isArray(rec.meta) ? rec.meta : {}
      const patch: Record<string, unknown> = {}
      const text = transcriptText(rec.transcript)
      if (!Array.isArray(meta.people)) {
        const said = words(text)
        const hit = (people.get(rec.creator_id) ?? []).filter((p) => heard(p, said))
        // Nobody heard: leave meta.people unset, so the guard keeps stripping all of the creator's people (redact.ts).
        if (hit.length) patch.people = [...new Set(hit.flatMap((p) => p.names))]
      }
      if (rec.source === 'muse' && typeof meta.text !== 'string' && text.trim()) {
        patch.text = text.replace(/\s+/g, ' ').trim()
        patch.text_from_transcript = true
      }
      if (Object.keys(patch).length) {
        plans.push({ rec, patch })
        creators.add(rec.creator_id)
      }
    }
    if ((data ?? []).length < PAGE) break
  }

  const withPeople = plans.filter((p) => Array.isArray(p.patch.people))
  const named = withPeople.filter((p) => (p.patch.people as string[]).length > 0)
  const texts = plans.filter((p) => 'text' in p.patch)
  console.log(`${WRITE ? 'WRITE' : 'DRY RUN'} — reviewer ${REVIEWER} excluded`)
  console.log(`scanned ${scanned} done recordings; ${plans.length} to update across ${creators.size} creator(s)`)
  console.log(`  meta.people: ${withPeople.length} (${named.length} with at least one name, ${withPeople.length - named.length} empty)`)
  console.log(`  meta.text from transcript (Muse captures): ${texts.length}`)

  const sample = [...named.slice(0, 4), ...withPeople.filter((p) => !(p.patch.people as string[]).length).slice(0, 2), ...texts.slice(0, 3)]
  for (const { rec, patch } of [...new Set(sample)]) {
    const shown = { ...patch, ...(typeof patch.text === 'string' ? { text: patch.text.length > 120 ? `${patch.text.slice(0, 117)}…` : patch.text } : {}) }
    console.log(`  ${rec.id} ${rec.creator_id} ${rec.source}/${rec.kind} existing keys [${Object.keys(rec.meta ?? {}).join(', ')}] + ${JSON.stringify(shown)}`)
  }
  if (!WRITE) return

  let written = 0
  for (const { rec, patch } of plans) {
    // Re-read and merge at write time, so nothing written since the scan is lost.
    const { data: now, error } = await db.from('recordings').select('meta').eq('id', rec.id).single()
    if (error) throw new Error(`${rec.id}: ${error.message}`)
    const current = now.meta && typeof now.meta === 'object' && !Array.isArray(now.meta) ? (now.meta as Record<string, unknown>) : {}
    const add = Object.fromEntries(Object.entries(patch).filter(([k]) => !(k in current)))
    if (!Object.keys(add).length) continue
    const up = await db.from('recordings').update({ meta: { ...current, ...add } }).eq('id', rec.id).neq('creator_id', REVIEWER)
    if (up.error) throw new Error(`${rec.id}: ${up.error.message}`)
    written++
  }
  console.log(`wrote ${written}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
