// packages/pipeline/eval/run.ts
// Runs one memo through transcribe + classify (no graph writes) and diffs it against <memo>.expected.json,
// using the scoring in eval/README.md.
//
//   npx tsx --env-file=../../.env.local eval/run.ts <memo> <recordings-bucket storage path> [prompt_version]
//   e.g. eval/run.ts 2026-09-21_thomas-st eval/2026-09-21_thomas-st.m4a classify_v2
//
// Writes eval/runs/<memo>.<prompt_version>.actual.json and prints the diff. Exit code 1 if any check fails.
// Card titles/gists are matched "by meaning" per the README — that part is printed side by side for a human.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ClassifyOutput, Utterance } from '@ivywolf/schema'
import { signedUrl } from '../storage'
import { analyse } from '../process'
import { PROMPT_VERSION, type PromptVersion } from '../classify'
import { cardText, embed } from '../embed'
import {
  assignCards,
  cosine,
  MERGE_PROPOSE_MIN,
  NAME_MATCH_MIN,
  proposeMerges,
  THREAD_ATTACH_MIN,
  type Assignment,
  type ThreadState,
} from '../threading'

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

export function diff(
  exp: Expected,
  act: ClassifyOutput,
  utterances: Utterance[],
  recentThreadTitles: string[] = []
): Check[] {
  const checks: Check[] = []
  const push = (name: string, pass: boolean | null, detail: string) => checks.push({ name, pass, detail })

  // Echo guard (CA2 experiment 2): a card whose candidate_threads are exactly the recent_thread_titles it was given
  // has copied its context rather than judged it. Needs ≥ 2 titles: with one, naming it is also what a correct
  // judgement looks like, so the two can't be told apart.
  if (recentThreadTitles.length >= 2) {
    const given = [...recentThreadTitles].map((t) => t.trim().toLowerCase()).sort().join('\u0000')
    const echoed = act.cards.filter(
      (c) => [...c.candidate_threads].map((t) => t.trim().toLowerCase()).sort().join('\u0000') === given
    )
    push(
      'candidate_threads not an echo of recent_thread_titles',
      echoed.length === 0,
      echoed.length === 0
        ? `given ${JSON.stringify(recentThreadTitles)}`
        : `${echoed.map((c) => `"${c.title}"`).join(', ')} named exactly the ${recentThreadTitles.length} titles given`
    )
  } else if (recentThreadTitles.length === 1) {
    push('candidate_threads not an echo of recent_thread_titles', null, `only one title given (${JSON.stringify(recentThreadTitles)}) — echo and judgement look the same`)
  }

  // Rule 9 (do not invent): segment text is copied from the transcript. Whitespace is the only normalisation.
  const squash = (t: string) => t.replace(/\s+/g, ' ').trim()
  const transcript = squash(utterances.map((u) => u.text).join(' '))
  const paraphrased = act.segments.filter((s) => !transcript.includes(squash(s.text)))
  push(
    'segment text verbatim from transcript',
    paraphrased.length === 0,
    paraphrased.length === 0
      ? `${act.segments.length}/${act.segments.length}`
      : paraphrased.map((s) => `${s.type} @${s.start_ms}: "${s.text.slice(0, 70)}"`).join(' | ')
  )

  push('trigger', act.trigger === exp.trigger, `expected ${exp.trigger}, got ${act.trigger}`)

  // Segment types: an expected span is matched if any actual segment of the same type overlaps it.
  // Boundaries are hand-placed, so position is not scored beyond overlap. Expected spans may nest
  // (a loose_end inside an idea), so each is checked independently.
  let segHits = 0
  for (const e of exp.segments) {
    const hit = act.segments.find((a) => a.type === e.type && overlap(a, e) > 0)
    if (hit) segHits++
    const best = [...act.segments].sort((x, y) => overlap(y, e) - overlap(x, e))[0]
    push(
      `segment ${e.type} @${e.start_ms}–${e.end_ms}`,
      !!hit,
      hit
        ? `matched "${hit.text.slice(0, 60)}"`
        : `no overlapping ${e.type}; most overlap: ${best ? `${best.type} @${best.start_ms}–${best.end_ms}` : 'none'}`
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

  // Reference cards: their_idea must be null unless the reference segment itself describes the referenced work.
  // Whether it does is a judgement call, so any non-null their_idea is surfaced as JUDGE, not FAIL (for now).
  const refCards = act.cards.filter((c) => c.is_reference)
  if (refCards.length === 0) {
    push('reference cards: their_idea grounded', true, 'no reference cards')
  }
  for (const c of refCards) {
    const seg = act.segments[c.segment_index]
    push(
      `reference card "${c.title}": their_idea grounded`,
      c.their_idea === null ? true : null,
      c.their_idea === null
        ? 'their_idea is null'
        : `judge by hand — is this described in the segment? their_idea: "${c.their_idea}" | segment: "${seg?.text ?? '(missing)'}"`
    )
  }

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

  return checks
}

/** Thread state after a creator's earlier recording, as the pipeline would have left it. */
export interface EarlierState {
  name: string
  cards: { id: string; title: string; gist: string; candidateThreads: string[] }[]
  vectors: Map<string, number[]>
  threads: ThreadState[]
  assignments: Assignment[]
  mint: () => string
}

/**
 * Replay the earlier memo through thread assignment from an empty graph (it was the creator's first recording),
 * exactly as threadNewCards would. Its thread titles then feed the later memo's classify call as
 * recent_thread_titles, as loadCreatorContext would supply them.
 */
export async function replayEarlier(name: string, earlier: ClassifyOutput): Promise<EarlierState> {
  const cards = earlier.cards.map((c, i) => ({
    id: `earlier#${i}`,
    title: c.title,
    gist: c.gist,
    candidateThreads: c.candidate_threads,
  }))
  const vectors = await embed(cards.map(cardText))
  const vec = new Map(cards.map((c, i) => [c.id, vectors[i]]))
  const threads: ThreadState[] = []
  let n = 0
  const mint = () => `thread-${++n}`
  const assignments = assignCards(cards.map((c) => ({ ...c, embedding: vec.get(c.id)! })), threads, mint)
  return { name, cards, vectors: vec, threads, assignments, mint }
}

/** Most recently created first — loadCreatorContext orders by last_seen desc, and later threads were seen last. */
export const recentThreadTitles = (state: EarlierState) => [...state.threads].reverse().map((t) => t.title)

const describe = (x: Assignment, title: string) =>
  `  "${title}" → ${x.threadId} via ${x.via}` +
  (x.nameMatch ? `  | best name: "${x.nameMatch.candidate}" ~ "${x.nameMatch.title}" ${x.nameMatch.score.toFixed(2)}` : '  | no name match possible') +
  (x.nearest ? `  | nearest centroid: "${x.nearest.title}" ${x.nearest.similarity.toFixed(3)}` : '')

/**
 * CA2: continue the earlier memo's thread state with the later memo's cards, using the pipeline's functions.
 * Passes if a later card lands in a thread holding an earlier card, or a merge is proposed between them.
 */
export async function threadingCheck(
  state: EarlierState,
  later: ClassifyOutput
): Promise<{ check: Check; report: string[] }> {
  const b = later.cards.map((c, i) => ({
    id: `this#${i}`,
    title: c.title,
    gist: c.gist,
    candidateThreads: c.candidate_threads,
  }))
  const bVectors = await embed(b.map(cardText))
  const vec = new Map([...state.vectors, ...b.map((c, i) => [c.id, bVectors[i]] as const)])
  const laterAssignments = assignCards(b.map((c) => ({ ...c, embedding: vec.get(c.id)! })), state.threads, state.mint)
  const merges = proposeMerges(new Set(b.map((c) => c.id)), state.threads)

  const title = new Map([...state.cards, ...b].map((c) => [c.id, c.title]))
  const threadOf = new Map([...state.assignments, ...laterAssignments].map((x) => [x.cardId, x.threadId]))
  const threadTitle = new Map(state.threads.map((t) => [t.id, t.title]))
  const report: string[] = [
    `thresholds: name ≥ ${NAME_MATCH_MIN}, attach ≥ ${THREAD_ATTACH_MIN}, propose merge ≥ ${MERGE_PROPOSE_MIN}`,
    `candidate_threads: ${[...state.cards.map((c) => `${state.name} "${c.title}" ${JSON.stringify(c.candidateThreads)}`), ...b.map((c) => `this "${c.title}" ${JSON.stringify(c.candidateThreads)}`)].join(' | ')}`,
    'card-to-card cosine:',
  ]
  for (const x of b) {
    for (const y of state.cards) {
      report.push(`  ${cosine(vec.get(x.id)!, vec.get(y.id)!).toFixed(3)}  "${x.title}" ↔ ${state.name} "${y.title}"`)
    }
  }
  report.push('assignment, in recording order:')
  for (const x of [...state.assignments, ...laterAssignments]) {
    report.push(describe(x, title.get(x.cardId)!) + `  | thread named "${threadTitle.get(x.threadId)}"`)
  }
  report.push(
    `merges proposed: ${merges.length ? merges.map((m) => `${title.get(m.aCardId)} ↔ ${title.get(m.bCardId)} ${m.similarity.toFixed(3)}`).join('; ') : 'none'}`
  )

  const sameThread = b.filter((x) => state.cards.some((y) => threadOf.get(y.id) === threadOf.get(x.id)))
  const crossMerge = merges.filter((m) => m.aCardId.startsWith('this') !== m.bCardId.startsWith('this'))
  return {
    check: {
      name: `thread identity with ${state.name}`,
      pass: sameThread.length > 0 || crossMerge.length > 0,
      detail: sameThread.length
        ? `same thread: ${sameThread.map((x) => `"${x.title}"`).join(', ')}`
        : crossMerge.length
          ? `merge proposed (${crossMerge.map((m) => m.similarity.toFixed(3)).join(', ')})`
          : 'different threads and no merge proposed',
    },
    report,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [memo, storagePath, promptArg] = process.argv.slice(2)
  const promptVersion = (promptArg ?? PROMPT_VERSION) as PromptVersion
  if (!memo || !storagePath) {
    console.error('usage: eval/run.ts <memo> <recordings-bucket storage path> [prompt_version]')
    process.exit(1)
  }
  const expected = JSON.parse(
    readFileSync(path.join(here, 'memos', `${memo}.expected.json`), 'utf8')
  ) as Expected

  // A memo that expects thread identity with an earlier one is classified in that creator's state: the earlier
  // memo's cards replayed into threads, their titles passed as recent_thread_titles — as the pipeline would.
  let earlierState: EarlierState | null = null
  let earlierMissing: string | null = null
  if (expected.expect_merge_suggestion_with) {
    const other = expected.expect_merge_suggestion_with
    const otherFile = path.join(here, 'runs', `${other}.${promptVersion}.actual.json`)
    try {
      earlierState = await replayEarlier(other, JSON.parse(readFileSync(otherFile, 'utf8')) as ClassifyOutput)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      earlierMissing = `run ${other} on ${promptVersion} first (${path.relative(process.cwd(), otherFile)} missing)`
    }
  }
  const recent = earlierState ? recentThreadTitles(earlierState) : []

  const result = await analyse({
    audioUrl: await signedUrl('recordings', storagePath, 15 * 60),
    source: expected.source,
    promptVersion,
    creator: {
      handle: null,
      niche: null,
      people: [], // expected.json has Arabella canonical=null: the eval creator has no people list
      recent_thread_titles: recent,
    },
  })

  mkdirSync(path.join(here, 'runs'), { recursive: true })
  const outFile = path.join(here, 'runs', `${memo}.${promptVersion}.actual.json`)
  writeFileSync(outFile, JSON.stringify(result.junk ? { junk: result.junk } : result.out, null, 2))

  if (result.junk) {
    console.log(`${memo}: FAIL — classified as junk (${result.junk})`)
    process.exit(1)
  }
  console.log(`prompt: ${promptVersion}`)
  if (earlierState) console.log(`recent_thread_titles given to classify: ${JSON.stringify(recent)}`)
  console.log(`duration: expected ${expected.duration_ms} ms, transcribed ${result.transcript.duration_ms} ms`)
  console.log(`title: expected "${expected.title}", got "${result.out.title}"\n`)
  const checks = diff(expected, result.out, result.transcript.utterances, recent)
  if (earlierMissing) {
    checks.push({ name: `thread identity with ${expected.expect_merge_suggestion_with}`, pass: false, detail: earlierMissing })
  }
  if (earlierState) {
    const { check, report } = await threadingCheck(earlierState, result.out)
    checks.push(check)
    console.log(report.join('\n') + '\n')
  }
  for (const c of checks) {
    console.log(`${c.pass === null ? 'JUDGE' : c.pass ? 'pass ' : 'FAIL '}  ${c.name} — ${c.detail}`)
  }
  const failed = checks.filter((c) => c.pass === false).length
  console.log(`\n${memo}: ${failed === 0 ? 'PASS' : `FAIL (${failed})`}  · actual → ${path.relative(process.cwd(), outFile)}`)
  process.exit(failed === 0 ? 0 : 1)
}
