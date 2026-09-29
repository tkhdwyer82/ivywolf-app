// apps/mobile/app/suggestion/[id].tsx
// Suggestion · open (P12c, Figma 201:69; spacing and type on the tokens, as the brief rules over P12c's own).
// Full-bleed visual with back and ×; "Near: <her card>"; the title; the cite line (how it did, whose, where); one
// "why it fits" line that cites her recording — tap it to hear her from there; two verbs, + Pin to <project> (lime)
// and Not for me; and Watch the original ↗, which opens the source in Safari's in-app view (never embedded).
// No prompt bar, no share, no shop. Opening it and playing the why are logged (suggestion_signals).

import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { SymbolView } from 'expo-symbols'
import { useAudioPlayer } from 'expo-audio'
import { useAuth } from '@clerk/clerk-expo'
import { colour, radius, space, type } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import { Glass } from '@/components/PinChrome'
import { Shimmer } from '@/components/Shimmer'
import { dismissSuggestion, loadSuggestion, logSignal, notePin, pinSuggestion, type OpenSuggestion } from '@/lib/suggestions'

// P12c (Figma 201:69) — measured, not tokens: the visual is 470 of an 852 frame; the heading starts 24 under it;
// the cite 6 under the heading, the why 10 under the cite; the verbs 52 tall, 190 : 150, 48 under the why; the
// footnote 20 under them; the Near chip's padding 8 × 4.
const VISUAL = 470 / 852
const HEADING_GAP = 24
const CITE_GAP = 6
const WHY_GAP = 10
const VERBS_GAP = 48
const VERB_H = 52
const PIN_FLEX = 190
const NOT_FLEX = 150
const FOOT_GAP = 20
const NEAR_PAD_H = 8
const NEAR_PAD_V = 4

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

/** "12× its channel average · @handle" — only what's known. */
function citeLine(s: OpenSuggestion): string {
  return [s.sourceScore ? `${Number(s.sourceScore.toFixed(1))}× its channel average` : null, s.sourceHandle].filter(Boolean).join(' · ')
}

export default function SuggestionOpen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const { userId } = useAuth()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [s, setS] = useState<OpenSuggestion | null | undefined>(undefined)
  const [busy, setBusy] = useState<'pin' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const player = useAudioPlayer(null)

  useEffect(() => {
    loadSuggestion(supabase, id).then(setS, (e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [supabase, id])
  useEffect(() => {
    if (s && userId) logSignal(supabase, userId, s.id, 'open').catch(() => {})
  }, [s?.id, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function playWhy() {
    if (!s?.whyRecording?.storagePath) return
    if (playing) {
      player.pause()
      return setPlaying(false)
    }
    const { data } = await supabase.storage.from('recordings').createSignedUrl(s.whyRecording.storagePath, 3600)
    if (!data) return
    player.replace({ uri: data.signedUrl })
    await player.seekTo((s.whyMs ?? 0) / 1000)
    player.play()
    setPlaying(true)
    if (userId) logSignal(supabase, userId, s.id, 'play_why').catch(() => {})
  }

  async function pin() {
    if (!s || busy) return
    setBusy('pin')
    try {
      await pinSuggestion(supabase, s.id)
      notePin(s)
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t pin')
      setBusy(null)
    }
  }

  async function notForMe() {
    if (!s || busy) return
    setBusy('dismiss')
    try {
      await dismissSuggestion(supabase, s.id)
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save')
      setBusy(null)
    }
  }

  async function original() {
    if (!s?.sourceUrl) return
    try {
      // Loaded on use: a build made before expo-web-browser was linked falls back to Safari.
      const WebBrowser = await import('expo-web-browser')
      await WebBrowser.openBrowserAsync(s.sourceUrl)
    } catch {
      await Linking.openURL(s.sourceUrl)
    }
  }

  if (!s) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {s === null || error ? <Text style={type['Body']}>{error ?? 'This suggestion has gone.'}</Text> : <ActivityIndicator color={colour.Ink} />}
      </View>
    )
  }

  const whyAt = s.whyRecording?.recordedAt && s.whyMs !== null ? `${DAYS[new Date(s.whyRecording.recordedAt).getDay()]} ${clock(s.whyMs)}` : null
  const open = s.status === 'shown'
  const cite = citeLine(s)

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.section }}>
        <View style={{ height: height * VISUAL }}>
          <Shimmer style={StyleSheet.absoluteFill} />
          {!!s.frameUrl && <Image source={{ uri: s.frameUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />}
          <Glass icon="chevron.left" label="Back" onPress={() => router.back()} style={{ left: space.margin, top: insets.top }} />
          <Glass icon="xmark" label="Close" onPress={() => router.back()} style={{ right: space.margin, top: insets.top }} />
          {s.near && (
            <View style={styles.nearRow} pointerEvents="none">
              <View style={styles.near}>
                <Text style={type['Label / Pill']} numberOfLines={1}>
                  Near: {s.near.title}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={type['Title / Section']}>{s.title}</Text>
          {!!cite && <Text style={[type['Caption'], styles.cite]}>{cite}</Text>}
          {!!s.why && (
            <Pressable
              onPress={playWhy}
              disabled={!s.whyRecording?.storagePath}
              style={styles.why}
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause' : 'Hear where you said it'}
            >
              <Text style={type['Body']}>
                Why it fits: {s.why}
                {whyAt && <Text style={{ color: colour.Grey }}> · {whyAt}</Text>}
              </Text>
            </Pressable>
          )}

          {open && (
            <View style={styles.verbs}>
              <Pressable
                onPress={pin}
                disabled={!!busy}
                style={({ pressed }) => [styles.verb, styles.pin, { flex: PIN_FLEX }, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                testID="pin"
              >
                {busy === 'pin' ? (
                  <ActivityIndicator color={colour.Ink} />
                ) : (
                  <Text style={type['Body / Medium']} numberOfLines={1}>
                    + Pin to {s.project?.name ?? 'My things'}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={notForMe}
                disabled={!!busy}
                style={({ pressed }) => [styles.verb, styles.not, { flex: NOT_FLEX }, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
                testID="not-for-me"
              >
                {busy === 'dismiss' ? <ActivityIndicator color={colour.Ink} /> : <Text style={type['Body / Medium']}>Not for me</Text>}
              </Pressable>
            </View>
          )}
          {error && <Text style={[type['Caption'], styles.cite]}>{error}</Text>}

          {!!s.sourceUrl && (
            <Pressable onPress={original} hitSlop={space.gutter} style={styles.foot} accessibilityRole="link">
              <Text style={type['Caption']}>
                Watch the original <SymbolView name="arrow.up.right" tintColor={colour.Grey} size={type['Caption'].fontSize} />
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space.margin },
  nearRow: { position: 'absolute', left: space.margin, right: space.margin, bottom: space.margin, alignItems: 'flex-start' },
  near: { borderRadius: radius.chip, paddingHorizontal: NEAR_PAD_H, paddingVertical: NEAR_PAD_V, backgroundColor: colour.Surface, maxWidth: '100%' },
  body: { paddingHorizontal: space.margin, paddingTop: HEADING_GAP },
  cite: { marginTop: CITE_GAP },
  why: { marginTop: WHY_GAP },
  verbs: { flexDirection: 'row', gap: space.gutter, marginTop: VERBS_GAP },
  verb: { height: VERB_H, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.stack },
  pin: { backgroundColor: colour.Lime },
  not: { backgroundColor: colour.Chip },
  foot: { marginTop: FOOT_GAP, alignSelf: 'flex-start' },
})
