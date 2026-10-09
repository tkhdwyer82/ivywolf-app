// packages/pipeline/eval/direction-eval.ts
// direction_v1 on the eval set (Job H): the 3 memos' cards as one project, N runs, every direction printed for a human
// to read ("would she think this is hers?"), with the automatic checks scored per run (pass rate, as the repeat-run
// rule asks — directions vary run to run). A later direction version ratchets against these rates.
//
//   npx tsx --env-file=../../.env.local eval/direction-eval.ts [version] [runs]
//
// The project is built from the stored classify_v6 + shape_v1 runs (runs/<memo>.classify_v6.shape_v1.actual.json): each
// card's title, gist, form and `said` (its segment's words), recorded on the memo's date. No database, no references.
// Per-run outputs: runs/directions/<version>.run<n>.json.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { proposeDirections, preferredForms, similarTitles, isVerbatim, asks, DIRECTION_VERSION, type DirectionVersion, type InputCard } from '../suggest'
import type { Analysed } from '../shape'

const here = path.dirname(fileURLToPath(import.meta.url))
const version = (process.argv[2] as DirectionVersion) ?? DIRECTION_VERSION
const RUNS = Number(process.argv[3] ?? 3)

const memos = readdirSync(path.join(here, 'memos')).filter((f) => f.endsWith('.expected.json')).map((f) => f.replace('.expected.json', ''))
const cards: (InputCard & { recorded_tz: string })[] = []
for (const memo of memos) {
  const file = path.join(here, 'runs', `${memo}.classify_v6.shape_v1.actual.json`)
  const out = JSON.parse(readFileSync(file, 'utf8')) as Analysed
  const day = memo.slice(0, 10)
  out.cards.forEach((c, i) => {
    const seg = out.segments[c.segment_index]
    cards.push({
      id: `${memo}#${i}`,
      title: c.title,
      gist: c.gist,
      form: c.shape,
      said: seg?.text ?? '',
      recording_id: memo,
      recorded_at: `${day}T08:30:00+10:00`,
      recorded_tz: 'Australia/Sydney',
      play_from_ms: c.play_from_ms,
      recording_source: memo.includes('rooftop') ? 'phone' : 'car',
      thread_returns: 0,
      pinned: false,
      hearted: false,
      context: [],
      source: 'voice',
    })
  })
}
// The profile her kept forms make (0038 recompute_format_profile, kept only — no hearts, pins or dismisses yet).
const kept: Record<string, number> = {}
for (const c of cards) kept[c.form] = (kept[c.form] ?? 0) + 1
const profile = { kept }

console.log(`project: the 3 eval memos (${memos.join(', ')})`)
console.log(`${cards.length} cards: ${cards.map((c) => `[${c.form}] ${c.title}`).join(' · ')}`)
console.log(`profile kept ${JSON.stringify(kept)} → preferred ${JSON.stringify(preferredForms(profile))}\n`)

const outDir = path.join(here, 'runs', 'directions')
mkdirSync(outDir, { recursive: true })
const rates = new Map<string, boolean[]>()
const score = (name: string, ok: boolean) => rates.set(name, [...(rates.get(name) ?? []), ok])
let cents = 0

for (let run = 1; run <= RUNS; run++) {
  const p = await proposeDirections({ projectId: 'eval', creatorId: 'eval', name: 'Launch video', cards, profile, avoid: [] }, version)
  cents += p.cents ?? 0
  writeFileSync(path.join(outDir, `${version}.run${run}.json`), JSON.stringify(p, null, 2) + '\n')
  console.log(`── run ${run}: ${p.kept.length} directions, ${p.dropped.length} dropped${p.dropped.length ? ` (${p.dropped.map((d) => `${d.reason}: "${d.title}"`).join('; ')})` : ''} — ${p.model}, ${p.cents}¢`)
  p.kept.forEach((d, i) => {
    console.log(`\n${i + 1}. [${d.format}${d.stretch ? ', stretch' : ''}] ${d.title}`)
    console.log(`   ${d.gist}`)
    console.log(`   ${d.why}`)
    if (d.payload.board) console.log(`   board: ${d.payload.board.hook} → ${d.payload.board.beats.join(' · ')}`)
    if (d.payload.quote) console.log(`   quote: “${d.payload.quote.text}”`)
    if (d.payload.diagram) console.log(`   diagram: ${d.payload.diagram.title}: ${d.payload.diagram.rows.map((r) => `${r.from} → ${r.to}`).join(', ')}`)
    console.log(`   references look for: "${d.visual_query}"`)
  })
  console.log('')
  // Checks (scored per run): what the validator guarantees for what's kept, and how much it had to drop.
  score('3–5 directions kept', p.kept.length >= 3 && p.kept.length <= 5)
  score('every direction cites her words verbatim', p.kept.every((d) => { const c = cards.find((x) => x.id === d.cite_card_ids[0]); return !!c && isVerbatim(d.why.replace(/^from [^:]+:\d\d: /, '').replace(/[“”]/g, ''), c.said) }))
  score('no direction duplicates a card', p.kept.every((d) => !cards.some((c) => similarTitles(d.title, c.title))))
  score('no direction asks', p.kept.every((d) => !asks(d.title) && !asks(d.gist)))
  score('at most one stretch', p.kept.filter((d) => d.stretch).length <= 1)
  score('nothing dropped as a misquote', !p.dropped.some((d) => d.reason === 'misquote'))
  score('nothing dropped as a duplicate', !p.dropped.some((d) => d.reason === 'duplicates_card'))
}

console.log(`checks over ${RUNS} runs (pass rate):`)
for (const [name, xs] of rates) console.log(`  ${xs.filter(Boolean).length}/${xs.length}  ${name}`)
console.log(`\ntotal ${cents.toFixed(2)}¢ for ${RUNS} runs`)
