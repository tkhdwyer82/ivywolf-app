// packages/schema/index.ts
// One definition per noun. The enums mirror supabase/migrations/0001_graph.sql exactly — if you change one side,
// change the other in the same commit.

import { z } from 'zod'

// ── SQL enums ────────────────────────────────────────────────────────────────────
export const RecordingSource = z.enum([
  'phone', 'note_taker', 'mini', 'dji_import', 'file_import', 'reference_clip', 'interview',
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
})

export const Action = z.object({
  segment_index: z.number().int(),
  text: z.string(),
  scope: ActionScope,
  priority: z.enum(['low', 'med', 'high']),
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
