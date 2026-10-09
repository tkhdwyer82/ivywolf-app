// packages/pipeline/suggest/types.ts
// More ideas, free (Job H): the shapes the direction generator reads and writes.

import type { DirectionFormat } from '@ivywolf/schema'

export type DirectionVersion = 'direction_v1'

export type CardForm = 'photo' | 'quote' | 'board' | 'diagram' | 'text'

/** One of her cards, as the generator sees it. `said` is her words — the only words a direction may quote. */
export interface InputCard {
  id: string
  title: string
  gist: string
  form: CardForm
  said: string
  recording_id: string | null
  /** When she said it (the recording's time) and where in it. For the cite label: "Thu 0:31". */
  recorded_at: string | null
  play_from_ms: number
  /** Where the recording came from (phone, mini, …) — for Ivy's line. */
  recording_source: string | null
  thread_returns: number
  pinned: boolean
  hearted: boolean
  context: string[]
  source: string
}

/** projects.format_profile (0038): counts per form over the last 90 days. */
export interface FormatProfile {
  kept?: Partial<Record<string, number>>
  hearted?: Partial<Record<string, number>>
  pinned?: Partial<Record<string, number>>
  dismissed?: Partial<Record<string, number>>
}

export interface ProjectInput {
  projectId: string
  creatorId: string
  name: string
  cards: InputCard[]
  profile: FormatProfile
  /** The last 10 directions she dismissed (titles), newest first. */
  avoid: string[]
}

/** A direction that passed every check, ready to store. */
export interface Direction {
  title: string
  gist: string
  format: DirectionFormat
  stretch: boolean
  visual_query: string
  /** The one cited line: "from Thu 0:31: “…”" — her words, verbatim. */
  why: string
  cite_card_ids: string[]
  cite_recording_id: string | null
  cite_ms: number
  payload: { board?: { hook: string; beats: string[] }; quote?: { text: string; speaker: null }; diagram?: { title: string; rows: { from: string; to: string }[] } }
}

/** Why a proposed direction was dropped (logged, and scored by the eval). */
export type Dropped = { title: string; reason: 'bad_cite' | 'misquote' | 'duplicates_card' | 'was_dismissed' | 'extra_stretch' | 'empty' | 'asks' | 'pinterest' }
