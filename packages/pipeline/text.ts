// packages/pipeline/text.ts
// Text in → utterances, so a text recording (0026: Muse's capture_idea) enters classify_v6 the way a transcript does.
//
// The classifier segments between the units it's given (transcribe.ts splits Deepgram utterances at sentence ends
// for the same reason), so the text is split at sentence ends and at blank lines. There is no audio, so the times are
// nominal: words are laid out at a speaking pace, which keeps every segment's start_ms/end_ms ordered and distinct and
// makes play_from_ms a position in the text rather than a moment in a file.

import type { Utterance } from '@ivywolf/schema'

/** ~150 words a minute: what a rambled memo runs at. */
const MS_PER_WORD = 400
/** A capture is one idea, rambled — not a document. Longer text is refused before it reaches here (tools.ts). */
export const MAX_TEXT_CHARS = 4000

export function textUtterances(text: string): Utterance[] {
  const units = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n|(?<=[.?!]["')\]]*)\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0)

  const out: Utterance[] = []
  let at = 0
  for (const u of units) {
    const words = u.split(' ').length
    out.push({ start_ms: at, end_ms: at + words * MS_PER_WORD, speaker: '0', text: u })
    at += words * MS_PER_WORD
  }
  return out
}
