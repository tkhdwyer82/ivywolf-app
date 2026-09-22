// apps/mobile/app/(tabs)/record.tsx
// The + button. Tap to record, tap to stop; the take uploads, the server queues it, and this screen polls until
// Ivy is done. Leaving the screen doesn't cancel anything — Voice notes shows the same status.
// Recordings under 3 s are still uploaded — the pipeline marks them junk (too_short) rather than the app
// deciding silently.

import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { useAuth } from '@clerk/clerk-expo'
import { useSupabase } from '@/lib/supabase'
import { submitRecording, waitForRecording, type ProcessOutcome } from '@/lib/record'
import { color, space, type } from '@/lib/theme'
import { LiveWaveform } from '@/components/LiveWaveform'

// Metering drives the live waveform; polling at 100 ms keeps it in step with the voice.
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }

type Phase =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'sending' }
  | { kind: 'listening' }
  | { kind: 'done'; outcome: ProcessOutcome }
  | { kind: 'failed'; message: string }

export default function Record() {
  const recorder = useAudioRecorder(RECORDING_OPTIONS)
  const state = useAudioRecorderState(recorder, 100)
  const supabase = useSupabase()
  const { userId, getToken } = useAuth()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const startedAt = useRef<Date | null>(null)
  const unmounted = useRef(false)

  useEffect(() => {
    setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
    return () => {
      unmounted.current = true
    }
  }, [])

  async function start() {
    const permission = await requestRecordingPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Microphone off', 'Allow microphone access in Settings to record ideas.')
      return
    }
    await recorder.prepareToRecordAsync()
    recorder.record()
    startedAt.current = new Date()
    setPhase({ kind: 'recording' })
  }

  async function stop() {
    const durationMs = state.durationMillis
    await recorder.stop()
    const uri = recorder.uri
    if (!uri || !userId) {
      setPhase({ kind: 'failed', message: 'The recording did not save.' })
      return
    }
    setPhase({ kind: 'sending' })
    try {
      const token = await getToken()
      if (!token) throw new Error('Signed out')
      const { recordingId } = await submitRecording({
        supabase,
        userId,
        token,
        fileUri: uri,
        durationMs,
        recordedAt: startedAt.current ?? new Date(),
      })
      setPhase({ kind: 'listening' })
      const outcome = await waitForRecording(supabase, recordingId, () => unmounted.current)
      // Only report back if the screen is still waiting on this take — not if a new recording has started.
      if (!unmounted.current) setPhase((p) => (p.kind === 'listening' ? { kind: 'done', outcome } : p))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed'
      setPhase((p) => (p.kind === 'recording' ? p : { kind: 'failed', message }))
    }
  }

  const recording = phase.kind === 'recording'

  return (
    <View style={styles.screen}>
      <View style={styles.status}>
        {phase.kind === 'idle' && <Text style={type.meta}>Tap to start. Say it however it comes out.</Text>}
        {recording && (
          <View style={styles.live}>
            <Text style={styles.timer}>{formatDuration(state.durationMillis)}</Text>
            <LiveWaveform level={state.metering} />
          </View>
        )}
        {(phase.kind === 'sending' || phase.kind === 'listening') && (
          <View style={styles.sending}>
            <ActivityIndicator color={color.ink} />
            <Text style={type.meta}>{phase.kind === 'sending' ? 'Saving…' : 'Ivy is listening…'}</Text>
            {phase.kind === 'listening' && (
              <Text style={type.meta}>You can record again — this keeps going in Voice notes.</Text>
            )}
          </View>
        )}
        {phase.kind === 'done' && phase.outcome.status === 'done' && (
          <Pressable onPress={() => router.navigate('/')}>
            <Text style={type.heading}>{phase.outcome.title ?? 'Done'}</Text>
            <Text style={type.meta}>
              {phase.outcome.cards} {phase.outcome.cards === 1 ? 'card' : 'cards'} · see them in Threads
            </Text>
          </Pressable>
        )}
        {phase.kind === 'done' && phase.outcome.status === 'junk' && (
          <Text style={type.meta}>
            {phase.outcome.reason === 'too_short' ? 'That was too short to keep.' : 'Ivy didn’t hear any speech.'}
          </Text>
        )}
        {phase.kind === 'done' && phase.outcome.status === 'failed' && (
          <Text style={styles.error}>Ivy couldn’t process that one. The audio is saved.</Text>
        )}
        {phase.kind === 'done' && phase.outcome.status === 'still_processing' && (
          <Text style={type.meta}>Still working on it — it will appear in Voice notes.</Text>
        )}
        {phase.kind === 'failed' && <Text style={styles.error}>{phase.message}</Text>}
      </View>

      <Pressable
        onPress={recording ? stop : start}
        disabled={phase.kind === 'sending'}
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
        style={({ pressed }) => [styles.button, recording && styles.buttonLive, pressed && { transform: [{ scale: 0.96 }] }]}
      >
        <View style={recording ? styles.stopGlyph : styles.recordGlyph} />
      </Pressable>
    </View>
  )
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xxl, padding: space.xl },
  status: { minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  timer: { fontSize: 44, fontWeight: '300', color: color.ink, fontVariant: ['tabular-nums'] },
  live: { alignItems: 'center', gap: space.l },
  sending: { alignItems: 'center', gap: space.s },
  error: { color: color.accent, textAlign: 'center' },
  button: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: color.accent,
  },
  buttonLive: { backgroundColor: color.accent },
  recordGlyph: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.accent },
  stopGlyph: { width: 36, height: 36, borderRadius: 6, backgroundColor: '#fff' },
})
