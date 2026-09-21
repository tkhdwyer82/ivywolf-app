// packages/pipeline/eval/run.ts
// Runs one memo through transcribe + classify_v1 (no graph writes) and diffs it against <memo>.expected.json,
// using the scoring in eval/README.md.
//
//   npx tsx --env-file=../../.env.local eval/run.ts <memo> <recordings-bucket storage path>
//   e.g. eval/run.ts 2026-09-21_thomas-st user_abc/1f2e….m4a
//
// Writes eval/runs/<memo>.<prompt_version>.actual.json and prints the diff. Exit code 1 if any check fails.
// Card titles/gists are matched "by meaning" per the README — that part is printed side by side for a human.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ClassifyOutput } from '@ivywolf/schema'
import { signedUrl } from '../storage'
import { analyse } from '../process'
import { PROMPT_VERSION } from '../classify'

const here = path.dirname(fileURLToPath(import.meta.url))
const PLAY_FROM_TOLERANCE_MS = 3000

interface Expected {
  source: 'phone'
  duration_ms: number
  trigger: 'wake_word' | 'none'
  title: string
  segments: { start_ms: number; end_ms: number; type: string; text: string; boundary_marker?: string }[]
  cards: { title: string; play_from_ms: number; format_hint?: string; min_confidence?: number; candidate_threads?: string[] }[]
  actions: { text: string; scope?: string }[]
  entities: { name: string; kind: string; canonical: string | null; aliases_seen: string[] }[]
  loose_ends: { text: string; needs: string }[]
  requests: { kind: string }[]
  must_not?: { cards_from_types?: string[]; cards_contain?: string[]; physical_descriptors_on_cards?: boolean }
  expect_merge_suggestion_with?: string
}

type Check = { name: string; pass: boolean | null; detail: string }

const overlap = (a: { start_ms: number; end_ms: number }, b: { start_ms: number; end_ms: number }) =>
  Math.max(0, Math.min(a.end_ms, b.end_ms) - Math.max(a.start_ms, b.start_ms))

export function diff(exp: Expected, act: ClassifyOutput): Check[] {
  const checks: Check[] = []
  const push = (name: string, pass: boolean | null, detail: string) => checks.push({ name, pass, detail })

  push('trigger', act.trigger === exp.trigger, `expected ${exp.trigger}, got ${act.trigger}`)

  // Segment types: an expected span is matched if an actual segment of the same type covers ≥50% of it.
  // Expected spans may nest (a loose_end inside an idea), so each is checked independently.
  let segHits = 0
  for (const e of exp.segments) {
    const len = Math.max(1, e.end_ms - e.start_ms)
    const hit = act.segments.find((a) => a.type === e.type && overlap(a, e) / len >= 0.5)
    if (hit) segHits++
    const best = [...act.segments].sort((x, y) => overlap(y, e) - overlap(x, e))[0]
    push(
      `segment ${e.type} @${e.start_ms}–${e.end_ms}`,
      !!hit,
      hit
        ? `matched "${hit.text.slice(0, 60)}"`
        : `no ${e.type} covering it; most overlap: ${best ? `${best.type} @${best.start_ms}–${best.end_ms}` : 'none'}`
    )
    if (e.boundary_marker) {
      const marked = act.segments.some((a) => a.boundary_marker && overlap(a, e) > 0)
      push(`boundary_marker "${e.boundary_marker}"`, marked, marked ? 'recorded' : 'no boundary_marker on overlapping segment')
    }
  }
  push('segment-type accuracy', segHits === exp.segments.length, `${segHits}/${exp.segments.length}`)

  // Cards: precision/recall on play_from_ms (±3 s); title/gist meaning shown for a human to judge.
  const used = new Set<number>()
  for (const e of exp.cards) {
    const i = act.cards.findIndex(
      (c, j) => !used.has(j) && Math.abs(c.play_from_ms - e.play_from_ms) <= PLAY_FROM_TOLERANCE_MS
    )
    if (i === -1) {
      push(`card "${e.title}"`, false, `no card within 3 s of ${e.play_from_ms} ms`)
      continue
    }
    used.add(i)
    const c = act.cards[i]
    const problems: string[] = []
    if (e.format_hint && c.format_hint !== e.format_hint) problems.push(`format_hint ${c.format_hint}≠${e.format_hint}`)
    if (e.min_confidence !== undefined && c.confidence < e.min_confidence)
      problems.push(`confidence ${c.confidence}<${e.min_confidence}`)
    push(
      `card "${e.title}"`,
      problems.length === 0,
      `got "${c.title}" @${c.play_from_ms} — ${c.gist}${problems.length ? ` [${problems.join('; ')}]` : ''} (meaning: judge by hand)`
    )
  }
  const extra = act.cards.filter((_, j) => !used.has(j))
  push(
    'card precision',
    extra.length === 0,
    `${act.cards.length - extra.length}/${act.cards.length} match an expected card` +
      (extra.length ? `; extra: ${extra.map((c) => `"${c.title}" @${c.play_from_ms}`).join(', ')}` : '')
  )
  push('card recall', used.size === exp.cards.length, `${used.size}/${exp.cards.length}`)

  // must_not
  const banned = new Set(exp.must_not?.cards_from_types ?? ['retracted', 'filler', 'request', 'loose_end'])
  const badSource = act.cards.filter((c) => banned.has(act.segments[c.segment_index]?.type ?? ''))
  push('no cards from banned segment types', badSource.length === 0, badSource.map((c) => c.title).join(', ') || 'none')
  for (const word of exp.must_not?.cards_contain ?? []) {
    const hits = act.cards.filter((c) => `${c.title} ${c.gist}`.toLowerCase().includes(word.toLowerCase()))
    push(`no card contains "${word}"`, hits.length === 0, hits.map((c) => c.title).join(', ') || 'none')
  }
  if (exp.must_not?.physical_descriptors_on_cards) {
    push('no physical descriptors on cards', null, 'judge by hand: ' + act.cards.map((c) => `"${c.gist}"`).join(' | '))
  }

  // Life
  push(
    'actions',
    act.actions.length === exp.actions.length &&
      exp.actions.every((e) => act.actions.some((a) => a.text.toLowerCase().includes(e.text.toLowerCase()) && (!e.scope || a.scope === e.scope))),
    `expected ${JSON.stringify(exp.actions)}, got ${JSON.stringify(act.actions.map(({ text, scope }) => ({ text, scope })))}`
  )
  push(
    'loose_ends',
    act.loose_ends.length === exp.loose_ends.length && exp.loose_ends.every((e) => act.loose_ends.some((l) => l.needs === e.needs)),
    `expected ${JSON.stringify(exp.loose_ends)}, got ${JSON.stringify(act.loose_ends.map(({ text, needs }) => ({ text, needs })))}`
  )
  push(
    'requests',
    JSON.stringify(act.requests.map((r) => r.kind).sort()) === JSON.stringify(exp.requests.map((r) => r.kind).sort()),
    `expected kinds ${exp.requests.map((r) => r.kind)}, got ${act.requests.map((r) => r.kind)}`
  )

  // Entities: canonicalisation + aliases seen
  push(
    'entities',
    act.entities.length === exp.entities.length &&
      exp.entities.every((e) =>
        act.entities.some(
          (a) => a.name.toLowerCase() === e.name.toLowerCase() && a.kind === e.kind && a.canonical === e.canonical
        )
      ),
    `expected ${JSON.stringify(exp.entities)}, got ${JSON.stringify(act.entities)}`
  )

  if (exp.expect_merge_suggestion_with) {
    push(
      `merge suggestion with ${exp.expect_merge_suggestion_with}`,
      null,
      'not scored: merge proposals (CA2) need card embeddings, not implemented yet'
    )
  }
  return checks
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [memo, storagePath] = process.argv.slice(2)
  if (!memo || !storagePath) {
    console.error('usage: eval/run.ts <memo> <recordings-bucket storage path>')
    process.exit(1)
  }
  const expected = JSON.parse(
    readFileSync(path.join(here, 'memos', `${memo}.expected.json`), 'utf8')
  ) as Expected

  const result = await analyse({
    audioUrl: await signedUrl('recordings', storagePath, 15 * 60),
    source: expected.source,
    creator: {
      handle: null,
      niche: null,
      people: [], // expected.json has Arabella canonical=null: the eval creator has no people list
      recent_thread_titles: [],
    },
  })

  mkdirSync(path.join(here, 'runs'), { recursive: true })
  const outFile = path.join(here, 'runs', `${memo}.${PROMPT_VERSION}.actual.json`)
  writeFileSync(outFile, JSON.stringify(result.junk ? { junk: result.junk } : result.out, null, 2))

  if (result.junk) {
    console.log(`${memo}: FAIL — classified as junk (${result.junk})`)
    process.exit(1)
  }
  console.log(`duration: expected ${expected.duration_ms} ms, transcribed ${result.transcript.duration_ms} ms`)
  console.log(`title: expected "${expected.title}", got "${result.out.title}"\n`)
  const checks = diff(expected, result.out)
  for (const c of checks) {
    console.log(`${c.pass === null ? 'JUDGE' : c.pass ? 'pass ' : 'FAIL '}  ${c.name} — ${c.detail}`)
  }
  const failed = checks.filter((c) => c.pass === false).length
  console.log(`\n${memo}: ${failed === 0 ? 'PASS' : `FAIL (${failed})`}  · actual → ${path.relative(process.cwd(), outFile)}`)
  process.exit(failed === 0 ? 0 : 1)
}
