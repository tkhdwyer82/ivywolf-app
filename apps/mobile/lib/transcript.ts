// apps/mobile/lib/transcript.ts
// The transcript sheet (P7): every word, coloured by what Ivy did with it — ideas bold, loose ends green, things for
// My things orange, the wake word and filler grey, retracted spans struck through. Built from the stored
// utterances and the recording's segments, whose text is verbatim from the utterances (classify rule 1).

import type { SupabaseClient } from '@supabase/supabase-js'

export type SpanKind = 'idea' | 'loose_end' | 'action' | 'filler' | 'retracted' | 'plain'
export interface Span {
  text: string
  kind: SpanKind
}
export interface Turn {
  speaker: string
  spans: Span[]
}

interface Utterance {
  speaker: string
  text: string
  start_ms: number
}
interface Segment {
  type: string
  text: string
  start_ms: number
}

/** Where two segments cover the same words (an action inside a request), the first kind here wins. */
const PRIORITY: Record<string, SpanKind | undefined> = {
  idea: 'idea',
  reference: 'idea',
  loose_end: 'loose_end',
  action: 'action',
  retracted: 'retracted',
  filler: 'filler',
}
const RANK: SpanKind[] = ['idea', 'loose_end', 'action', 'retracted', 'filler', 'plain']

/**
 * Colour each speaker turn. Segment text is located inside the turn's words (verbatim, whitespace-normalised);
 * words no segment covers stay plain. Consecutive utterances by the same speaker are one turn.
 */
export function colourTranscript(utterances: Utterance[], segments: Segment[]): Turn[] {
  const turns: { speaker: string; text: string }[] = []
  for (const u of [...utterances].sort((a, b) => a.start_ms - b.start_ms)) {
    const t = u.text.replace(/\s+/g, ' ').trim()
    const last = turns[turns.length - 1]
    if (last && last.speaker === u.speaker) last.text += ` ${t}`
    else turns.push({ speaker: u.speaker, text: t })
  }

  const ordered = [...segments].sort((a, b) => a.start_ms - b.start_ms)
  return turns.map(({ speaker, text }) => {
    const kinds: SpanKind[] = Array(text.length).fill('plain')
    for (const s of ordered) {
      const kind = PRIORITY[s.type]
      const needle = s.text.replace(/\s+/g, ' ').trim()
      if (!kind || !needle) continue
      const at = text.indexOf(needle)
      if (at === -1) continue
      for (let i = at; i < at + needle.length; i++) {
        if (RANK.indexOf(kind) < RANK.indexOf(kinds[i])) kinds[i] = kind
      }
    }
    const spans: Span[] = []
    for (let i = 0; i < text.length; i++) {
      const last = spans[spans.length - 1]
      if (last && last.kind === kinds[i]) last.text += text[i]
      else spans.push({ text: text[i], kind: kinds[i] })
    }
    return { speaker, spans }
  })
}

export async function loadTranscript(supabase: SupabaseClient, cardId: string) {
  const { data: card, error } = await supabase
    .from('cards')
    .select('recording_id, recordings(transcript, recorded_at)')
    .eq('id', cardId)
    .maybeSingle()
  if (error) throw new Error(`card: ${error.message}`)
  if (!card) return null
  const rec = (card as unknown as { recordings: { transcript: Utterance[] | null; recorded_at: string | null } | null }).recordings
  const { data: segments, error: sErr } = await supabase
    .from('segments')
    .select('type, text, start_ms')
    .eq('recording_id', card.recording_id)
  if (sErr) throw new Error(`segments: ${sErr.message}`)
  const utterances = Array.isArray(rec?.transcript) ? rec!.transcript : []
  return {
    turns: colourTranscript(utterances, (segments ?? []) as Segment[]),
    plain: utterances.map((u) => u.text).join(' '),
  }
}
