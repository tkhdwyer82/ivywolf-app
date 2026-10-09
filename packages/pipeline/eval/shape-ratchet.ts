// packages/pipeline/eval/shape-ratchet.ts
// The ratchet (CLAUDE.md, eval/README.md) for a shape prompt: candidate vs shipping, on the same classify output.
//
//   npx tsx --env-file=../../.env.local eval/shape-ratchet.ts shape_v1 shape_v2
//
// A shape version changes nothing classify does, so instead of re-transcribing and re-classifying each memo (which
// would make the comparison depend on two classify runs), it reuses the stored runs/<memo>.classify_v6.shape_v1 output's
// classify fields and runs only the shape pass, 3 times per version (the shape call varies run to run, so every check
// is scored by pass rate). Both versions are scored by the same diff() against the same expected.json, with the same
// (empty) utterances — the checks that read utterances score identically for both, since classify is identical.
// Per-run outputs: runs/repeat/<memo>.classify_v6.<version>.vs-<other>.run<n>.actual.json — named per comparison so a
// later ratchet never overwrites an earlier one's evidence. Exit 1 if the candidate's pass rate is below the shipping
// version's on any check.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { diff } from './run'
import { shapeCards, type Analysed, type ShapeVersion } from '../shape'
import type { ClassifyOutput } from '@ivywolf/schema'

const here = path.dirname(fileURLToPath(import.meta.url))
const CLASSIFY = 'classify_v6'
const RUNS = 3
const [shipping, candidate] = process.argv.slice(2) as [ShapeVersion, ShapeVersion]
if (!shipping || !candidate) throw new Error('usage: shape-ratchet.ts <shipping> <candidate>')

const memos = readdirSync(path.join(here, 'memos'))
  .filter((f) => f.endsWith('.expected.json'))
  .map((f) => f.replace('.expected.json', ''))
  .filter((m) => existsSync(path.join(here, 'runs', `${m}.${CLASSIFY}.shape_v1.actual.json`)))

const repeatDir = path.join(here, 'runs', 'repeat')
mkdirSync(repeatDir, { recursive: true })

/** check name (memo-scoped) → version → [pass per run] */
const results = new Map<string, Record<string, (boolean | null)[]>>()

for (const memo of memos) {
  const expected = JSON.parse(readFileSync(path.join(here, 'memos', `${memo}.expected.json`), 'utf8'))
  const stored = JSON.parse(readFileSync(path.join(here, 'runs', `${memo}.${CLASSIFY}.shape_v1.actual.json`), 'utf8')) as Analysed
  // Classify's output alone: the shape fields come off, so each version shapes the same cards from scratch.
  const classified = {
    ...stored,
    cards: stored.cards.map(({ shape: _s, visual_query: _v, quote: _q, diagram: _d, board: _b, ...c }) => c),
  } as unknown as ClassifyOutput
  const people = ((expected.entities ?? []) as { kind?: string; name: string; canonical?: string }[])
    .filter((e) => e.kind === 'person')
    .map((e) => e.canonical ?? e.name)

  for (const version of [shipping, candidate]) {
    for (let run = 1; run <= RUNS; run++) {
      const out = await shapeCards({ out: classified, people, version })
      const other = version === shipping ? candidate : shipping
      writeFileSync(path.join(repeatDir, `${memo}.${CLASSIFY}.${version}.vs-${other}.run${run}.actual.json`), JSON.stringify(out, null, 2) + '\n')
      for (const c of diff(expected, out, [])) {
        const key = `${memo} · ${c.name}`
        const row = results.get(key) ?? {}
        ;(row[version] ??= []).push(c.pass)
        results.set(key, row)
      }
      console.log(`${memo} ${version} run ${run}: ${out.cards.map((c) => `${c.shape}${c.visual_query ? ` "${c.visual_query}"` : ''}`).join(' | ')}`)
    }
  }
}

const rate = (xs: (boolean | null)[] = []) => {
  const scored = xs.filter((x) => x !== null)
  return scored.length ? scored.filter(Boolean).length / scored.length : null
}
let worse = 0
console.log(`\ncheck                                                        ${shipping}  ${candidate}`)
for (const [key, row] of results) {
  const a = rate(row[shipping])
  const b = rate(row[candidate])
  const regress = a !== null && (b === null || b < a)
  if (regress) worse++
  if (a !== b || regress) console.log(`${regress ? 'WORSE ' : 'diff  '}${key.padEnd(55).slice(0, 55)} ${String(a).padEnd(9)} ${b}`)
}
const same = [...results.values()].filter((r) => rate(r[shipping]) === rate(r[candidate])).length
console.log(`\n${results.size} checks: ${same} same pass rate, ${worse} worse for ${candidate}`)
console.log(worse ? `${candidate} does NOT ship (ratchet)` : `${candidate} may ship: it fails no check ${shipping} passes (pass rate over ${RUNS} runs each)`)
process.exit(worse ? 1 : 0)
