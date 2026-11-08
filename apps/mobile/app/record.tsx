// apps/mobile/app/record.tsx
// Capture, one screen (Job B.11, Figma v5.7 2272:2, C1–C3). Replaces "Ivy is listening" (83:5) and supersedes the
// text-capture frames (198:2 T1–T3). The rules live in lib/capture.ts:
//
// - Opening it starts the mic. No start button. Cold start lands here too (Home with no cards).
// - The big centre button is pause / resume, and the only thing that pauses.
// - Typing never pauses. Tap the black bar: the keyboard comes up, the bar grows with the text (6 lines, then it
//   scrolls), a lime send arrow at its bottom-right, a small lime pause above the keyboard, a thin live waveform over
//   the note. Send keeps the note, stamped with the recording's time when she started typing it, and collapses the bar.
// - Adding a photo never pauses. Her latest photo sits bottom-left; tap → camera or library. Each photo is stamped
//   with the time it was added and shows as a tile under the words.
// - Done finishes: one capture = one recording = one card (lib/capture.ts planCapture: speech → the audio goes up with
//   its notes and photos; typed or photos only → the text path, as Muse's capture_idea). × discards (B.3.1,
//   lib/discard.ts): nothing said, typed or added → closes ("Nothing saved"); otherwise it asks, Keep or Discard.
// - Live words (lib/liveWords.ts) are on-device feedback only; the real transcript is still made after Done.
// - Locking the phone or leaving the app keeps it recording (iOS background audio; UIBackgroundModes already has
//   audio, from expo-audio's plugin).
//
// ?projectId=… (from "Talk to this project"): the recording carries the project (0016).
// ?correctionOf=<card or to-do id>&what=idea|to-do (the mic on the Idea or To-do page): a voice correction (stub).
// ?importKind=image|video&original=…&poster=… (from Add to ideas): the line rides with the import (imports.ts).

import { useEffect, useReducer, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { File } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import * as ImagePicker from 'expo-image-picker'
import * as MediaLibrary from 'expo-media-library/legacy'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { useAuth, useUser } from '@clerk/clerk-expo'
import { useSupabase } from '@/lib/supabase'
import { requestProcessing, submitRecording } from '@/lib/record'
import { closeDecision, setJustRecorded, showNotice } from '@/lib/discard'
import {
  attachCapture,
  captureReducer,
  clock,
  initialCapture,
  photosLine,
  planCapture,
  setPendingCapture,
  statusLine,
  submitTextCapture,
  uploadPhotos,
  type Photo,
} from '@/lib/capture'
import { useLiveWords } from '@/lib/liveWords'
import { hero } from '@/lib/theme'
import { LiveWaveform } from '@/components/LiveWaveform'
import { AvatarInitials } from '@/components/AvatarInitials'
import { Sheet } from '@/components/Sheet'

// Metering drives the waveform and tells speech from silence (SILENT_DB, lib/discard.ts).
const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }
const NOTHING_CLOSE_MS = 1200

// Figma 2272:3 / 2272:51 — measured, not tokens.
const UNSURE = '#AEAEB2'
const GRAD_END = '#E3E3E8'
const LIME_TOP = '#E6F599'
const LIME_BOTTOM = '#BAD959'
const BAR_LINE = 20 // the bar's line height while typing; it grows to 6 lines, then scrolls
const BAR_MAX_LINES = 6

type Phase = { kind: 'live' } | { kind: 'saving' } | { kind: 'nothing' } | { kind: 'failed'; message: string }

export default function Record() {
  const { projectId, importKind, original, poster, correctionOf, what } = useLocalSearchParams<{
    projectId?: string
    correctionOf?: string
    what?: 'idea' | 'to-do'
    importKind?: 'image' | 'video'
    original?: string
    poster?: string
  }>()
  const imported = importKind && original && poster ? { kind: importKind, original_path: original, poster_path: poster } : null
  const insets = useSafeAreaInsets()
  const recorder = useAudioRecorder(RECORDING_OPTIONS)
  const rec = useAudioRecorderState(recorder, 100)
  const supabase = useSupabase()
  const { userId, getToken } = useAuth()
  const { user } = useUser()
  const [cap, dispatch] = useReducer(captureReducer, initialCapture)
  const [phase, setPhase] = useState<Phase>({ kind: 'live' })
  const [noMic, setNoMic] = useState(false)
  const [asking, setAsking] = useState(false)
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [keyboard, setKeyboard] = useState(0)
  const [latest, setLatest] = useState<string | null>(null)
  const startedAt = useRef<Date | null>(null)
  const peakDb = useRef<number | null>(null)
  const recordingId = useRef(randomUUID())
  const stopped = useRef(false)
  const input = useRef<TextInput>(null)
  const words = useLiveWords(cap.mic === 'listening' && phase.kind === 'live')

  useEffect(() => {
    if (cap.mic === 'listening' && typeof rec.metering === 'number') {
      peakDb.current = Math.max(peakDb.current ?? -Infinity, rec.metering)
    }
  }, [cap.mic, rec.metering])

  // Open = listening.
  useEffect(() => {
    ;(async () => {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, allowsBackgroundRecording: true })
      const permission = await requestRecordingPermissionsAsync()
      if (!permission.granted) return setNoMic(true)
      await recorder.prepareToRecordAsync()
      recorder.record()
      startedAt.current = new Date()
      dispatch({ type: 'started' })
    })().catch((e) => setPhase({ kind: 'failed', message: e instanceof Error ? e.message : 'The mic did not start.' }))
    // Start once, on open. The recorder is stable for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Her latest photo, bottom-left — only if she has already let Ivy see her library; opening this never asks.
  useEffect(() => {
    ;(async () => {
      const p = await MediaLibrary.getPermissionsAsync()
      if (!p.granted) return
      const page = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: 'photo', sortBy: [['creationTime', false]] })
      setLatest(page.assets[0]?.uri ?? null)
    })().catch(() => {})
  }, [])

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e: KeyboardEvent) => setKeyboard(e.endCoordinates.height))
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboard(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  /** The recording's own clock: a position in the file, so paused time isn't in it. */
  const now = () => {
    const t = recorder.currentTime
    return typeof t === 'number' && Number.isFinite(t) && t > 0 ? Math.round(t * 1000) : rec.durationMillis
  }
  // Long enough to be more than an accidental tap: the recorder's clock, or wall time if its status never updated.
  const tookMs = () => Math.max(rec.durationMillis, now(), startedAt.current ? Date.now() - startedAt.current.getTime() : 0)
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'))
  const live = phase.kind === 'live'

  // ── The centre button ───────────────────────────────────────────────────────────────────────────────────
  function togglePause() {
    if (!live) return
    if (cap.mic === 'listening') {
      recorder.pause()
      dispatch({ type: 'pause' })
    } else if (cap.mic === 'paused') {
      recorder.record()
      dispatch({ type: 'resume' })
    }
  }

  // ── Typing ──────────────────────────────────────────────────────────────────────────────────────────────
  function onType(t: string) {
    setDraft(t)
    dispatch(t.trim() ? { type: 'typing', atMs: now() } : { type: 'cleared' })
  }
  function send() {
    dispatch({ type: 'send', text: draft })
    setDraft('')
    input.current?.blur()
  }

  // ── Photos ──────────────────────────────────────────────────────────────────────────────────────────────
  function addPhoto() {
    if (!live) return
    ActionSheetIOS.showActionSheetWithOptions({ options: ['Take photo', 'Choose from library', 'Cancel'], cancelButtonIndex: 2 }, (i) => {
      if (i === 0) pick('camera')
      else if (i === 1) pick('library')
    })
  }
  async function pick(from: 'camera' | 'library') {
    try {
      if (from === 'camera') {
        const p = await ImagePicker.requestCameraPermissionsAsync()
        if (!p.granted) return
      }
      const picked =
        from === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: true, selectionLimit: 10 })
      if (picked.canceled) return
      const at = now()
      for (const a of picked.assets) {
        dispatch({ type: 'photo', photo: { atMs: at, uri: a.uri, mimeType: a.mimeType ?? null, fileName: a.fileName ?? null } })
      }
    } catch {
      // The picker failing leaves the recording as it was.
    }
  }

  // ── Done and × ──────────────────────────────────────────────────────────────────────────────────────────
  /** The take, gone from the phone. Nothing was uploaded, so there's nothing else to delete. */
  async function dropAudio() {
    if (!stopped.current && cap.mic !== 'starting') await recorder.stop()
    stopped.current = true
    const uri = recorder.uri
    if (uri) {
      try {
        new File(uri).delete()
      } catch {
        // Already gone, or never written.
      }
    }
  }

  async function onClose() {
    if (!live) return close()
    const added = cap.notes.length > 0 || cap.photos.length > 0 || draft.trim().length > 0
    if (cap.mic === 'starting' && !added) return close()
    if (closeDecision({ peakDb: peakDb.current, imported: !!imported, added }) === 'drop') {
      await dropAudio()
      showNotice('Nothing saved')
      return close()
    }
    if (cap.mic === 'listening') {
      recorder.pause()
      dispatch({ type: 'pause' })
    }
    setAsking(true)
  }

  async function discard() {
    setAsking(false)
    await dropAudio()
    // An import's picture was uploaded before Record opened (lib/imports.ts); discarding it removes both files.
    if (imported) {
      await supabase.storage.from('imports').remove([imported.original_path]).catch(() => {})
      await supabase.storage.from('frames').remove([imported.poster_path]).catch(() => {})
    }
    close()
  }

  async function done() {
    setAsking(false)
    if (phase.kind === 'saving' || phase.kind === 'nothing') return
    // Words still in the bar are hers: Done keeps them, stamped from when she started typing.
    let notes = cap.notes
    if (draft.trim()) {
      notes = [...notes, { atMs: cap.draftAt ?? now(), text: draft.trim() }]
      dispatch({ type: 'send', text: draft })
      setDraft('')
    }
    Keyboard.dismiss()
    const durationMs = now()
    const plan = planCapture({ peakDb: peakDb.current, tookMs: tookMs(), notes, photos: cap.photos, imported: !!imported })

    if (plan.kind === 'nothing') {
      await dropAudio()
      setPhase({ kind: 'nothing' })
      setTimeout(close, NOTHING_CLOSE_MS)
      return
    }
    setPhase({ kind: 'saving' })
    if (!stopped.current && cap.mic !== 'starting') await recorder.stop()
    stopped.current = true
    try {
      const token = await getToken()
      if (!token || !userId) throw new Error('Signed out')
      const photos = await uploadPhotos(supabase, userId, cap.photos, { read: (uri) => new File(uri).arrayBuffer(), id: randomUUID })
      const capture = { notes: notes.length, photos: photos.length }
      let storagePath: string | null = null
      if (plan.kind === 'voice') {
        const uri = recorder.uri
        if (!uri) throw new Error('The recording did not save.')
        const saved = await submitRecording({
          supabase,
          userId,
          token,
          fileUri: uri,
          durationMs,
          recordedAt: startedAt.current ?? new Date(),
          projectId: projectId ?? null,
          recordingId: recordingId.current,
          meta: imported ? { import: imported, capture } : correctionOf ? { correction_of: correctionOf, capture } : { capture },
          beforeProcess: (id) => attachCapture(supabase, userId, id, notes, photos),
        })
        storagePath = saved.storagePath
      } else {
        await dropAudio()
        await submitTextCapture({
          supabase,
          userId,
          recordingId: recordingId.current,
          text: plan.text,
          notes,
          photos,
          recordedAt: startedAt.current ?? new Date(),
          projectId: projectId ?? null,
          requestProcessing: (id) => requestProcessing(id, token),
        })
      }
      // Undo on Home is for her own capture. An import's picture isn't on a card yet, so undoing it would orphan it.
      if (!imported) {
        setJustRecorded({ recordingId: recordingId.current, storagePath, shownAt: Date.now() })
        setPendingCapture({ recordingId: recordingId.current, photos: photos.length })
      }
      close()
    } catch (e) {
      // Done again retries: the audio file and her notes and photos are still here.
      setPhase({ kind: 'failed', message: e instanceof Error ? e.message : 'Upload failed' })
    }
  }

  // ── Words on screen ─────────────────────────────────────────────────────────────────────────────────────
  const status =
    phase.kind === 'saving' ? 'Saving…'
    : phase.kind === 'nothing' ? 'Nothing to save'
    : phase.kind === 'failed' ? 'That didn’t save · tap Done to try again'
    : noMic ? 'The mic is off · you can still type'
    : statusLine(cap.mic, rec.durationMillis)
  const heard = words.sure || words.unsure
  // Before the first word: what this capture is for, in grey (rule 1: never a blank screen).
  const prompt =
    phase.kind === 'nothing' ? 'Ivy didn’t hear anything, so nothing was kept.'
    : phase.kind === 'failed' ? phase.message
    : noMic ? 'Allow the microphone in Settings to talk to Ivy.'
    : imported ? `What’s it for? One line is plenty — or just tap Done and the ${imported.kind} is saved as it is.`
    : correctionOf ? `Say what’s wrong or what to add. Ivy keeps it with this ${what ?? 'idea'}.`
    : 'Say it the way you’d say it to a friend.'
  const level = cap.mic === 'listening' ? rec.metering : undefined
  const photoLine = photosLine(cap.photos)

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Discard" testID="capture-close">
          <SymbolView name="xmark" tintColor={hero.ink} size={20} weight="medium" />
        </Pressable>
        <Pressable onPress={done} hitSlop={12} disabled={phase.kind === 'saving' || phase.kind === 'nothing'} accessibilityRole="button" testID="capture-done">
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.who}>
        <AvatarInitials name={user?.fullName ?? user?.firstName ?? user?.primaryEmailAddress?.emailAddress} uri={user?.hasImage ? user.imageUrl : null} size={36} />
        <View style={styles.whoText}>
          <Text style={styles.you}>You</Text>
          <Text style={styles.status} testID="capture-status">{status}</Text>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.words} accessibilityLiveRegion="polite">
          {heard ? (
            <>
              <Text>{words.sure}</Text>
              {words.unsure ? <Text style={{ color: UNSURE }}>{`${words.sure ? ' ' : ''}${words.unsure}`}</Text> : null}
            </>
          ) : (
            <Text style={{ color: UNSURE }}>{prompt}</Text>
          )}
        </Text>

        {cap.notes.map((n, i) => (
          <Text key={i} style={styles.note}>
            <Text style={styles.noteAt}>{`${clock(n.atMs)}  `}</Text>
            {n.text}
          </Text>
        ))}

        {cap.photos.length > 0 && (
          <View style={styles.photos}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
              {cap.photos.map((p: Photo, i) => (
                <Image key={`${p.uri}-${i}`} source={{ uri: p.uri }} style={styles.tile} contentFit="cover" accessibilityLabel={`Photo added at ${clock(p.atMs)}`} />
              ))}
            </ScrollView>
            {photoLine && <Text style={styles.photoLine}>{photoLine}</Text>}
          </View>
        )}

        {typing && (
          <View style={styles.typing}>
            <LiveWaveform level={level} look="thin" />
            <Bar
              ref={input}
              value={draft}
              onChangeText={onType}
              onSend={send}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
            />
          </View>
        )}
      </ScrollView>

      {typing ? (
        // C2: the small lime pause, just above the keyboard on the right.
        <Pressable
          onPress={togglePause}
          style={[styles.smallPause, { bottom: keyboard + 24 }]}
          accessibilityRole="button"
          accessibilityLabel={cap.mic === 'paused' ? 'Resume recording' : 'Pause recording'}
          testID="capture-pause-small"
        >
          {cap.mic === 'paused' ? <SymbolView name="mic.fill" tintColor={hero.ink} size={18} /> : <PauseBars width={5} height={18} gap={6} />}
        </Pressable>
      ) : (
        <LinearGradient colors={['#FFFFFF', GRAD_END]} style={[styles.bottom, { paddingBottom: insets.bottom + 2 }]}>
          <LiveWaveform level={level} look="compact" />
          <Pressable
            onPress={() => {
              setTyping(true)
              setTimeout(() => input.current?.focus(), 0)
            }}
            style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityHint="Type a note. Ivy keeps listening."
            testID="capture-bar"
          >
            <Text style={styles.barLabel}>Add your ideas here</Text>
          </Pressable>
          <View style={styles.row}>
            <Pressable onPress={addPhoto} style={styles.roll} accessibilityRole="button" accessibilityLabel="Add a photo" testID="capture-photo">
              {latest ? (
                <Image source={{ uri: latest }} style={styles.rollImage} contentFit="cover" />
              ) : (
                <SymbolView name="photo.on.rectangle" tintColor={hero.secondary} size={22} />
              )}
            </Pressable>
            <Pressable
              onPress={togglePause}
              disabled={!live || cap.mic === 'starting'}
              style={({ pressed }) => [styles.ring, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={cap.mic === 'paused' ? 'Resume recording' : 'Pause recording'}
              testID="capture-pause"
            >
              <LinearGradient colors={[LIME_TOP, LIME_BOTTOM]} style={styles.core}>
                {cap.mic === 'paused' ? <SymbolView name="mic.fill" tintColor={hero.ink} size={30} /> : <PauseBars width={8} height={24} gap={8} />}
              </LinearGradient>
            </Pressable>
            <View style={styles.rollSpace} />
          </View>
        </LinearGradient>
      )}

      {asking && (
        <Sheet onClose={done}>
          <Text style={styles.askTitle} accessibilityRole="header">
            Stop and keep it, or throw it away?
          </Text>
          <Text style={styles.askLine}>{`${clock(rec.durationMillis)} so far. Discarding deletes the audio, notes and photos now; nothing is written up.`}</Text>
          <Pressable onPress={done} accessibilityRole="button" style={({ pressed }) => [styles.keep, pressed && styles.pressed]}>
            <Text style={styles.keepLabel}>Keep</Text>
          </Pressable>
          <Pressable onPress={discard} hitSlop={10} accessibilityRole="button" style={styles.discard}>
            <Text style={styles.discardLabel}>Discard</Text>
          </Pressable>
        </Sheet>
      )}
    </View>
  )
}

function PauseBars({ width, height, gap }: { width: number; height: number; gap: number }) {
  return (
    <View style={{ flexDirection: 'row', gap }} accessibilityElementsHidden>
      <View style={{ width, height, borderRadius: width / 2, backgroundColor: hero.ink }} />
      <View style={{ width, height, borderRadius: width / 2, backgroundColor: hero.ink }} />
    </View>
  )
}

/** C2: the black bar as a multiline field — grows with the text to 6 lines, then scrolls; lime send bottom-right. */
const Bar = ({
  ref,
  value,
  onChangeText,
  onSend,
  onFocus,
  onBlur,
}: {
  ref: React.Ref<TextInput>
  value: string
  onChangeText: (t: string) => void
  onSend: () => void
  onFocus: () => void
  onBlur: () => void
}) => (
  <View style={styles.field}>
    <TextInput
      ref={ref}
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onBlur={onBlur}
      multiline
      scrollEnabled
      style={styles.fieldInput}
      selectionColor={hero.lime}
      placeholder="Add your ideas here"
      placeholderTextColor="rgba(255,255,255,0.6)"
      accessibilityLabel="Note"
      testID="capture-input"
    />
    <Pressable
      onPress={onSend}
      disabled={!value.trim()}
      style={[styles.send, !value.trim() && { opacity: 0.4 }]}
      accessibilityRole="button"
      accessibilityLabel="Send note"
      testID="capture-send"
    >
      <SymbolView name="arrow.up" tintColor={hero.ink} size={16} weight="bold" />
    </Pressable>
  </View>
)

// Positions follow the 393 × 852 frames (2272:3 C1, 2272:51 C2, 2272:107 C3).
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  header: { height: 48, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  done: { fontSize: 16, fontWeight: '600', color: hero.ink },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginTop: 12 },
  whoText: { gap: 2 },
  you: { fontSize: 15, fontWeight: '600', color: hero.ink },
  status: { fontSize: 12, color: hero.secondary, fontVariant: ['tabular-nums'] },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 24 },
  words: { fontSize: 22, lineHeight: 31, color: hero.ink, letterSpacing: -0.2 },
  note: { fontSize: 17, lineHeight: 24, color: hero.ink, marginTop: 14 },
  noteAt: { fontSize: 13, color: hero.secondary, fontVariant: ['tabular-nums'] },
  photos: { marginTop: 28 },
  tiles: { gap: 10 },
  tile: { width: 110, height: 138, borderRadius: 14, borderCurve: 'continuous', backgroundColor: hero.fill },
  photoLine: { fontSize: 12, color: hero.secondary, marginTop: 8 },
  typing: { marginTop: 14, gap: 8 },
  field: {
    backgroundColor: hero.ink,
    borderRadius: 26,
    borderCurve: 'continuous',
    paddingLeft: 20,
    paddingRight: 52,
    paddingTop: 14,
    paddingBottom: 14,
    minHeight: 52,
  },
  fieldInput: { color: '#FFFFFF', fontSize: 15, lineHeight: BAR_LINE, maxHeight: BAR_LINE * BAR_MAX_LINES, padding: 0 },
  send: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: hero.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallPause: {
    position: 'absolute',
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: hero.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { alignItems: 'center', paddingTop: 0 },
  bar: {
    alignSelf: 'stretch',
    marginHorizontal: 20,
    marginTop: 36,
    height: 52,
    borderRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: hero.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  row: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 40, marginTop: 34, marginBottom: 34 },
  roll: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: hero.fill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rollImage: { width: '100%', height: '100%' },
  rollSpace: { width: 52 },
  ring: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  core: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.97 }] },
  // ×'s sheet (Figma 1787:5, D1): unchanged.
  askTitle: { fontSize: 17, fontWeight: '600', color: hero.ink, textAlign: 'center' },
  askLine: { fontSize: 12, lineHeight: 16, color: hero.secondary, textAlign: 'center', marginTop: 8 },
  keep: { height: 52, borderRadius: 26, backgroundColor: hero.lime, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  keepLabel: { fontSize: 16, fontWeight: '600', color: hero.ink },
  discard: { alignItems: 'center', paddingVertical: 18 },
  discardLabel: { fontSize: 15, fontWeight: '600', color: '#DB332B' },
})
