// packages/pipeline/suggest/validate.ts
// The checks every direction passes before it's stored (Job H). Whatever the model returns, a stored direction:
//   - cites one of her cards, and quotes that card's `said` VERBATIM (the cited line is built here, not by the model);
//   - is new: not a card title, not a rewording of one (fuzzy), not something she dismissed;
//   - never asks her anything and never addresses her;
//   - follows her form profile, with at most one deliberate stretch;
//   - carries the payload its form needs to stand as a card (else it is saved as text — 0038 save_direction).
// Pure: no network, no database (scripts/test-directions.ts).

import type { DirectionOutput } from '@ivywolf/schema'
import { isPinterestUrl } from '@ivywolf/schema'
import { contentWords } from '../references/query'
import type { Direction, Dropped, FormatProfile, InputCard } from './types'

export const MAX_DIRECTIONS = 5

/** Lowercase, curly quotes straightened, punctuation and spacing ignored — "verbatim" means the same words in order. */
const words = (t: string) =>
  ` ${t
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()} `

export function isVerbatim(quote: string, said: string): boolean {
  const q = words(quote).trim()
  return q.split(' ').length >= 3 && words(said).includes(` ${q} `)
}

/** Same idea in other words: token overlap of content words (Jaccard ≥ 0.6, or ≥ 80 % of the shorter title). */
export function similarTitles(a: string, b: string): boolean {
  if (words(a) === words(b)) return true
  const x = new Set(contentWords(a))
  const y = new Set(contentWords(b))
  if (!x.size || !y.size) return false
  const shared = [...x].filter((w) => y.has(w)).length
  const jaccard = shared / new Set([...x, ...y]).size
  return jaccard >= 0.6 || (Math.min(x.size, y.size) >= 2 && shared / Math.min(x.size, y.size) >= 0.8)
}

/** A question, or talking to her ("you could…", "why not…", "what if…") — Ivy never asks. */
export function asks(text: string): boolean {
  return /\?\s*$/.test(text.trim()) || /^\s*(you\b|why not\b|what if\b|have you\b|could you\b|should you\b|how about\b)/i.test(text)
}

/** The forms her profile leans into, most first: kept + 2·hearted + 2·pinned − 2·dismissed, positive only, top 2. */
export function preferredForms(profile: FormatProfile): string[] {
  const score = new Map<string, number>()
  const add = (counts: FormatProfile['kept'], w: number) => {
    for (const [f, n] of Object.entries(counts ?? {})) score.set(f, (score.get(f) ?? 0) + w * (n ?? 0))
  }
  add(profile.kept, 1)
  add(profile.hearted, 2)
  add(profile.pinned, 2)
  add(profile.dismissed, -2)
  return [...score.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f]) => f)
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`

/** "Thu 0:31" — the day she said it (in the recording's zone when known) and where in the recording. */
export function citeLabel(at: string | null, ms: number, tz?: string | null): string {
  if (!at) return clock(ms)
  const d = new Date(at)
  const day = tz ? new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: tz }).format(d).slice(0, 3) : DAYS[d.getDay()]
  return `${day} ${clock(ms)}`
}

/** The one cited line: from Thu 0:31: “…” */
export const whyLine = (card: InputCard & { recorded_tz?: string | null }, quote: string) =>
  `from ${citeLabel(card.recorded_at, card.play_from_ms, card.recorded_tz)}: “${quote.trim().replace(/^["“”']+|["“”']+$/g, '')}”`

/**
 * From the model's output to the directions Ivy stores, and what was dropped and why. `existing` are the project's
 * card titles; `avoid` the last dismissed directions; `profile` her form profile.
 */
export function validateDirections(
  out: DirectionOutput,
  cards: (InputCard & { recorded_tz?: string | null })[],
  existing: string[],
  avoid: string[],
  profile: FormatProfile
): { kept: Direction[]; dropped: Dropped[] } {
  const kept: Direction[] = []
  const dropped: Dropped[] = []
  const preferred = preferredForms(profile)
  let stretches = 0
  for (const d of out.directions) {
    const drop = (reason: Dropped['reason']) => dropped.push({ title: d.title, reason })
    if (!d.title.trim() || !d.gist.trim()) { drop('empty'); continue }
    if ([d.title, d.gist, d.visual_query].some((t) => /https?:\/\/\S+/.test(t) && (t.match(/https?:\/\/\S+/g) ?? []).some(isPinterestUrl))) { drop('pinterest'); continue }
    if (asks(d.title) || asks(d.gist)) { drop('asks'); continue }
    const card = cards[d.cite_card_index]
    if (!card || !card.said.trim()) { drop('bad_cite'); continue }
    if (!isVerbatim(d.cite_quote, card.said)) { drop('misquote'); continue }
    if (existing.some((t) => similarTitles(d.title, t)) || kept.some((k) => similarTitles(d.title, k.title))) { drop('duplicates_card'); continue }
    if (avoid.some((t) => similarTitles(d.title, t))) { drop('was_dismissed'); continue }
    const stretch = preferred.length > 0 && !preferred.includes(d.format === 'video' ? 'board' : d.format)
    if (stretch && ++stretches > 1) { drop('extra_stretch'); continue }

    const payload: Direction['payload'] = {}
    if ((d.format === 'board' || d.format === 'video') && d.board_hook.trim() && d.board_beats.filter((b) => b.trim()).length >= 2)
      payload.board = { hook: d.board_hook.trim(), beats: d.board_beats.map((b) => b.trim()).filter(Boolean).slice(0, 5) }
    if (d.format === 'quote' && d.quote_text.trim() && cards.some((c) => isVerbatim(d.quote_text, c.said)))
      payload.quote = { text: d.quote_text.trim().replace(/^["“”']+|["“”']+$/g, ''), speaker: null }
    if (d.format === 'diagram' && d.diagram_rows.filter((r) => r.from.trim() && r.to.trim()).length >= 2)
      payload.diagram = { title: d.diagram_title.trim(), rows: d.diagram_rows.filter((r) => r.from.trim() && r.to.trim()).slice(0, 4) }

    kept.push({
      title: d.title.trim(),
      gist: d.gist.trim(),
      format: d.format,
      stretch,
      visual_query: d.visual_query.trim(),
      why: whyLine(card, d.cite_quote),
      cite_card_ids: [card.id],
      cite_recording_id: card.recording_id,
      cite_ms: card.play_from_ms,
      payload,
    })
    if (kept.length === MAX_DIRECTIONS) break
  }
  return { kept, dropped }
}
