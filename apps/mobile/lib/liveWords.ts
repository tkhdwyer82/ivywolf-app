// apps/mobile/lib/liveWords.ts
// The words arriving on the capture screen (B.11, C1): feedback only. The real transcript is still Deepgram's, made
// after Done, as before. Recognition runs on the phone (SFSpeechRecognizer with requiresOnDeviceRecognition) beside
// expo-audio's recorder, on the same playAndRecord session; where on-device recognition isn't available, or speech
// recognition isn't allowed, there are no live words and the recording is unaffected. Audio never goes to Apple's
// servers for this (working agreements: her audio lives in Supabase storage only).
//
// iOS sends the whole of the current recognition each time, revising its last few words as it goes; those last
// words are grey (#AEAEB2) until the recognition settles, everything before them ink.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AVAudioSessionCategory,
  AVAudioSessionCategoryOptions,
  AVAudioSessionMode,
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'

/** What's on screen: earlier recognitions (settled), and the current one as last sent. */
export interface LiveWords {
  settled: string
  current: string
  final: boolean
}

export const EMPTY_WORDS: LiveWords = { settled: '', current: '', final: true }
/** How many trailing words of a running recognition are still "not sure". */
export const UNSURE_WORDS = 3

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b)

/** A result for the running recognition: it replaces the last one. */
export function addResult(w: LiveWords, transcript: string, isFinal: boolean): LiveWords {
  return { ...w, current: transcript.trim(), final: isFinal }
}

/** A recognition ended (iOS ends one after a while or a long silence; the next one starts on its own). */
export function endRecognition(w: LiveWords): LiveWords {
  return { settled: join(w.settled, w.current), current: '', final: true }
}

/** Ink and grey. */
export function split(w: LiveWords): { sure: string; unsure: string } {
  if (w.final || !w.current) return { sure: join(w.settled, w.current), unsure: '' }
  const words = w.current.split(/\s+/)
  const cut = Math.max(0, words.length - UNSURE_WORDS)
  return { sure: join(w.settled, words.slice(0, cut).join(' ')), unsure: words.slice(cut).join(' ') }
}

/** Live words while `active` (listening, not paused). */
export function useLiveWords(active: boolean): { sure: string; unsure: string } {
  const [words, setWords] = useState<LiveWords>(EMPTY_WORDS)
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const running = useRef(false)
  const want = useRef(active)
  want.current = active

  const start = useCallback(() => {
    if (running.current || !want.current) return
    try {
      running.current = true
      ExpoSpeechRecognitionModule.start({
        lang: 'en-AU',
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: true,
        addsPunctuation: true,
        // expo-audio's recorder is on this session; keep its category rather than the module's measurement mode.
        iosCategory: {
          category: AVAudioSessionCategory.playAndRecord,
          categoryOptions: [AVAudioSessionCategoryOptions.defaultToSpeaker, AVAudioSessionCategoryOptions.allowBluetooth],
          mode: AVAudioSessionMode.default,
        },
      })
    } catch {
      running.current = false
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) return setAllowed(false)
        const p = await ExpoSpeechRecognitionModule.requestSpeechRecognizerPermissionsAsync()
        setAllowed(p.granted)
      } catch {
        setAllowed(false)
      }
    })()
    return () => {
      try {
        ExpoSpeechRecognitionModule.abort()
      } catch {}
    }
  }, [])

  useEffect(() => {
    if (!allowed) return
    if (active) start()
    else if (running.current) {
      // Paused: settle what's there and stop listening until she resumes.
      setWords(endRecognition)
      try {
        ExpoSpeechRecognitionModule.stop()
      } catch {}
    }
  }, [active, allowed, start])

  useSpeechRecognitionEvent('result', (e) => {
    const best = e.results[0]?.transcript ?? ''
    setWords((w) => addResult(w, best, e.isFinal))
  })
  useSpeechRecognitionEvent('end', () => {
    running.current = false
    setWords(endRecognition)
    if (want.current && allowed) start()
  })
  useSpeechRecognitionEvent('error', () => {
    running.current = false
  })

  return split(words)
}
