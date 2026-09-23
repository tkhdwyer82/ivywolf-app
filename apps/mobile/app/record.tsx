// apps/mobile/app/record.tsx
// Record (Figma 83:5). The ⊕ listens; it never asks — opening this screen starts the mic. Tap to stop: the take
// uploads, the server queues it, and the screen closes; the card turns up on Home when Ivy is done. Cold start
// lands here too (Home with no cards). An accidental tap (under 2 s, or silent) isn't uploaded — see MIN_TAKE_MS.
//
// ?projectId=… (from "Talk to this project"): the recording carries the project, and the pipeline scopes the
// classifier's recent threads and the card's placement to it (0016).
// ?correctionOf=<card id> (the Idea page's mic): a voice correction, kept with the card (pipeline stub for now).
// ?importKind=image|video&original=…&poster=… (from Add to ideas): Ivy asks what it's for; the line rides with the
// import and the pipeline makes the card (packages/pipeline/imports.ts).

import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { useAuth } from '@clerk/clerk-expo'
import { useSupabase } from '@/lib/supabase'
import { submitRecording } from '@/lib/record'
import { hero, text } from '@/lib/theme'
import { LiveWaveform } from '@/components/LiveWaveform'

// Metering drives the live waveform; polling at 100 ms keeps it in step with the voice.
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }

// An accidental tap isn't uploaded at all: under MIN_TAKE_MS, or never louder than SILENT_DB (speech on a phone mic
// peaks around −30 to −15 dBFS; a silent room sits below −50), the take is dropped on the phone with "Nothing to
// save". Imports are kept whatever — the picture is the idea. A take the mic never reported a level for is kept
// too: no level data isn't silence, and dropping a real take is worse than uploading a silent one. The server's
// junk gate (< 3 s, no speech) catches anything that gets through.
const MIN_TAKE_MS = 2000
const SILENT_DB = -50
const NOTHING_CLOSE_MS = 1200

type Phase =
  | { kind: 'starting' }
  | { kind: 'recording' }
  | { kind: 'saving' }
  | { kind: 'nothing' }
  | { kind: 'no_mic' }
  | { kind: 'failed'; message: string }

export default function Record() {
  const { projectId, importKind, original, poster, correctionOf } = useLocalSearchParams<{
    projectId?: string
    correctionOf?: string
    importKind?: 'image' | 'video'
    original?: string
    poster?: string
  }>()
  const imported = importKind && original && poster ? { kind: importKind, original_path: original, poster_path: poster } : null
  const insets = useSafeAreaInsets()
  const recorder = useAudioRecorder(RECORDING_OPTIONS)
  const state = useAudioRecorderState(recorder, 100)
  const supabase = useSupabase()
  const { userId, getToken } = useAuth()
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' })
  const startedAt = useRef<Date | null>(null)
  const peakDb = useRef<number | null>(null)
  useEffect(() => {
    if (phase.kind === 'recording' && typeof state.metering === 'number') {
      peakDb.current = Math.max(peakDb.current ?? -Infinity, state.metering)
    }
  }, [phase.kind, state.metering])

  useEffect(() => {
    ;(async () => {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      const permission = await requestRecordingPermissionsAsync()
      if (!permission.granted) {
        setPhase({ kind: 'no_mic' })
        return
      }
      await recorder.prepareToRecordAsync()
      recorder.record()
      startedAt.current = new Date()
      setPhase({ kind: 'recording' })
    })().catch((e) => setPhase({ kind: 'failed', message: e instanceof Error ? e.message : 'The mic did not start.' }))
    // Start once, on open. The recorder is stable for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))

  /** Stop and keep. Closing mid-take keeps it too — nothing she said is thrown away by a tap. */
  async function stop() {
    if (phase.kind !== 'recording') return close()
    // The recorder's own clock, or wall time since start if its status never updated — a stalled clock isn't a short take.
    const durationMs = state.durationMillis
    const tookMs = Math.max(durationMs, startedAt.current ? Date.now() - startedAt.current.getTime() : 0)
    const silent = peakDb.current !== null && peakDb.current < SILENT_DB
    if (!imported && (tookMs < MIN_TAKE_MS || silent)) {
      await recorder.stop()
      setPhase({ kind: 'nothing' })
      setTimeout(close, NOTHING_CLOSE_MS)
      return
    }
    setPhase({ kind: 'saving' })
    await recorder.stop()
    const uri = recorder.uri
    if (!uri || !userId) {
      setPhase({ kind: 'failed', message: 'The recording did not save.' })
      return
    }
    try {
      const token = await getToken()
      if (!token) throw new Error('Signed out')
      await submitRecording({
        supabase,
        userId,
        token,
        fileUri: uri,
        durationMs,
        recordedAt: startedAt.current ?? new Date(),
        projectId: projectId ?? null,
        meta: imported ? { import: imported } : correctionOf ? { correction_of: correctionOf } : undefined,
      })
      close()
    } catch (e) {
      setPhase({ kind: 'failed', message: e instanceof Error ? e.message : 'Upload failed' })
    }
  }

  const title =
    phase.kind === 'saving' ? 'Saving…'
    : phase.kind === 'nothing' ? 'Nothing to save'
    : phase.kind === 'no_mic' ? 'Ivy can’t hear you'
    : phase.kind === 'failed' ? 'That didn’t save'
    : imported ? 'What’s it for?'
    : correctionOf ? 'What should change?'
    : 'Ivy is listening'
  const line =
    phase.kind === 'nothing' ? 'Ivy didn’t hear anything, so nothing was kept.'
    : phase.kind === 'no_mic' ? 'Allow the microphone in Settings to record ideas.'
    : phase.kind === 'failed' ? phase.message
    : correctionOf ? 'Say what’s wrong or what to add. Ivy keeps it with this idea.'
    : imported ? `One line is plenty — or just tap stop and the ${imported.kind} is saved as it is.`
    : 'Say it the way you’d say it to a friend. Errands go to My things on their own.'

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable onPress={stop} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <SymbolView name="xmark" tintColor={hero.ink} size={20} weight="medium" />
        </Pressable>
      </View>

      <View style={styles.middle}>
        <Text style={[text.titleSection, styles.center]}>{title}</Text>
        <Text style={[text.body, styles.timer]}>{formatDuration(state.durationMillis)}</Text>
        <View style={styles.wave}>
          <LiveWaveform level={phase.kind === 'recording' ? state.metering : undefined} />
        </View>
        <Text style={[text.bodySmall, styles.hint]}>{line}</Text>
      </View>

      <View style={styles.bottom}>
        <Pressable
          onPress={stop}
          disabled={phase.kind === 'saving' || phase.kind === 'starting' || phase.kind === 'nothing'}
          accessibilityRole="button"
          accessibilityLabel={phase.kind === 'recording' ? 'Stop recording' : 'Close'}
          style={({ pressed }) => [styles.stop, pressed && { transform: [{ scale: 0.96 }] }]}
        >
          <View style={styles.stopGlyph} />
        </Pressable>
        <Text style={[text.caption, styles.secondary]}>{phase.kind === 'recording' ? 'Tap to stop' : ' '}</Text>
      </View>
    </View>
  )
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Positions follow the 393 × 852 frame: title at 250, waveform at 360, hint at 480, stop button at 660.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room, paddingHorizontal: 20 },
  header: { height: 36, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 1 },
  middle: { alignItems: 'center', marginTop: 158 },
  center: { textAlign: 'center' },
  secondary: { color: hero.secondary, textAlign: 'center' },
  timer: { color: hero.secondary, textAlign: 'center', marginTop: 14, fontVariant: ['tabular-nums'] },
  wave: { marginTop: 47 },
  hint: { color: hero.secondary, textAlign: 'center', width: 300, marginTop: 30 },
  bottom: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingBottom: 46 },
  stop: { width: 84, height: 84, borderRadius: 42, backgroundColor: hero.ink, alignItems: 'center', justifyContent: 'center' },
  stopGlyph: { width: 26, height: 26, borderRadius: 6, backgroundColor: hero.lime },
})
