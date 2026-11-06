// apps/mobile/app/inspiration/index.tsx
// The Ivy library test screen (inspiration demo) — hidden: a long-press on the IVY wordmark on Home opens it; nothing
// else links here. A search field with a mic, the people filter, and the library's masonry (components/
// InspirationTile.tsx): clips play muted, every tile is cropped portrait-first to 4:5. It opens on the newest, so the
// first thing on screen is pictures, never an empty list. With the server's flag off it says so and shows nothing.
//
// The mic records until she taps it again (or MIC_MAX_MS), sends the clip to /api/inspiration/listen, and searches
// what was heard. The clip is a query, not a recording: it's sent once and kept nowhere.

import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import * as Haptics from 'expo-haptics'
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio'
import { useAuth } from '@clerk/clerk-expo'
import { colour, space } from '@ivywolf/ui'
import { LibraryOff, listen, searchLibrary, type InspirationItem, type People } from '@/lib/inspiration'
import { LibraryGrid } from '@/components/InspirationTile'
import { useTileWidth } from '@/components/Tile'
import { hero, text } from '@/lib/theme'

const SEARCH_WAIT_MS = 250
const MIC_MAX_MS = 8000
const FILTERS: { people: People | null; label: string }[] = [
  { people: null, label: 'All' },
  { people: 'none', label: 'No people' },
  { people: 'hands', label: 'Hands' },
  { people: 'person', label: 'People' },
]

type Found = { key: string; items: InspirationItem[] } | { key: string; off: true } | { key: string; failed: string }

export default function LibraryScreen() {
  const insets = useSafeAreaInsets()
  const tileWidth = useTileWidth()
  const { getToken } = useAuth()
  // Clerk hands out a new getToken every render (see the idea page): read it from a ref.
  const tokenRef = useRef(getToken)
  tokenRef.current = getToken
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<People | null>(null)
  const [found, setFound] = useState<Found | null>(null)
  const [mic, setMic] = useState<'idle' | 'listening' | 'hearing'>('idle')
  const [micError, setMicError] = useState<string | null>(null)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const micTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const key = `${people ?? 'all'}|${q.trim()}`

  // Search once she pauses; a slower earlier answer never replaces a newer one. Empty words show the newest.
  useEffect(() => {
    let stale = false
    const t = setTimeout(async () => {
      try {
        const token = await tokenRef.current()
        if (!token) return
        const items = await searchLibrary(token, q.trim(), { people: people ?? undefined })
        if (!stale) setFound({ key, items })
      } catch (e) {
        if (stale) return
        setFound(e instanceof LibraryOff ? { key, off: true } : { key, failed: e instanceof Error ? e.message : 'Search didn’t work' })
      }
    }, q.trim() ? SEARCH_WAIT_MS : 0)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [key, q, people])

  // Leaving with the mic open stops it.
  useEffect(
    () => () => {
      if (micTimer.current) clearTimeout(micTimer.current)
      if (recorder.isRecording) recorder.stop().catch(() => {})
      setAudioModeAsync({ allowsRecording: false }).catch(() => {})
    },
    [recorder]
  )

  async function startMic() {
    setMicError(null)
    const { granted } = await requestRecordingPermissionsAsync()
    if (!granted) return setMicError('Ivy needs the microphone — Settings › Ivy Wolf › Microphone.')
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      setMic('listening')
      micTimer.current = setTimeout(stopMic, MIC_MAX_MS)
    } catch (e) {
      setMicError(e instanceof Error ? e.message : 'The mic didn’t start')
      setMic('idle')
    }
  }

  async function stopMic() {
    if (micTimer.current) clearTimeout(micTimer.current)
    micTimer.current = null
    if (!recorder.isRecording) return
    setMic('hearing')
    try {
      await recorder.stop()
      await setAudioModeAsync({ allowsRecording: false })
      const token = await tokenRef.current()
      const heard = recorder.uri && token ? await listen(token, recorder.uri) : ''
      if (heard) setQ(heard)
      else setMicError('Didn’t catch that — try again.')
    } catch (e) {
      setMicError(e instanceof LibraryOff ? 'The Ivy library is off.' : e instanceof Error ? e.message : 'Couldn’t hear that')
    } finally {
      setMic('idle')
    }
  }

  const current = found && found.key === key ? found : null

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      >
        <View style={styles.bar}>
          <View style={styles.search}>
            <SymbolView name="magnifyingglass" tintColor={hero.ink} size={18} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={mic === 'listening' ? 'Listening…' : mic === 'hearing' ? 'Writing it down…' : 'Search the Ivy library'}
              placeholderTextColor={hero.secondary}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              editable={mic === 'idle'}
              accessibilityLabel="Search the Ivy library"
              testID="library-search"
            />
            {q.length > 0 && mic === 'idle' && (
              <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <SymbolView name="xmark.circle.fill" tintColor={hero.secondary} size={18} />
              </Pressable>
            )}
            <Pressable
              onPress={mic === 'listening' ? stopMic : startMic}
              disabled={mic === 'hearing'}
              hitSlop={10}
              style={[styles.mic, mic === 'listening' && styles.micOn]}
              accessibilityRole="button"
              accessibilityLabel={mic === 'listening' ? 'Stop and search' : 'Search by voice'}
              testID="library-mic"
            >
              {mic === 'hearing' ? <ActivityIndicator size="small" color={hero.ink} /> : <SymbolView name={mic === 'listening' ? 'stop.fill' : 'mic'} tintColor={hero.ink} size={16} />}
            </Pressable>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
            <Text style={text.body}>Done</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((f) => (
            <Pressable
              key={f.label}
              onPress={() => setPeople(f.people)}
              style={[styles.chip, people === f.people && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: people === f.people }}
            >
              <Text style={[styles.chipText, people === f.people && styles.chipTextOn]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {micError && <Text style={[text.caption, styles.secondary, styles.note]}>{micError}</Text>}
        <View style={styles.results}>
          {!current ? (
            <ActivityIndicator color={hero.ink} style={styles.spinner} />
          ) : 'off' in current ? (
            <Text style={[text.body, styles.secondary, styles.none]}>The Ivy library is off.</Text>
          ) : 'failed' in current ? (
            <Text style={[text.body, styles.secondary, styles.none]}>{current.failed}</Text>
          ) : current.items.length === 0 ? (
            <Text style={[text.body, styles.secondary, styles.none]}>Nothing in the library for “{q.trim()}”.</Text>
          ) : (
            <LibraryGrid items={current.items} tileWidth={tileWidth} />
          )}
        </View>
      </ScrollView>
    </View>
  )
}

// The field is Search's (Figma 90:2: 44 high, 1-pt ink outline, radius 22, Regular 15), with a 28 mic disc inside.
const MIC = 28
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  secondary: { color: hero.secondary },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 14 },
  search: { flex: 1, height: 44, borderRadius: 22, borderWidth: 1, borderColor: hero.ink, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: hero.ink, paddingVertical: 0 },
  mic: { width: MIC, height: MIC, borderRadius: MIC / 2, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: colour.Lime },
  chips: { gap: 8, paddingHorizontal: space.margin, paddingTop: 14 },
  chip: { height: 32, borderRadius: 16, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: colour.Chip },
  chipOn: { backgroundColor: colour.Ink },
  chipText: { fontSize: 13, color: colour.Ink },
  chipTextOn: { color: colour.Surface },
  note: { marginHorizontal: 20, marginTop: 10 },
  results: { paddingHorizontal: space.margin, marginTop: 16 },
  spinner: { marginTop: 40 },
  none: { textAlign: 'center', marginTop: 40, paddingHorizontal: 32 },
})
