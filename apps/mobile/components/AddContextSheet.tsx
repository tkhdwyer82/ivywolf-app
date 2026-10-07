// apps/mobile/components/AddContextSheet.tsx
// Add context (Job C+, Figma 1461:2): Voice note · Text · Link · File · Image across the top, what's already attached
// listed under them, and the line "Context stays on the idea, cited and private. It never rewrites the card."
//   Voice note (1453:106) records right in the sheet — the waveform and a lime stop — and Ivy writes the words down
//              after (apps/web, Deepgram); the row says "Ivy is writing it down…" until she has.
//   Text, Link — typed in place. A link's title and thumbnail are fetched; nothing else from the page.
//   File       a PDF or an image up to 20 MB, stored privately.
//   Image      from her library, then "Use this photo for…" (S6, 227:594): this idea, my style, or both.
// Hold a row to remove it.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio'
import { useAuth } from '@clerk/clerk-expo'
import { colour } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import {
  addFile,
  addImage,
  addLink,
  addText,
  addVoice,
  contextLines,
  FILE_TYPES,
  loadContext,
  MAX_BYTES,
  removeContext,
  type ContextItem,
  type ContextKind,
  type ImageRole,
} from '@/lib/context'
import { LiveWaveform } from '@/components/LiveWaveform'
import { Sheet, SheetRule, SheetSection } from '@/components/Sheet'

type Mode = 'menu' | 'voice' | 'text' | 'link' | { image: { uri: string; name: string; mimeType: string; size: number | null } }

const ICON: Record<ContextKind, SFSymbol> = { voice: 'mic', text: 'text.alignleft', link: 'link', file: 'doc', image: 'photo' }
const OPTIONS: { kind: ContextKind; label: string; icon: SFSymbol }[] = [
  { kind: 'voice', label: 'Voice note', icon: 'mic' },
  { kind: 'text', label: 'Text', icon: 'text.alignleft' },
  { kind: 'link', label: 'Link', icon: 'link' },
  { kind: 'file', label: 'File', icon: 'doc' },
  { kind: 'image', label: 'Image', icon: 'photo' },
]
const POLL_MS = 3000

export function AddContextSheet({ card, onClose }: { card: { id: string; title: string }; onClose: () => void }) {
  const supabase = useSupabase()
  const { userId, getToken } = useAuth()
  const [items, setItems] = useState<ContextItem[] | null>(null)
  const [mode, setMode] = useState<Mode>('menu')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    loadContext(supabase, card.id)
      .then(setItems)
      .catch((e) => setError(e.message))
  }, [supabase, card.id])
  useEffect(load, [load])

  // A voice note being written down: look again until it's done.
  const writing = items?.some((i) => i.kind === 'voice' && i.meta.status === 'transcribing')
  useEffect(() => {
    if (!writing) return
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [writing, load])

  async function act(f: () => Promise<unknown>) {
    if (!userId) return
    setBusy(true)
    setError(null)
    try {
      await f()
      setMode('menu')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t attach')
    } finally {
      setBusy(false)
    }
  }

  async function pick(kind: ContextKind) {
    setError(null)
    if (kind === 'voice' || kind === 'text' || kind === 'link') return setMode(kind)
    if (kind === 'file') {
      const r = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true, multiple: false })
      const f = r.canceled ? null : r.assets[0]
      if (!f) return
      if ((f.size ?? 0) > MAX_BYTES) return setError('That file is over 20 MB.')
      return act(() => addFile(supabase, userId!, card.id, { uri: f.uri, name: f.name, mimeType: f.mimeType ?? 'application/pdf', size: f.size ?? null }))
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: false })
    const a = r.canceled ? null : r.assets[0]
    if (!a) return
    if ((a.fileSize ?? 0) > MAX_BYTES) return setError('That image is over 20 MB.')
    setMode({ image: { uri: a.uri, name: a.fileName ?? 'Image', mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? null } })
  }

  function remove(item: ContextItem) {
    Alert.alert('Remove this?', 'It comes off the idea. The idea itself doesn’t change.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeContext(supabase, item).then(load, (e) => setError(e.message)) },
    ])
  }

  if (typeof mode === 'object') {
    return (
      <Sheet title="Use this photo for…" onClose={() => setMode('menu')}>
        <RolePicker image={mode.image.uri} busy={busy} onAdd={(role) => act(() => addImage(supabase, userId!, card.id, mode.image, role))} />
        {error && <Text style={styles.error}>{error}</Text>}
      </Sheet>
    )
  }

  if (mode === 'voice') {
    return (
      <Sheet onClose={() => setMode('menu')}>
        <VoiceNote
          title={card.title}
          onDone={(uri, ms) => act(async () => addVoice(supabase, userId!, card.id, uri, ms, await getToken()))}
          onCancel={() => setMode('menu')}
          onError={setError}
        />
        {error && <Text style={styles.error}>{error}</Text>}
      </Sheet>
    )
  }

  return (
    <Sheet title="Add context" subtitle={`to “${card.title}”`} onClose={onClose}>
      <View style={styles.options}>
        {OPTIONS.map((o) => {
          const on = mode === o.kind
          return (
            <Pressable key={o.kind} onPress={() => pick(o.kind)} disabled={busy} style={styles.option} accessibilityRole="button" accessibilityLabel={o.label}>
              <View style={[styles.square, (o.kind === 'voice' || on) && styles.squareLime]}>
                <SymbolView name={o.icon} tintColor={colour.Ink} size={22} />
              </View>
              <Text style={styles.optionLabel}>{o.label}</Text>
            </Pressable>
          )
        })}
      </View>

      {(mode === 'text' || mode === 'link') && (
        <Composer
          kind={mode}
          busy={busy}
          onSubmit={(v) => act(async () => (mode === 'text' ? addText(supabase, userId!, card.id, v) : addLink(supabase, userId!, card.id, v, await getToken())))}
          onCancel={() => setMode('menu')}
        />
      )}
      {busy && mode === 'menu' && <ActivityIndicator style={styles.busy} color={colour.Ink} />}
      {error && <Text style={styles.error}>{error}</Text>}

      <SheetRule />
      {items && items.length > 0 && (
        <>
          <SheetSection label="ALREADY ATTACHED" />
          <ScrollView style={styles.list} contentContainerStyle={styles.listRows}>
            {items.map((i) => {
              const l = contextLines(i)
              return (
                <Pressable key={i.id} onLongPress={() => remove(i)} style={styles.item} accessibilityHint="Hold to remove">
                  <View style={styles.itemIcon}>
                    {i.kind === 'link' && i.meta.thumbnail_url ? (
                      <Image source={{ uri: i.meta.thumbnail_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <SymbolView name={ICON[i.kind]} tintColor={colour.Ink} size={18} />
                    )}
                  </View>
                  <View style={styles.itemWords}>
                    <Text style={styles.itemTitle} numberOfLines={2}>
                      {l.title}
                    </Text>
                    <Text style={styles.itemMeta}>{l.meta}</Text>
                  </View>
                </Pressable>
              )
            })}
          </ScrollView>
        </>
      )}
      <Text style={styles.foot}>Context stays on the idea, cited and private. It never rewrites the card.</Text>
    </Sheet>
  )
}

function Composer({ kind, busy, onSubmit, onCancel }: { kind: 'text' | 'link'; busy: boolean; onSubmit: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('')
  return (
    <View style={styles.composer}>
      <TextInput
        value={value}
        onChangeText={setValue}
        autoFocus
        placeholder={kind === 'text' ? 'What else should Ivy keep with this idea?' : 'Paste a link'}
        placeholderTextColor={colour.Grey}
        multiline={kind === 'text'}
        keyboardType={kind === 'link' ? 'url' : 'default'}
        autoCapitalize={kind === 'link' ? 'none' : 'sentences'}
        autoCorrect={kind === 'text'}
        style={[styles.input, kind === 'text' && styles.inputText]}
      />
      <View style={styles.composerRow}>
        <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Pressable onPress={() => onSubmit(value)} disabled={busy || !value.trim()} style={[styles.add, (busy || !value.trim()) && { opacity: 0.4 }]} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colour.Ink} /> : <Text style={styles.addText}>Add</Text>}
        </Pressable>
      </View>
    </View>
  )
}

/** S6 (227:594): this idea, my style, or both. */
function RolePicker({ image, busy, onAdd }: { image: string; busy: boolean; onAdd: (role: ImageRole) => void }) {
  const [role, setRole] = useState<ImageRole>('idea')
  const choice = (r: ImageRole, title: string, line: string) => (
    <Pressable onPress={() => setRole(r)} style={[styles.role, role === r && styles.roleOn]} accessibilityRole="radio" accessibilityState={{ checked: role === r }}>
      <Text style={styles.roleTitle}>{title}</Text>
      <Text style={styles.roleLine}>{line}</Text>
    </Pressable>
  )
  return (
    <View>
      <Image source={{ uri: image }} style={styles.rolePreview} contentFit="cover" />
      {choice('idea', 'This idea', '“This is the room / outfit / product I mean.” Kept as-is, never replaced by a generated image.')}
      {choice('style', 'My style', '“This is how my work should feel.” Ivy learns light, crop, texture, restraint — not the subject.')}
      <Pressable onPress={() => setRole('both')} style={[styles.both, role === 'both' && styles.roleOn]} accessibilityRole="radio" accessibilityState={{ checked: role === 'both' }}>
        <Text style={styles.bothText}>Both</Text>
      </Pressable>
      <Text style={styles.roleFoot}>You can change this later. Style references can be reset or deleted.</Text>
      <Pressable onPress={() => onAdd(role)} disabled={busy} style={styles.addBig} accessibilityRole="button">
        {busy ? <ActivityIndicator color={colour.Ink} /> : <Text style={styles.addText}>Add</Text>}
      </Pressable>
    </View>
  )
}

/** 1453:106: "ADDING TO “…”", the live waveform, a lime stop. */
function VoiceNote({ title, onDone, onCancel, onError }: { title: string; onDone: (uri: string, ms: number) => void; onCancel: () => void; onError: (m: string) => void }) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true })
  const state = useAudioRecorderState(recorder, 100)
  const started = useRef(false)
  const [ready, setReady] = useState(false)
  // The callbacks change every render of the sheet; the mic starts once.
  const cb = useRef({ onCancel, onError })
  cb.current = { onCancel, onError }

  useEffect(() => {
    const { onCancel, onError } = cb.current
    let live = true
    ;(async () => {
      const { granted } = await requestRecordingPermissionsAsync()
      if (!granted) {
        onError('Ivy needs the microphone for a voice note — Settings › Ivy Wolf › Microphone.')
        return onCancel()
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      if (!live) return
      recorder.record()
      started.current = true
      setReady(true)
    })().catch((e) => onError(e.message))
    return () => {
      live = false
      if (started.current && recorder.isRecording) recorder.stop().catch(() => {})
      setAudioModeAsync({ allowsRecording: false }).catch(() => {})
    }
  }, [recorder])

  async function stop() {
    const ms = state.durationMillis
    await recorder.stop()
    started.current = false
    if (recorder.uri && ms >= 1000) onDone(recorder.uri, ms)
    else onCancel()
  }

  return (
    <View>
      <Text style={styles.adding} numberOfLines={1}>
        ADDING TO “{title.toUpperCase()}”
      </Text>
      <Text style={styles.listening}>{ready ? 'Listening — Ivy writes it down when you stop.' : 'Starting the mic…'}</Text>
      <View style={styles.voiceRow}>
        <View style={styles.wave}>
          <LiveWaveform level={state.metering} />
        </View>
        <Pressable onPress={stop} disabled={!ready} style={styles.stop} accessibilityRole="button" accessibilityLabel="Stop and attach">
          <View style={styles.stopGlyph} />
        </Pressable>
      </View>
      <Text style={styles.voiceFoot}>Attaches as a note on this idea, with its own timestamp. Doesn’t rewrite the card — Talk does that.</Text>
    </View>
  )
}

// Figma 1461:2 — measured: options 54 squares at radius 14 (Voice note lime), labels Regular 11; attached rows a 36
// icon square, Semibold 15 over Regular 12 grey, 18 apart; the foot Regular 11 grey, centred. 1453:106: the overline
// Semibold 11 grey, the stop a 60 lime disc; S6: role cards radius 16, the chosen one outlined in ink.
const SQUARE = 54

const styles = StyleSheet.create({
  options: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  option: { alignItems: 'center', width: 62 },
  square: { width: SQUARE, height: SQUARE, borderRadius: 14, backgroundColor: colour.Chip, alignItems: 'center', justifyContent: 'center' },
  squareLime: { backgroundColor: colour.Lime },
  optionLabel: { fontSize: 11, color: colour.Ink, marginTop: 6 },
  busy: { marginTop: 16 },
  error: { fontSize: 13, color: '#E54033', marginTop: 12 },
  list: { maxHeight: 260 },
  listRows: { gap: 18 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  itemIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colour.Chip, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  itemWords: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colour.Ink },
  itemMeta: { fontSize: 12, color: colour.Grey, marginTop: 2 },
  foot: { fontSize: 11, color: colour.Grey, textAlign: 'center', marginTop: 22 },
  composer: { marginTop: 18 },
  input: { borderRadius: 14, backgroundColor: colour.Chip, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colour.Ink },
  inputText: { minHeight: 88, textAlignVertical: 'top' },
  composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  cancel: { fontSize: 15, color: colour.Grey },
  add: { minWidth: 88, height: 40, borderRadius: 20, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colour.Lime },
  addText: { fontSize: 16, fontWeight: '600', color: colour.Ink },
  addBig: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: colour.Lime, marginTop: 14 },
  rolePreview: { height: 160, borderRadius: 16, marginTop: 18, backgroundColor: colour.Shimmer },
  role: { borderRadius: 16, backgroundColor: colour.Chip, padding: 14, marginTop: 12, borderWidth: 2, borderColor: 'transparent' },
  roleOn: { borderColor: colour.Ink },
  roleTitle: { fontSize: 16, fontWeight: '600', color: colour.Ink },
  roleLine: { fontSize: 13, color: colour.Grey, marginTop: 6 },
  both: { height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#E6E6E6', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  bothText: { fontSize: 15, fontWeight: '600', color: colour.Ink },
  roleFoot: { fontSize: 11, color: colour.Grey, textAlign: 'center', marginTop: 12 },
  adding: { fontSize: 11, fontWeight: '600', color: colour.Grey, letterSpacing: 0.5, marginTop: 8 },
  listening: { fontSize: 22, fontWeight: '500', color: colour.Ink, marginTop: 12, lineHeight: 30 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 20 },
  wave: { flex: 1, overflow: 'hidden' },
  stop: { width: 60, height: 60, borderRadius: 30, backgroundColor: colour.Lime, alignItems: 'center', justifyContent: 'center' },
  stopGlyph: { width: 12, height: 12, borderRadius: 2, backgroundColor: colour.Ink },
  voiceFoot: { fontSize: 11, color: colour.Grey, marginTop: 20 },
})
