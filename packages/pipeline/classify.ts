// packages/pipeline/classify.ts
// classify_v1: one recording's utterances → segments, cards, actions, entities, loose ends, requests.
// The prompt is the versioned markdown in prompts/; this file only frames the input and enforces the invariants
// in CLAUDE.md that must hold whatever the model returns.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { ClassifyOutput, type RecordingSource, type Utterance } from '@ivywolf/schema'

export type PromptVersion = 'classify_v1' | 'classify_v2' | 'classify_v3' | 'classify_v4'
/**
 * The version that ships. Change only when the candidate clears the ratchet in CLAUDE.md: it fails no eval check
 * that the current shipping version passes, both scored with the same scorer, expected.json and transcripts.
 *
 * classify_v4 — ratcheted over classify_v1, 2026-09-21, on 2 memos (thomas-st, milton-st).
 *   v1 fails 11 checks (5 + 6); v4 fails 1 (thomas-st card precision: extra reference card); v4 regresses on none.
 */
export const PROMPT_VERSION: PromptVersion = 'classify_v4'
const MODEL = 'claude-opus-5'

// Static `new URL(…, import.meta.url)` per version so bundlers (Next, for the process route) ship the markdown
// alongside the code. Keep one entry per prompts/*.md.
const PROMPT_FILES: Record<PromptVersion, URL> = {
  classify_v1: new URL('./prompts/classify_v1.md', import.meta.url),
  classify_v2: new URL('./prompts/classify_v2.md', import.meta.url),
  classify_v3: new URL('./prompts/classify_v3.md', import.meta.url),
  classify_v4: new URL('./prompts/classify_v4.md', import.meta.url),
}
const loadPrompt = (v: PromptVersion) => readFileSync(fileURLToPath(PROMPT_FILES[v]), 'utf8')

export interface CreatorContext {
  handle: string | null
  niche: string | null
  people: { canonical: string; aliases: string[] }[]
  recent_thread_titles: string[]
}

/** Segment types that may never produce a card (CLAUDE.md pipeline invariants; eval must_not). */
const NO_CARD_TYPES = new Set(['retracted', 'filler', 'request', 'loose_end', 'junk', 'action', 'entity'])

let client: Anthropic | undefined

export async function classify(input: {
  utterances: Utterance[]
  creator: CreatorContext
  source: RecordingSource
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

  return enforceInvariants(response.parsed_output, input.creator)
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Whatever the model says, these hold before anything reaches the graph. */
export function enforceInvariants(out: ClassifyOutput, creator: CreatorContext): ClassifyOutput {
  const segments = out.segments.map((s) => ({ ...s, confidence: clamp01(s.confidence) }))

  const cards = out.cards
    .filter((c) => {
      const seg = segments[c.segment_index]
      return seg !== undefined && !NO_CARD_TYPES.has(seg.type)
    })
    .map((c) => ({ ...c, confidence: clamp01(c.confidence), energy: clamp01(c.energy) }))

  // Canonicalise against the creator's people list — the model is asked to, but aliases are checked here too.
  const entities = out.entities.map((e) => {
    if (e.canonical) return e
    const seen = [e.name, ...e.aliases_seen].map((a) => a.toLowerCase())
    const match = creator.people.find((p) =>
      [p.canonical, ...p.aliases].some((a) => seen.includes(a.toLowerCase()))
    )
    return match ? { ...e, canonical: match.canonical } : e
  })

  return { ...out, segments, cards, entities }
}
