// packages/schema/index.ts
// One definition per noun. The enums mirror supabase/migrations/0001_graph.sql exactly — if you change one side,
// change the other in the same commit.

import { z } from 'zod'

// ── SQL enums ────────────────────────────────────────────────────────────────────
export const RecordingSource = z.enum([
  'phone', 'note_taker', 'mini', 'dji_import', 'file_import', 'reference_clip', 'interview',
  'muse', // 0026: text captured through the Muse connector
])
export const SegmentType = z.enum([
  'idea', 'action', 'entity', 'loose_end', 'reference', 'request', 'junk', 'retracted', 'filler',
])
export const ThreadStage = z.enum(['sparked', 'developing', 'ready', 'shipped'])
export const ActionScope = z.enum(['personal', 'work'])
export const RequestKind = z.enum(['life', 'idea'])
/** 0006_recording_status.sql: queued → processing → done | junk | failed. Only the pipeline worker moves it. */
export const RecordingStatus = z.enum(['queued', 'processing', 'done', 'junk', 'failed'])
export type RecordingStatus = z.infer<typeof RecordingStatus>

export type RecordingSource = z.infer<typeof RecordingSource>
export type SegmentType = z.infer<typeof SegmentType>

// ── Transcript (Deepgram utterances, normalised to ms) ───────────────────────────
export const Utterance = z.object({
  start_ms: z.number().int(),
  end_ms: z.number().int(),
  speaker: z.string(),
  text: z.string(),
})
export type Utterance = z.infer<typeof Utterance>

// ── classify_v1 structured output ───────────────────────────────────────────────
// Shape follows packages/pipeline/prompts/classify_v1.md "Output". Optional fields are nullable rather than
// optional so the structured-output schema stays strict. Numeric ranges (0–1) are clamped in the pipeline,
// not declared here, because range keywords are not enforced by structured outputs.
export const FormatHint = z.enum([
  'restock_day', 'quiet_launch', 'pricing_reveal', 'grwm', 'brand_pitch', 'launch_video', 'podcast_clip', 'site', 'other',
])

export const Segment = z.object({
  start_ms: z.number().int(),
  end_ms: z.number().int(),
  type: SegmentType,
  text: z.string(),
  speaker: z.string().nullable(),
  confidence: z.number(),
  boundary_marker: z.string().nullable(),
  /** Index into `segments` of the utterance span that cancelled this one (type=retracted only). */
  retracted_by: z.number().int().nullable(),
})

export const Card = z.object({
  segment_index: z.number().int(),
  title: z.string(),
  gist: z.string(),
  play_from_ms: z.number().int(),
  confidence: z.number(),
  energy: z.number(),
  format_hint: FormatHint.nullable(),
  is_reference: z.boolean(),
  their_idea: z.string().nullable(),
  her_take: z.string().nullable(),
  candidate_threads: z.array(z.string()),
  /** classify_v6: one of the creator's project names, or null (the pipeline then files it in My things). */
  candidate_project: z.string().nullable(),
  /** classify_v6: one literal, drawable sentence for the card's frame; "" when the idea is abstract. */
  frame_brief: z.string(),
})

export const Action = z.object({
  segment_index: z.number().int(),
  text: z.string(),
  scope: ActionScope,
  priority: z.enum(['low', 'med', 'high']),
  /** YYYY-MM-DD the action is for, resolved against the recording's local date; null when none was said. */
  due_date: z.string().nullable(),
  /** classify_v6: one literal, drawable sentence for the to-do's frame; "" when there's nothing to draw. */
  frame_brief: z.string(),
})

export const Entity = z.object({
  name: z.string(),
  kind: z.enum(['person', 'place', 'brand']),
  canonical: z.string().nullable(),
  aliases_seen: z.array(z.string()),
})

export const LooseEnd = z.object({
  segment_index: z.number().int(),
  text: z.string(),
  needs: z.enum(['link', 'answer', 'lookup']),
})

export const Request = z.object({
  segment_index: z.number().int(),
  kind: RequestKind,
  text: z.string(),
})

export const ClassifyOutput = z.object({
  trigger: z.enum(['wake_word', 'none']),
  title: z.string(),
  segments: z.array(Segment),
  cards: z.array(Card),
  actions: z.array(Action),
  entities: z.array(Entity),
  loose_ends: z.array(LooseEnd),
  requests: z.array(Request),
  style_signals: z.array(z.string()),
})
export type ClassifyOutput = z.infer<typeof ClassifyOutput>

// ── shape_v1 structured output (Figma 227:5, v3.4) ───────────────────────────────
// A second, small call after classify: the form each card takes on Home. Separate from ClassifyOutput because adding
// these fields to the classify schema pushes its structured-output grammar over the size limit.
/** The form an idea takes on Home. `text` is the low-confidence fallback. */
export const CardShape = z.enum(['photo', 'quote', 'diagram', 'board', 'text'])
export type CardShape = z.infer<typeof CardShape>

/** quote: one line copied verbatim from the segment; speaker is a canonical name, or null when it's her own voice. */
export const CardQuote = z.object({ text: z.string(), speaker: z.string().nullable() })
export type CardQuote = z.infer<typeof CardQuote>
/** diagram: a comparison she said out loud — "old versus new: 5am → 7am". Rendered natively, never drawn. */
export const CardDiagram = z.object({ title: z.string(), rows: z.array(z.object({ from: z.string(), to: z.string() })) })
export type CardDiagram = z.infer<typeof CardDiagram>
/** board: a hook and the beats she described, in order. Its status pill is the thread's stage, read at render time. */
export const CardBoard = z.object({ hook: z.string(), beats: z.array(z.string()) })
export type CardBoard = z.infer<typeof CardBoard>

// Payloads are flat ("" / [] = none) so the grammar stays small; shape.ts folds them into the objects above.
export const ShapeOutput = z.object({
  cards: z.array(
    z.object({
      card_index: z.number().int(),
      shape: CardShape,
      visual_query: z.string(),
      quote_text: z.string(),
      quote_speaker: z.string().nullable(),
      diagram_title: z.string(),
      diagram_rows: z.array(z.object({ from: z.string(), to: z.string() })),
      board_hook: z.string(),
      board_beats: z.array(z.string()),
    })
  ),
})
export type ShapeOutput = z.infer<typeof ShapeOutput>

/** The forms a direction can take (Job H): a card's forms plus video. */
export const DirectionFormat = z.enum(['photo', 'quote', 'board', 'diagram', 'text', 'video'])
export type DirectionFormat = z.infer<typeof DirectionFormat>

/** direction_v1's structured output (packages/pipeline/prompts/direction_v1.md). */
export const DirectionOutput = z.object({
  directions: z.array(
    z.object({
      title: z.string(),
      gist: z.string(),
      cite_card_index: z.number().int(),
      cite_quote: z.string(),
      format: DirectionFormat,
      stretch: z.boolean(),
      visual_query: z.string(),
      board_hook: z.string(),
      board_beats: z.array(z.string()),
      quote_text: z.string(),
      diagram_title: z.string(),
      diagram_rows: z.array(z.object({ from: z.string(), to: z.string() })),
    })
  ),
})
export type DirectionOutput = z.infer<typeof DirectionOutput>

// ── Graph rows (as read by the app under RLS) ────────────────────────────────────
// Column names and nullability follow supabase/migrations/0001_graph.sql. Only the columns the app selects.
export const RecordingRow = z.object({
  id: z.string().uuid(),
  source: RecordingSource,
  storage_path: z.string(),
  duration_ms: z.number().int().nullable(),
  recorded_at: z.string().nullable(),
  received_at: z.string(),
  title: z.string().nullable(),
  is_junk: z.boolean(),
  junk_reason: z.string().nullable(),
  status: RecordingStatus,
})
export type RecordingRow = z.infer<typeof RecordingRow>

export const CardRow = z.object({
  id: z.string().uuid(),
  recording_id: z.string().uuid(),
  title: z.string(),
  gist: z.string(),
  play_from_ms: z.number().int(),
  confidence: z.number(),
  energy: z.number().nullable(),
  is_reference: z.boolean(),
  frame_url: z.string().nullable(),
  created_at: z.string(),
})
export type CardRow = z.infer<typeof CardRow>

export const ThreadRow = z.object({
  id: z.string().uuid(),
  title: z.string(),
  stage: ThreadStage,
  last_seen: z.string(),
})
export type ThreadRow = z.infer<typeof ThreadRow>

export const ActionRow = z.object({
  id: z.string().uuid(),
  recording_id: z.string().uuid().nullable(),
  text: z.string(),
  scope: ActionScope,
  priority: z.enum(['low', 'med', 'high']),
  due_date: z.string().nullable(),
  done: z.boolean(),
  created_at: z.string(),
})
export type ActionRow = z.infer<typeof ActionRow>

export const LooseEndRow = z.object({
  id: z.string().uuid(),
  recording_id: z.string().uuid().nullable(),
  text: z.string(),
  needs: z.enum(['link', 'answer', 'lookup']).nullable(),
  resolved_url: z.string().nullable(),
  created_at: z.string(),
})
export type LooseEndRow = z.infer<typeof LooseEndRow>

/** Below this a card is shown greyed with "Ivy isn't sure" (CLAUDE.md pipeline invariants). */
export const LOW_CONFIDENCE = 0.6

export { PINTEREST, isPinterestSource, isPinterestUrl, refusePinterest } from './pinterest'
