// packages/pipeline/classify.ts
// One recording's utterances → segments, cards, actions, entities, loose ends, requests.
// The prompt is the versioned markdown in prompts/; this file only frames the input and enforces the invariants
// in CLAUDE.md that must hold whatever the model returns.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { ClassifyOutput, type RecordingSource, type Utterance } from '@ivywolf/schema'

export type PromptVersion = 'classify_v1' | 'classify_v2' | 'classify_v3' | 'classify_v4' | 'classify_v5' | 'classify_v6'
/**
 * The version that ships. Change only when the candidate clears the ratchet in CLAUDE.md: it fails no eval check
 * that the current shipping version passes, both scored with the same scorer, expected.json and transcripts — checks
 * that vary run to run scored by pass rate over 3 runs each (from classify_v6 on).
 *
 * classify_v4 — ratcheted over classify_v1, 2026-09-21, on 2 memos (thomas-st, milton-st).
 *   v1 fails 11 checks (5 + 6); v4 fails 1 (thomas-st card precision: extra reference card); v4 regresses on none.
 * classify_v5 — ratcheted over classify_v4, 2026-09-22, on 3 memos (thomas-st, milton-st, rooftop-chase), scorer
 *   now checking action due dates. v4 fails 4 (thomas-st card + recall; milton-st "one second" filler + type
 *   accuracy); v5 fails 0; v5 regresses on none. Single runs — v4 scored 1 fail on the same memos the day before.
 * classify_v6 — ratcheted over classify_v5, 2026-09-23, on the same 3 memos, scorer now checking candidate_project
 *   and frame_brief. Single runs (dependency order thomas-st → milton-st → rooftop-chase): thomas-st v5 fails 1 (card
 *   precision), v6 0; rooftop-chase both 0. milton-st's "one second" filler varies run to run, so milton-st was scored
 *   by pass rate over 3 runs each (repeat-run rule, docs/rnd/eval-method-repeat-runs.md): filler 2/3 vs 2/3,
 *   segment-type accuracy 2/3 vs 2/3, "one second" marker v5 2/3 · v6 3/3, milk brief 1/3 · 3/3, briefs name no one
 *   0/3 · 3/3; every other check 3/3 both. v6 ≥ v5 on every check.
 */
export const PROMPT_VERSION: PromptVersion = 'classify_v6'
const MODEL = 'claude-opus-5'

/**
 * Versions whose prompt defines frame_brief and candidate_project. The output schema is shared, so earlier versions
 * return the fields too, unguided (v5 writes descriptions naming people); graph.ts writes them only for these.
 */
export const PROJECT_AND_FRAME_VERSIONS: ReadonlySet<PromptVersion> = new Set(['classify_v6'])

// Static `new URL(…, import.meta.url)` per version so bundlers (Next, for the process route) ship the markdown
// alongside the code. Keep one entry per prompts/*.md.
const PROMPT_FILES: Record<PromptVersion, URL> = {
  classify_v1: new URL('./prompts/classify_v1.md', import.meta.url),
  classify_v2: new URL('./prompts/classify_v2.md', import.meta.url),
  classify_v3: new URL('./prompts/classify_v3.md', import.meta.url),
  classify_v4: new URL('./prompts/classify_v4.md', import.meta.url),
  classify_v5: new URL('./prompts/classify_v5.md', import.meta.url),
  classify_v6: new URL('./prompts/classify_v6.md', import.meta.url),
}
const loadPrompt = (v: PromptVersion) => readFileSync(fileURLToPath(PROMPT_FILES[v]), 'utf8')

export interface CreatorContext {
  handle: string | null
  niche: string | null
  people: { canonical: string; aliases: string[] }[]
  recent_thread_titles: string[]
  /** Names of the creator's projects, defaults included — what candidate_project may name (0011_projects.sql). */
  projects: string[]
}

/** The creator's local calendar day when the recording was made — what "Thursday" or "tomorrow" is relative to. */
export interface RecordedDay {
  local_date: string // YYYY-MM-DD
  weekday: string // Monday … Sunday
  timezone: string // IANA
}

/** recorded_at + the device's zone → local day. Null when either is missing: relative dates then stay unresolved. */
export function recordedDay(recordedAt: string | null, timezone: string | null): RecordedDay | null {
  if (!recordedAt || !timezone) return null
  const at = new Date(recordedAt)
  if (Number.isNaN(at.getTime())) return null
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' })
        .formatToParts(at)
        .map((p) => [p.type, p.value])
    )
    return { local_date: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday, timezone }
  } catch {
    return null // unknown zone name
  }
}

/** Segment types that may never produce a card (CLAUDE.md pipeline invariants; eval must_not). */
const NO_CARD_TYPES = new Set(['retracted', 'filler', 'request', 'loose_end', 'junk', 'action', 'entity'])

let client: Anthropic | undefined

export async function classify(input: {
  utterances: Utterance[]
  creator: CreatorContext
  source: RecordingSource
  recorded: RecordedDay | null
  promptVersion?: PromptVersion
}): Promise<ClassifyOutput> {
  const { promptVersion = PROMPT_VERSION, ...payload } = input
  // Server-side fallback: if Opus 5 declines, the API re-runs the same request on a fallback model in-call.
  client ??= new Anthropic()
  const response = await client.beta.messages.parse({
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: 'text', text: loadPrompt(promptVersion), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    output_config: { format: betaZodOutputFormat(ClassifyOutput) },
  })

  if (response.stop_reason === 'refusal') {
    throw new Error(`classify refused: ${response.stop_details?.category ?? 'unknown'}`)
  }
  if (response.stop_reason === 'max_tokens') throw new Error('classify hit max_tokens')
  if (!response.parsed_output) throw new Error('classify returned no parseable output')

  return enforceInvariants(response.parsed_output, input.creator, input.recorded)
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

const isCalendarDate = (d: string | null) =>
  !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d)

/** A candidate project must be one of hers, spelled as she spelled it; anything else is null (→ My things). */
function knownProject(candidate: string | null, projects: string[]): string | null {
  const key = candidate?.trim().toLowerCase()
  return (key && projects.find((p) => p.trim().toLowerCase() === key)) || null
}

/** Whatever the model says, these hold before anything reaches the graph. */
export function enforceInvariants(
  out: ClassifyOutput,
  creator: CreatorContext,
  recorded: RecordedDay | null = null
): ClassifyOutput {
  const segments = out.segments.map((s) => ({ ...s, confidence: clamp01(s.confidence) }))

  const cards = out.cards
    .filter((c) => {
      const seg = segments[c.segment_index]
      return seg !== undefined && !NO_CARD_TYPES.has(seg.type)
    })
    .map((c) => ({
      ...c,
      confidence: clamp01(c.confidence),
      energy: clamp01(c.energy),
      candidate_project: knownProject(c.candidate_project, creator.projects),
      frame_brief: c.frame_brief.trim(),
    }))

  // Canonicalise against the creator's people list — the model is asked to, but aliases are checked here too.
  const entities = out.entities.map((e) => {
    if (e.canonical) return e
    const seen = [e.name, ...e.aliases_seen].map((a) => a.toLowerCase())
    const match = creator.people.find((p) =>
      [p.canonical, ...p.aliases].some((a) => seen.includes(a.toLowerCase()))
    )
    return match ? { ...e, canonical: match.canonical } : e
  })

  // A due date must be a real calendar day, and can't be before the day it was said. Without a recorded day
  // there was nothing to resolve "Thursday" against, so any date the model produced is a guess — drop it.
  const actions = out.actions.map((a) => ({
    ...a,
    due_date: recorded && isCalendarDate(a.due_date) && a.due_date! >= recorded.local_date ? a.due_date : null,
    frame_brief: a.frame_brief.trim(),
  }))

  return { ...out, segments, cards, actions, entities }
}
