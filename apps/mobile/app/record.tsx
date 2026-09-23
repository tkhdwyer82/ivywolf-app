// apps/mobile/app/record.tsx
// Record (Figma 83:5). The ⊕ listens; it never asks — opening this screen starts the mic. Tap to stop: the take
// uploads, the server queues it, and the screen closes; the card turns up on Home when Ivy is done. Cold start
// lands here too (Home with no cards). Recordings under 3 s are still uploaded — the pipeline marks them junk
// (too_short) rather than the app deciding silently.
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

type Phase =
  | { kind: 'starting' }
  | { kind: 'recording' }
  | { kind: 'saving' }
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
    const durationMs = state.durationMillis
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
    : phase.kind === 'no_mic' ? 'Ivy can’t hear you'
    : phase.kind === 'failed' ? 'That didn’t save'
    : imported ? 'What’s it for?'
    : correctionOf ? 'What should change?'
    : 'Ivy is listening'
  const line =
    phase.kind === 'no_mic' ? 'Allow the microphone in Settings to record ideas.'
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
          disabled={phase.kind === 'saving' || phase.kind === 'starting'}
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
