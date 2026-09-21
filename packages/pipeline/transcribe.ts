// packages/pipeline/transcribe.ts
// Deepgram pre-recorded transcription: nova-3, diarize, utterances. Deepgram fetches the audio from a short-lived
// signed URL, so the raw file never leaves Supabase storage except to the transcription adapter.
//
// Deepgram's utterances are pause-based, so one utterance can hold an errand, a request and "anyway, back to the
// idea". The classifier can only draw boundaries between the units it is given, so utterances are split again at
// sentence ends using the word timings.

import type { Utterance } from '@ivywolf/schema'

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen'

export interface Transcript {
  duration_ms: number
  utterances: Utterance[]
  /** Deepgram's response, stored on recordings.transcript for audit and re-classification. */
  raw: unknown
}

interface DeepgramWord {
  start: number
  end: number
  word: string
  punctuated_word?: string
}

interface DeepgramUtterance {
  start: number
  end: number
  speaker?: number
  transcript: string
  words?: DeepgramWord[]
}

interface DeepgramResponse {
  metadata?: { duration?: number }
  results?: { utterances?: DeepgramUtterance[] }
}

const SENTENCE_END = /[.?!]["')\]]*$/

/** Split one utterance into sentences at . ? ! using its word timings. Falls back to the whole utterance. */
export function splitSentences(u: DeepgramUtterance): Utterance[] {
  const speaker = String(u.speaker ?? 0)
  const words = u.words ?? []
  if (words.length === 0) {
    return [{ start_ms: Math.round(u.start * 1000), end_ms: Math.round(u.end * 1000), speaker, text: u.transcript.trim() }]
  }

  const out: Utterance[] = []
  let current: DeepgramWord[] = []
  const flush = () => {
    if (current.length === 0) return
    out.push({
      start_ms: Math.round(current[0].start * 1000),
      end_ms: Math.round(current[current.length - 1].end * 1000),
      speaker,
      text: current.map((w) => w.punctuated_word ?? w.word).join(' '),
    })
    current = []
  }
  for (const w of words) {
    current.push(w)
    if (SENTENCE_END.test(w.punctuated_word ?? '')) flush()
  }
  flush()
  return out
}

export async function transcribe(audioUrl: string): Promise<Transcript> {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) throw new Error('DEEPGRAM_API_KEY is not set')

  const params = new URLSearchParams({
    model: 'nova-3',
    diarize: 'true',
    utterances: 'true',
    smart_format: 'true',
    punctuate: 'true',
  })

  const res = await fetch(`${DEEPGRAM_URL}?${params}`, {
    method: 'POST',
    headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: audioUrl }),
  })
  if (!res.ok) {
    throw new Error(`Deepgram failed: ${res.status} ${res.statusText} ${await res.text()}`)
  }

  const raw = (await res.json()) as DeepgramResponse
  const utterances: Utterance[] = (raw.results?.utterances ?? [])
    .filter((u) => u.transcript.trim().length > 0)
    .flatMap(splitSentences)

  return { duration_ms: Math.round((raw.metadata?.duration ?? 0) * 1000), utterances, raw }
}
