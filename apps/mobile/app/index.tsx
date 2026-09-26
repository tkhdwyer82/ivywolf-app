// apps/mobile/app/index.tsx
// Home (P1). Cards and to-dos in a two-column masonry, newest first, with a divider per local day; project chips
// filter it, except My things, which opens its room (P4); the header has search and the avatar (Voice notes); the
// nav trio is Home · ⊕ · Mini (launch UI 170:5, 145:5).
// No blank state (rule 1): before the first card exists Home is First open (L1, 170:5) — Ivy's one line, "Say an
// idea out loud.", and a lime arrow down to the ⊕. No grid, no setup.
// Ivy on open: up to three sentences from the graph, written in above the chips, gone after 8 s or on scroll.
// While a recording is being processed, or a frame is on its way, Home re-polls so the card and its frame appear
// on their own.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
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
import { ProjectChips } from '@/components/HomeChrome'
import { Nav } from '@/components/Nav'
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

  // Cold start: no card yet → First open (L1).
  if (!data.items.some((i) => i.kind === 'card')) {
    return <FirstOpen writing={data.inFlight > 0} failed={failed} />
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
        <Header />

        {ivy && ivy.length > 0 && <IvyNote sentences={ivy} dissolve={dissolve} onGone={() => setIvy([])} />}

        <ProjectChips projects={chips} selected={project} onSelect={(id) => (chips.find((p) => p.id === id)?.kind === 'things' ? router.push('/things') : setProject(id))} onCreate={createProject} />

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
                          onOpen={(i) => router.push(i.kind === 'card' ? `/idea/${i.id}` : `/todo/${i.id}`)}
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

      <Nav room="home" listening={data.inFlight > 0} onHome={() => scroll.current?.scrollTo({ y: 0, animated: true })} />
    </View>
  )
}

/** Wordmark, then search and the avatar (Voice notes). No + — adding lives on the ⊕'s long-press. */
function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.wordmark}>
        Ivy <Text style={{ color: hero.secondary }}>Wolf</Text>
      </Text>
      <View style={styles.headerActions}>
        <Pressable onPress={() => router.push('/search')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Search">
          <Image source={require('@/assets/figma/l1-search.svg')} style={styles.search} />
        </Pressable>
        <Pressable onPress={() => router.push('/notes')} style={styles.avatar} accessibilityRole="button" accessibilityLabel="Voice notes">
          <Image source={require('@/assets/figma/l1-profile.svg')} style={StyleSheet.absoluteFill} />
          <Image source={require('@/assets/figma/l1-profile-glyph.svg')} style={styles.avatarGlyph} />
        </Pressable>
      </View>
    </View>
  )
}

// Not from the graph (there is none yet), so no cite: the one line Ivy says before the first card.
const FIRST_LINE: IvySentence[] = [{ text: 'Tap the lime mic and talk. Ideas land here; errands go to My things.', cites: [] }]

/**
 * First open (L1). Ivy's one line, the instruction, and a lime arrow down to the ⊕ — nothing to set up, no empty
 * grid. Positions follow the 393 × 852 frame: headline at 330, arrow 660–720 over the nav at 756. Once the first take
 * is in (writing), the arrow goes and the ⊕ shows its listening halo until the card lands.
 */
function FirstOpen({ writing, failed }: { writing: boolean; failed: ReactNode }) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  return (
    <View style={styles.screen}>
      <View style={{ paddingTop: insets.top }}>
        <Header />
        <IvyNote sentences={FIRST_LINE} dissolve={false} onGone={() => {}} />
        {failed}
      </View>
      <View style={[styles.firstHero, { top: (height * 330) / 852 }]}>
        <Text style={styles.firstTitle}>{writing ? 'Ivy is writing it up.' : 'Say an idea out loud.'}</Text>
        <Text style={styles.firstBody}>
          {writing
            ? 'Your first card lands here in a moment, with a frame.'
            : 'In the car, on a walk, between takes. Ramble — Ivy writes it up, gives it a frame, and files the errands.'}
        </Text>
      </View>
      {!writing && <Image source={require('@/assets/figma/l1-arrow.svg')} style={styles.arrow} accessibilityElementsHidden />}
      <Nav room="home" listening={writing} />
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
  // Figma 170:128 / 170:103: search 22 at x 297, avatar 34 at x 339.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  search: { width: 22, height: 22 },
  avatar: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { width: 18, height: 18 },
  grid: { paddingHorizontal: 20, paddingTop: 16 },
  columns: { flexDirection: 'row', justifyContent: 'space-between' },
  column: { width: 170 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 14 },
  dividerLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, color: hero.secondary },
  dividerRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#E6E6E6' },
  // L1: headline SF Pro Bold 28 at y 330; body Regular 16 secondary, 330 wide, at 374; arrow 28 × 60 at y 660.
  firstHero: { position: 'absolute', left: 20, right: 20 },
  firstTitle: { fontSize: 28, fontWeight: '700', color: hero.ink },
  firstBody: { fontSize: 16, lineHeight: 19, color: hero.secondary, width: 330, marginTop: 10 },
  arrow: { position: 'absolute', bottom: 132, alignSelf: 'center', width: 28, height: 60 },
})
