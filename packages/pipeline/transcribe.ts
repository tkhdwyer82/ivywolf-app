// packages/pipeline/transcribe.ts
// Deepgram pre-recorded transcription: nova-3, diarize, utterances. Deepgram fetches the audio from a short-lived
// signed URL, so the raw file never leaves Supabase storage except to the transcription adapter.

import type { Utterance } from '@ivywolf/schema'

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen'

export interface Transcript {
  duration_ms: number
  utterances: Utterance[]
  /** Deepgram's response, stored on recordings.transcript for audit and re-classification. */
  raw: unknown
}

interface DeepgramResponse {
  metadata?: { duration?: number }
  results?: {
    utterances?: { start: number; end: number; speaker?: number; transcript: string }[]
  }
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
    .map((u) => ({
      start_ms: Math.round(u.start * 1000),
      end_ms: Math.round(u.end * 1000),
      speaker: String(u.speaker ?? 0),
      text: u.transcript.trim(),
    }))

  return { duration_ms: Math.round((raw.metadata?.duration ?? 0) * 1000), utterances, raw }
}
