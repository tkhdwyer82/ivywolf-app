// apps/mobile/app/index.tsx
// Home (P1). Cards and to-dos in a two-column masonry, newest first, with a divider per local day; project chips
// filter it; the avatar opens Voice notes; the floating trio is Home · ⊕ · Explore.
// No blank state (rule 1): before the first card exists the whole screen is one record prompt.
// Ivy on open: up to three sentences from the graph, written in above the chips, gone after 8 s or on scroll.
// While a recording is being processed, or a frame is on its way, Home re-polls so the card and its frame appear
// on their own.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useAudioPlayer } from 'expo-audio'
import { useAuth } from '@clerk/clerk-expo'
import { useSupabase } from '@/lib/supabase'
import { requestProcessing } from '@/lib/record'
import {
  retryRecording,
  type FailedRecording,
  groupByDay,
  ivyOnOpen,
  loadHome,
  markOpened,
  masonry,
  metaLine,
  type HomeData,
  type Item,
  type IvySentence,
} from '@/lib/home'
import { hero, text } from '@/lib/theme'
import { IvyNote } from '@/components/IvyNote'
import { Tile } from '@/components/Tile'
import { FloatingTrio, ProjectChips } from '@/components/HomeChrome'
import { FailedRecordings } from '@/components/FailedRecordings'
import { deleteRecording } from '@/lib/deleteRecording'

const POLL_MS = 4000
const FRAME_WAIT_MS = 5 * 60 * 1000 // keep polling for a frame this long after a card lands

export default function Home() {
  const supabase = useSupabase()
  const { userId, getToken } = useAuth()
  const asked = useRef(new Set<string>())
  const insets = useSafeAreaInsets()
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<string | null>(null)
  const [ivy, setIvy] = useState<IvySentence[] | null>(null)
  const [dissolve, setDissolve] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const scroll = useRef<ScrollView>(null)
  const player = useAudioPlayer(null)

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setData(await loadHome(supabase, userId))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load')
    }
  }, [supabase, userId])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  // Ivy on open: composed once, from the first load, then "new" is measured from now.
  useEffect(() => {
    if (!data || ivy !== null || !userId) return
    setIvy(data.items.some((i) => i.kind === 'card') ? ivyOnOpen(data) : [])
    markOpened(supabase, userId)
  }, [data, ivy, supabase, userId])

  // A recording whose process request never arrived (server down, no signal): ask again, once per open.
  useEffect(() => {
    const again = (data?.stuck ?? []).filter((id) => !asked.current.has(id))
    if (!again.length) return
    again.forEach((id) => asked.current.add(id))
    getToken().then((token) => {
      if (token) again.forEach((id) => requestProcessing(id, token).catch(() => asked.current.delete(id)))
    })
  }, [data, getToken])

  const waiting = useMemo(() => {
    if (!data) return false
    const recent = Date.now() - FRAME_WAIT_MS
    return (
      data.inFlight > 0 ||
      data.items.some((i) => (i.frameStatus === 'none' || i.frameStatus === 'queued') && new Date(i.at).getTime() > recent)
    )
  }, [data])
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [waiting, load])

  const visible = useMemo(
    () => (data ? data.items.filter((i) => project === null || i.projectId === project) : []),
    [data, project]
  )
  const groups = useMemo(() => groupByDay(visible), [visible])
  // Ivy Mini appears as a chip once it has something in it.
  const chips = useMemo(
    () => (data ? data.projects.filter((p) => p.kind !== 'mini' || data.items.some((i) => i.projectId === p.id)) : []),
    [data]
  )

  async function play(item: Item) {
    if (item.kind !== 'card' || !item.storagePath) return
    if (playing === item.id) {
      player.pause()
      setPlaying(null)
      return
    }
    const { data: signed, error } = await supabase.storage.from('recordings').createSignedUrl(item.storagePath, 3600)
    if (error || !signed) return
    player.replace({ uri: signed.signedUrl })
    await player.seekTo(item.playFromMs / 1000)
    player.play()
    setPlaying(item.id)
  }

  async function createProject(name: string) {
    if (!userId) return
    const { data: row, error } = await supabase.from('projects').insert({ creator_id: userId, name }).select('id').single()
    if (error) setError(error.code === '23505' ? `You already have “${name}”.` : error.message)
    else {
      await load()
      setProject(row.id)
    }
  }

  async function retry(r: FailedRecording) {
    const token = await getToken()
    if (!token) return
    try {
      await retryRecording(supabase, r.id, token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t retry')
    }
    await load()
  }
  async function remove(r: FailedRecording) {
    try {
      await deleteRecording(supabase, r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t delete')
    }
    await load()
  }
  const failed = data ? <FailedRecordings items={data.failed} onRetry={retry} onDelete={remove} /> : null

  if (!data) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {error ? <Text style={[text.body, styles.secondary]}>{error}</Text> : <ActivityIndicator color={hero.ink} />}
      </View>
    )
  }

  // Cold start: no card yet → only the record prompt.
  if (!data.items.some((i) => i.kind === 'card')) {
    return <RecordPrompt listening={data.inFlight > 0} failed={failed} />
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroll}
        stickyHeaderIndices={[]}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 140 }}
        onScrollBeginDrag={() => setDissolve(true)}
        scrollEventThrottle={16}
      >
        <View style={styles.header}>
          <Text style={styles.wordmark}>
            Ivy <Text style={{ color: hero.secondary }}>Wolf</Text>
          </Text>
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push('/add')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Add to ideas">
              <SymbolView name="plus" tintColor={hero.ink} size={22} weight="regular" />
            </Pressable>
            <Pressable onPress={() => router.push('/notes')} style={styles.avatar} accessibilityRole="button" accessibilityLabel="Voice notes">
              <SymbolView name="person" tintColor={hero.ink} size={18} />
            </Pressable>
          </View>
        </View>

        {ivy && ivy.length > 0 && <IvyNote sentences={ivy} dissolve={dissolve} onGone={() => setIvy([])} />}

        <ProjectChips projects={chips} selected={project} onSelect={setProject} onCreate={createProject} />

        {error && <Text style={[text.bodySmall, styles.error]}>{error}</Text>}
        {failed}

        <View style={styles.grid}>
          {groups.map((g) => {
            const [left, right] = masonry(g.items)
            return (
              <View key={g.day}>
                {g.label && (
                  <View style={styles.divider}>
                    <Text style={styles.dividerLabel}>{g.label}</Text>
                    <View style={styles.dividerRule} />
                  </View>
                )}
                <View style={styles.columns}>
                  {[left, right].map((col, c) => (
                    <View key={c} style={styles.column}>
                      {col.map((item) => (
                        <Tile
                          key={item.id}
                          item={item}
                          meta={metaLine(item, data.projects)}
                          playing={playing === item.id}
                          onPlay={play}
                          onOpen={item.kind === 'card' ? (i) => router.push(`/idea/${i.id}`) : undefined}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            )
          })}
        </View>
      </ScrollView>

      <FloatingTrio
        onHome={() => scroll.current?.scrollTo({ y: 0, animated: true })}
        onRecord={() => router.push('/record')}
        onExplore={() => router.push('/explore')}
      />
    </View>
  )
}

/** Before the first card: one thing on screen, the mic. */
function RecordPrompt({ listening, failed }: { listening: boolean; failed: ReactNode }) {
  return (
    <View style={[styles.screen, styles.centered]}>
      <View style={styles.promptFailed}>{failed}</View>
      <Text style={[text.titleSection, styles.promptTitle]}>{listening ? 'Ivy is listening to it' : 'Tell Ivy an idea'}</Text>
      <Text style={[text.bodySmall, styles.secondary, styles.promptLine]}>
        {listening ? 'Your first card will be here in a moment.' : 'Say it the way you’d say it to a friend.'}
      </Text>
      {listening ? (
        <ActivityIndicator color={hero.ink} style={{ marginTop: 40 }} />
      ) : (
        <Pressable
          onPress={() => router.push('/record')}
          style={({ pressed }) => [styles.promptButton, pressed && { transform: [{ scale: 0.96 }] }]}
          accessibilityRole="button"
          accessibilityLabel="Record"
        >
          <SymbolView name="mic" tintColor={hero.ink} size={30} />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  secondary: { color: hero.secondary, textAlign: 'center' },
  error: { color: hero.secondary, paddingHorizontal: 20, paddingTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: -8 },
  // Figma: SF Pro Bold 34, −1 tracking; "Wolf" in secondary.
  wordmark: { fontSize: 34, fontWeight: '700', letterSpacing: -1, color: hero.ink },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: hero.ink, alignItems: 'center', justifyContent: 'center' },
  grid: { paddingHorizontal: 20, paddingTop: 16 },
  columns: { flexDirection: 'row', justifyContent: 'space-between' },
  column: { width: 170 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 14 },
  dividerLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, color: hero.secondary },
  dividerRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#E6E6E6' },
  promptTitle: { textAlign: 'center' },
  promptFailed: { position: 'absolute', top: 60, left: 0, right: 0 },
  promptLine: { marginTop: 10, width: 300 },
  promptButton: { marginTop: 48, width: 84, height: 84, borderRadius: 42, backgroundColor: hero.lime, alignItems: 'center', justifyContent: 'center' },
})
