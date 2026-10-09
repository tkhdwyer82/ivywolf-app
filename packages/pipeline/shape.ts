// packages/pipeline/shape.ts
// The form each card takes on Home (Figma 227:5, v3.4): photo | quote | diagram | board | text. A second, small call
// after classify, with its own versioned prompt (prompts/shape_vN.md) — the classify schema can't take these fields
// without its structured-output grammar going over the size limit. Only the card titles, gists and their segment
// text are sent, plus the creator's people names (so a quote's speaker is canonical).
// The invariants below hold whatever the model returns; a failed call leaves every card `text`, never blocks it.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import {
  LOW_CONFIDENCE,
  ShapeOutput,
  type CardBoard,
  type CardDiagram,
  type CardQuote,
  type CardShape,
  type ClassifyOutput,
} from '@ivywolf/schema'

export type ShapeVersion = 'shape_v1' | 'shape_v2'
/**
 * The version that ships. A new version ships through the same ratchet as classify (CLAUDE.md).
 * shape_v1 — Job B revised, 2026-10-05: visual_query names the photographic subject, no style words.
 * shape_v2 — ratcheted over shape_v1, 2026-10-09 (H.0c): visual_query says what the picture should feel like (light,
 *   textures, setting, telling details), not the literal action — "morning light, bare feet, bathroom tiles", not
 *   "person stepping on bathroom scale". Only the shape pass differs, so both ran on the stored classify_v6 output of
 *   the 3 memos (thomas-st, milton-st, rooftop-chase), 3 runs each, same diff() and expected.json
 *   (eval/shape-ratchet.ts): 79 checks, every pass rate equal, v2 worse on none. A first draft with a rooftop example
 *   was dropped: the rooftop memo copied it verbatim in 2 of 3 runs.
 */
export const SHAPE_VERSION: ShapeVersion = 'shape_v2'
const MODEL = 'claude-opus-5'

const PROMPT_FILES: Record<ShapeVersion, URL> = {
  shape_v1: new URL('./prompts/shape_v1.md', import.meta.url),
  shape_v2: new URL('./prompts/shape_v2.md', import.meta.url),
}
const loadPrompt = (v: ShapeVersion) => readFileSync(fileURLToPath(PROMPT_FILES[v]), 'utf8')

type Card = ClassifyOutput['cards'][number]
export interface Shaped {
  shape: CardShape
  visual_query: string
  quote: CardQuote | null
  diagram: CardDiagram | null
  board: CardBoard | null
}
export type ShapedCard = Card & Shaped
/** classify's output with each card's shape folded in — what analyse returns and graph.ts writes. */
export type Analysed = Omit<ClassifyOutput, 'cards'> & { cards: ShapedCard[]; shape_version: ShapeVersion | null }

const TEXT: Shaped = { shape: 'text', visual_query: '', quote: null, diagram: null, board: null }

let client: Anthropic | undefined

export async function shapeCards(input: {
  out: ClassifyOutput
  people: string[]
  version?: ShapeVersion
}): Promise<Analysed> {
  const { out, people, version = SHAPE_VERSION } = input
  if (out.cards.length === 0) return { ...out, cards: [], shape_version: null }
  const segmentText = (c: Card) => out.segments[c.segment_index]?.text ?? ''

  let raw: ShapeOutput['cards'] = []
  try {
    client ??= new Anthropic()
    const response = await client.beta.messages.parse({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      model: MODEL,
      max_tokens: 4000,
      system: [{ type: 'text', text: loadPrompt(version), cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            cards: out.cards.map((c, card_index) => ({ card_index, title: c.title, gist: c.gist, confidence: c.confidence, segment_text: segmentText(c) })),
            people,
          }),
        },
      ],
      output_config: { format: betaZodOutputFormat(ShapeOutput) },
    })
    raw = response.parsed_output?.cards ?? []
    if (!response.parsed_output) console.error(`[shape] no parseable output (${response.stop_reason})`)
  } catch (err) {
    console.error('[shape] failed; cards stay text', err)
  }

  const byIndex = new Map(raw.map((r) => [r.card_index, r]))
  return {
    ...out,
    cards: out.cards.map((c, i) => {
      const r = byIndex.get(i)
      return { ...c, ...(r ? shapeInvariants(r, c.confidence, segmentText(c)) : TEXT) }
    }),
    shape_version: version,
  }
}

/** Lowercase, curly quotes straightened, punctuation and spacing ignored — "verbatim" means the same words in order. */
const words = (t: string) =>
  ` ${t
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()} `

/**
 * Each payload must be real before a card can take its shape: a quote is copied from the segment, a diagram has at
 * least two rows, a board at least two beats, a photo something to search for. A payload that fails is dropped; a
 * shape left without its payload, or any card below LOW_CONFIDENCE, is `text`.
 */
export function shapeInvariants(r: ShapeOutput['cards'][number], confidence: number, segmentText: string): Shaped {
  const quoteText = r.quote_text.trim().replace(/^["“]|["”]$/g, '').trim()
  const quote =
    quoteText && words(segmentText).includes(words(quoteText)) ? { text: quoteText, speaker: r.quote_speaker?.trim() || null } : null
  const rows = r.diagram_rows.map((x) => ({ from: x.from.trim(), to: x.to.trim() })).filter((x) => x.from && x.to).slice(0, 4)
  const diagram = rows.length >= 2 ? { title: r.diagram_title.trim(), rows } : null
  const beats = r.board_beats.map((b) => b.trim()).filter(Boolean).slice(0, 5)
  const board = beats.length >= 2 ? { hook: r.board_hook.trim(), beats } : null
  const visual_query = r.visual_query.trim()

  const has: Record<CardShape, boolean> = { photo: !!visual_query, quote: !!quote, diagram: !!diagram, board: !!board, text: true }
  const shape = confidence < LOW_CONFIDENCE || !has[r.shape] ? 'text' : r.shape
  return { shape, visual_query, quote, diagram, board }
}
