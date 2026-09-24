// apps/mobile/app/explore.tsx
// Explore (P22). Search your ideas (title and gist); Ideas for you — her own projects and threads as tiles, the
// most recently active first; Rising — from other creators, a placeholder until the pilot cohort exists (P12's
// feed is the same thing, scoped to a project). The floating trio as on Home; its Explore button focuses search.
// Typing swaps the sections for results in Home's masonry. No blank state (rule 1): before her first idea there's
// nothing to explore, so the screen is the record prompt.
// Left out of the frame: the camera in the search field (search by picture) — nothing does that yet.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useAudioPlayer } from 'expo-audio'
import { useSupabase } from '@/lib/supabase'
import { masonry, metaLine, type CardItem, type Item, type Project } from '@/lib/home'
import { blockColour, loadForYou, searchIdeas, type ForYou } from '@/lib/explore'
import { Tile, TILE_WIDTH } from '@/components/Tile'
import { FloatingTrio } from '@/components/HomeChrome'
import { hero, text } from '@/lib/theme'

const SEARCH_WAIT_MS = 250

type Found = { q: string; ideas: CardItem[]; failed: boolean }

export default function Explore() {
  const supabase = useSupabase()
  const insets = useSafeAreaInsets()
  const input = useRef<TextInput>(null)
  const [data, setData] = useState<{ forYou: ForYou[]; projects: Project[]; anyIdeas: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Found | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const player = useAudioPlayer(null)

  useFocusEffect(
    useCallback(() => {
      loadForYou(supabase)
        .then((d) => {
          setData(d)
          setError(null)
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
    }, [supabase])
  )

  // Search as she types, once she pauses; a slower earlier answer never replaces a newer one.
  useEffect(() => {
    const term = q.trim()
    // Nothing to clear when the field empties: results show only while they match what's typed (Results).
    if (!term) return
    let stale = false
    const t = setTimeout(() => {
      searchIdeas(supabase, term)
        .then((ideas) => {
          if (stale) return
          setResults({ q: term, ideas, failed: false })
          setError(null)
        })
        .catch((e) => {
          if (stale) return
          setResults({ q: term, ideas: [], failed: true })
          setError(e instanceof Error ? e.message : 'Search didn’t work')
        })
    }, SEARCH_WAIT_MS)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, supabase])

  async function play(item: Item) {
    if (item.kind !== 'card' || !item.storagePath) return
    if (playing === item.id) {
      player.pause()
      return setPlaying(null)
    }
    const { data: url } = await supabase.storage.from('recordings').createSignedUrl(item.storagePath, 3600)
    if (!url) return
    player.replace({ uri: url.signedUrl })
    await player.seekTo(item.playFromMs / 1000)
    player.play()
    setPlaying(item.id)
  }

  const trio = (
    <FloatingTrio onHome={() => router.dismissTo('/')} onRecord={() => router.push('/record')} onExplore={() => input.current?.focus()} />
  )

  if (!data) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {error ? <Text style={[text.body, styles.secondary]}>{error}</Text> : <ActivityIndicator color={hero.ink} />}
      </View>
    )
  }

  if (!data.anyIdeas) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.coldTitle}>Tell Ivy an idea</Text>
        <Text style={[text.body, styles.secondary, { marginTop: 8, textAlign: 'center' }]}>Once there are a few, they’re here to search and come back to.</Text>
        <Pressable onPress={() => router.push('/record')} style={styles.coldMic} accessibilityRole="button" accessibilityLabel="Record">
          <SymbolView name="mic" tintColor={hero.ink} size={30} />
        </Pressable>
        <Pressable onPress={() => router.dismissTo('/')} style={[styles.coldBack, { top: insets.top + 14 }]} hitSlop={10} accessibilityRole="button" accessibilityLabel="Home">
          <SymbolView name="chevron.left" tintColor={hero.ink} size={20} weight="semibold" />
        </Pressable>
      </View>
    )
  }

  const searching = q.trim().length > 0

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingTop: insets.top + 18, paddingBottom: insets.bottom + 120 }}>
        <View style={styles.search}>
          <SymbolView name="magnifyingglass" tintColor={hero.ink} size={18} />
          <TextInput
            ref={input}
            value={q}
            onChangeText={setQ}
            placeholder="Search your ideas"
            placeholderTextColor={hero.secondary}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="never"
            accessibilityLabel="Search your ideas"
          />
          {searching && (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <SymbolView name="xmark.circle.fill" tintColor={hero.secondary} size={18} />
            </Pressable>
          )}
        </View>
        {error && <Text style={[text.caption, styles.secondary, styles.error]}>{error}</Text>}

        {searching ? (
          <Results results={results} q={q.trim()} projects={data.projects} playing={playing} onPlay={play} />
        ) : (
          <>
            {data.forYou.length > 0 && (
              <>
                <Text style={styles.section}>Ideas for you</Text>
                <View style={styles.grid}>
                  {data.forYou.map((f) => (
                    <BigTile key={`${f.kind}:${f.id}`} title={f.title} frameUrl={f.frameUrl} colour={blockColour(f.id)} onPress={() => router.push(f.kind === 'project' ? `/project/${f.openId}` : `/idea/${f.openId}`)} />
                  ))}
                </View>
              </>
            )}

            <Text style={styles.section}>Rising — from other creators</Text>
            <View style={styles.rising}>
              <Text style={styles.risingText}>When the pilot creators start sharing, the ideas and formats others are remixing will rise here.</Text>
            </View>
          </>
        )}
      </ScrollView>
      {trio}
    </View>
  )
}

function Results({
  results,
  q,
  projects,
  playing,
  onPlay,
}: {
  results: Found | null
  q: string
  projects: Project[]
  playing: string | null
  onPlay: (item: Item) => void
}) {
  if (!results || results.q !== q) return <ActivityIndicator color={hero.ink} style={{ marginTop: 40 }} />
  if (results.failed) return null // the error line above says why
  if (results.ideas.length === 0) {
    return <Text style={[text.body, styles.secondary, styles.none]}>None of your ideas mention “{q}”.</Text>
  }
  const [left, right] = masonry(results.ideas)
  return (
    <View style={[styles.columns, { marginTop: 20 }]}>
      {[left, right].map((col, c) => (
        <View key={c} style={{ width: TILE_WIDTH }}>
          {col.map((item) => (
            <Tile key={item.id} item={item} meta={metaLine(item, projects)} playing={playing === item.id} onPlay={onPlay} onOpen={(i) => router.push(`/idea/${i.id}`)} />
          ))}
        </View>
      ))}
    </View>
  )
}

/** Explore's tile: the frame (or its colour block), darkened, with the name set large and white in the middle. */
function BigTile({ title, frameUrl, colour, onPress }: { title: string; frameUrl: string | null; colour: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.big, { backgroundColor: colour }]} accessibilityRole="button" accessibilityLabel={title}>
      {frameUrl && (
        <>
          <Image source={{ uri: frameUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={[StyleSheet.absoluteFill, styles.darken]} />
        </>
      )}
      <Text style={styles.bigTitle} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  )
}

// Figma 90:2 — search field 365 × 44 at 14 pt margins, 1-pt ink outline, radius 22, icon 20, Regular 15; section
// heads Semibold 17, centred; tiles 180 × 92, radius 16, 5 apart across and 8 down, name Bold 18 white, centred.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  secondary: { color: hero.secondary },
  search: {
    marginHorizontal: 14,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: hero.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, fontSize: 15, color: hero.ink, paddingVertical: 0 },
  error: { marginHorizontal: 20, marginTop: 8 },
  section: { fontSize: 17, fontWeight: '600', color: hero.ink, textAlign: 'center', marginTop: 24, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, columnGap: 5, rowGap: 8 },
  big: { width: 180, height: 92, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  darken: { backgroundColor: 'rgba(0,0,0,0.45)' },
  bigTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', textAlign: 'center', lineHeight: 23, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  rising: { marginHorizontal: 14, borderRadius: 16, backgroundColor: hero.fill, padding: 18 },
  risingText: { fontSize: 15, lineHeight: 21, color: hero.secondary, textAlign: 'center' },
  columns: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  none: { textAlign: 'center', marginTop: 40, paddingHorizontal: 32 },
  coldTitle: { fontSize: 22, fontWeight: '700', color: hero.ink, textAlign: 'center' },
  coldMic: { marginTop: 48, width: 84, height: 84, borderRadius: 42, backgroundColor: hero.lime, alignItems: 'center', justifyContent: 'center' },
  coldBack: { position: 'absolute', left: 20 },
})
