// apps/mobile/app/index.tsx
// Home (P1). Cards and to-dos in a two-column masonry, newest first, with a divider per local day; project chips
// filter it, except My things, which opens its room (P4); the header has search and the avatar (Voice notes); the
// nav trio is Home · ⊕ · Mini (launch UI 170:5, 145:5).
// No blank state (rule 1): before the first card exists Home is First open (L1, 170:5) — Ivy's one line, "Say an
// idea out loud.", and a lime arrow down to the ⊕. No grid, no setup.
// Ivy on open (162:2): one line from the graph, only when something changed since her last look, written in above the
// chips with its cite; tap to hear that moment; gone after ~6 s or on scroll.
// While a recording is being processed, or a frame is on its way, Home re-polls so the card and its frame appear
// on their own.
// Job C+: pinned cards sit in a Pinned row above Today (and leave the days); hold any card for its arc (Like · Link
// ideas · Add context · Share; to-dos Done · Date · Share); Link ideas puts Home in link mode — the banner where
// Ivy's line was, a mark on every tile, Done in the nav's place.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { SymbolView } from 'expo-symbols'
import { useAuth } from '@clerk/clerk-expo'
import { useAudioPlayer } from 'expo-audio'
import { useSupabase } from '@/lib/supabase'
import { requestProcessing } from '@/lib/record'
import {
  retryRecording,
  type FailedRecording,
  groupByDay,
  type DayGroup,
  ivyOnOpen,
  loadHome,
  markSeen,
  metaLine,
  type HomeData,
  type Item,
  type IvySentence,
} from '@/lib/home'
import { colour, space, size, type } from '@ivywolf/ui'
import { IvyNote } from '@/components/IvyNote'
import { Tile } from '@/components/Tile'
import { ProjectChips } from '@/components/HomeChrome'
import { Nav } from '@/components/Nav'
import { BAR_BOTTOM } from '@/components/ActionBar'
import { FailedRecordings } from '@/components/FailedRecordings'
import { deleteRecording } from '@/lib/deleteRecording'
import { Hold, HoldProvider, useHolding } from '@/components/HoldArc'
import { useCardActions } from '@/components/CardActions'
import { LinkBanner } from '@/components/LinkMode'
import { PinnedRow, pinnedOf } from '@/components/PinnedRow'

const POLL_MS = 4000
const FRAME_WAIT_MS = 5 * 60 * 1000 // keep polling for a frame this long after a card lands

export default function Home() {
  return (
    <HoldProvider>
      <HomeScreen />
    </HoldProvider>
  )
}

function HomeScreen() {
  const supabase = useSupabase()
  const holding = useHolding()
  const { userId, getToken } = useAuth()
  const asked = useRef(new Set<string>())
  const insets = useSafeAreaInsets()
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<string | null>(null)
  const [ivy, setIvy] = useState<IvySentence[] | null>(null)
  const [dissolve, setDissolve] = useState(false)
  const list = useRef<FlashListRef<Row>>(null)
  // A quote's ▶ chip (Figma 227:28) and Ivy's line (162:2) play from where it was said, without leaving Home.
  const player = useAudioPlayer(null)
  const [playing, setPlaying] = useState<string | null>(null)

  async function play(key: string, storagePath: string | null, ms: number) {
    if (!storagePath) return
    if (playing === key) {
      player.pause()
      return setPlaying(null)
    }
    const { data: signed } = await supabase.storage.from('recordings').createSignedUrl(storagePath, 3600)
    if (!signed) return
    player.replace({ uri: signed.signedUrl })
    await player.seekTo(ms / 1000)
    player.play()
    setPlaying(key)
  }

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

  // Ivy on open: composed once, from the first load Home is actually on screen for (not mounted under the recorder
  // from a deep link). Her last look then moves to the newest card she has had on screen, and keeps up while she's
  // here — a card landing in front of her isn't news next time.
  const [focused, setFocused] = useState(false)
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, [])
  )
  useEffect(() => {
    if (!data || !focused || !userId) return
    if (ivy === null) setIvy(ivyOnOpen(data))
    markSeen(supabase, userId, data.items).catch(() => {})
  }, [data, focused, ivy, supabase, userId])

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
  const pinned = useMemo(() => pinnedOf(visible), [visible])
  const rows = useMemo(() => toRows(groupByDay(visible.filter((i) => i.kind !== 'card' || !i.pinnedAt))), [visible])
  const actions = useCardActions({
    links: data?.links,
    reload: load,
    findCard: (id) => data?.items.find((i) => i.kind === 'card' && i.id === id) as never,
  })
  const linking = actions.linking

  // An idea's ••• → Link ideas (My things, Ivy Mini): link mode from that idea, once Home has it.
  const { linkFrom } = useLocalSearchParams<{ linkFrom?: string }>()
  const startedFrom = useRef<string | null>(null)
  useEffect(() => {
    if (!linkFrom || !data || startedFrom.current === linkFrom) return
    const from = data.items.find((i) => i.kind === 'card' && i.id === linkFrom)
    if (from && from.kind === 'card') {
      startedFrom.current = linkFrom
      setProject(null)
      actions.startLinking(from)
    }
  }, [linkFrom, data, actions])

  /** One tile on Home: holdable, and in link mode a mark over it that a tap toggles. */
  const tile = (item: Item, width?: number, inPinned?: boolean) => {
    const meta = item.kind === 'action' && data ? metaLine(item, data.projects) : undefined
    const open = linking
      ? actions.toggleLink
      : (i: Item) => router.push(i.kind === 'card' ? `/idea/${i.id}` : `/todo/${i.id}`)
    return (
      <Hold
        actions={() => actions.actionsFor(item)}
        face={() => <Tile item={item} meta={meta} pinned={inPinned} />}
        viewRef={actions.viewRef(item.id)}
        disabled={!!linking}
      >
        {(onLongPress) => (
          <Tile
            item={item}
            meta={meta}
            width={width}
            onOpen={open}
            onLongPress={onLongPress}
            mark={actions.markFor(item)}
            pinned={inPinned}
            playing={playing === item.id}
            onPlay={(i) => i.kind === 'card' && play(i.id, i.storagePath, i.playFromMs)}
          />
        )}
      </Hold>
    )
  }
  // Ivy Mini appears as a chip once it has something in it.
  const chips = useMemo(
    () => (data ? data.projects.filter((p) => p.kind !== 'mini' || data.items.some((i) => i.projectId === p.id)) : []),
    [data]
  )

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
        {error ? <Text style={[type['Body'], styles.secondary]}>{error}</Text> : <ActivityIndicator color={colour.Ink} />}
      </View>
    )
  }

  // Cold start: no card yet → First open (L1).
  if (!data.items.some((i) => i.kind === 'card')) {
    return <FirstOpen writing={data.inFlight > 0} failed={failed} />
  }

  return (
    <View style={styles.screen}>
      <FlashList
        ref={list}
        data={rows}
        extraData={[playing, linking]}
        scrollEnabled={!holding}
        onScroll={linking ? actions.remeasure : undefined}
        scrollEventThrottle={16}
        masonry
        numColumns={2}
        keyExtractor={(r) => r.key}
        getItemType={(r) => (r.kind === 'day' ? 'day' : r.item.kind)}
        overrideItemLayout={(layout, r) => {
          if (r.kind === 'day') layout.span = 2
        }}
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingHorizontal: space.margin - space.gutter / 2,
          paddingBottom: BAR_BOTTOM + size['bar-h'] + space.section,
        }}
        onScrollBeginDrag={() => setDissolve(true)}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Header />
            {linking ? (
              <LinkBanner title={linking.from.title} />
            ) : (
              ivy && ivy.length > 0 && <IvyNote sentences={ivy} dissolve={dissolve} onGone={() => setIvy([])} onPlay={(c) => play('ivy', c.storagePath, c.ms)} />
            )}
            <ProjectChips projects={chips} selected={project} onSelect={(id) => (chips.find((p) => p.id === id)?.kind === 'things' ? router.push('/things') : setProject(id))} />
            {error && <Text style={[type['Body / Small'], styles.error]}>{error}</Text>}
            {failed}
            <PinnedRow cards={pinned} render={(c, w) => tile(c, w, true)} />
          </View>
        }
        renderItem={({ item: r }) =>
          r.kind === 'day' ? (
            <Text style={styles.divider}>{r.label}</Text>
          ) : (
            <View style={styles.cell}>{tile(r.item)}</View>
          )
        }
      />

      {actions.layer(<Nav room="home" listening={data.inFlight > 0} onHome={() => list.current?.scrollToOffset({ offset: 0, animated: true })} />)}
    </View>
  )
}

/** Home's list: each day's overline across both columns, then its tiles in the masonry, newest first. */
type Row = { kind: 'day'; key: string; label: string } | { kind: 'tile'; key: string; item: Item }
function toRows(groups: DayGroup[]): Row[] {
  return groups.flatMap((g) => [
    ...(g.label ? [{ kind: 'day' as const, key: `day-${g.day}`, label: g.label }] : []),
    ...g.items.map((item) => ({ kind: 'tile' as const, key: item.id, item })),
  ])
}

/** Wordmark, then search and the avatar (Voice notes). No + — adding lives on the ⊕'s long-press. */
function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.wordmark} accessibilityRole="header">
        Ivy <Text style={styles.wordmarkSoft}>Wolf</Text>
      </Text>
      <View style={styles.headerActions}>
        <Pressable onPress={() => router.push('/search')} hitSlop={TAP_SLOP} accessibilityRole="button" accessibilityLabel="Search">
          <SymbolView name="magnifyingglass" tintColor={colour.Ink} size={size.icon} />
        </Pressable>
        <Pressable onPress={() => router.push('/notes')} hitSlop={TAP_SLOP} style={styles.avatar} accessibilityRole="button" accessibilityLabel="Voice notes">
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
      <View style={[styles.firstHero, { top: (height * L1.heroTop) / L1.frame }]}>
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

// Home (Figma 227:5) — measured, not tokens: the wordmark "Ivy Wolf" is Bold 26 (no text style), Wolf in grey; the day overline sits 10
// above its tiles. First open (L1, 170:5) keeps its own frame: headline Bold 28 at y 330, body Regular 16 at 374,
// arrow 28 × 60 at y 660.
const WORDMARK = 26
const OVERLINE_GAP = 10
const TAP_SLOP = (size.tap - size.icon) / 2
const L1 = { frame: 852, heroTop: 330, title: 28, body: 16, bodyLine: 19, bodyWidth: 330, bodyGap: 10, arrowBottom: 132, arrowW: 28, arrowH: 60 }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.margin },
  secondary: { color: colour.Grey, textAlign: 'center' },
  error: { color: colour.Grey, paddingHorizontal: space.margin, paddingTop: space.gutter },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.margin },
  wordmark: { ...type['Title / Screen'], fontSize: WORDMARK, lineHeight: undefined, letterSpacing: 0 },
  wordmarkSoft: { color: colour.Grey },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.stack },
  avatar: { width: size.icon, height: size.icon, alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { width: size.icon / 2, height: size.icon / 2 },
  // The list is inset by margin − gutter/2 and every cell pads gutter/2, so tiles sit at the margin, a gutter apart;
  // the header undoes the inset.
  listHeader: { marginHorizontal: -(space.margin - space.gutter / 2), paddingBottom: space.section - space.stack },
  cell: { paddingHorizontal: space.gutter / 2, paddingBottom: space.gutter },
  divider: { ...type['Label / Overline'], color: colour.Grey, textTransform: 'uppercase', marginHorizontal: space.gutter / 2, marginTop: space.stack, marginBottom: OVERLINE_GAP },
  firstHero: { position: 'absolute', left: space.margin, right: space.margin },
  firstTitle: { fontSize: L1.title, fontWeight: '700', color: colour.Ink },
  firstBody: { fontSize: L1.body, lineHeight: L1.bodyLine, color: colour.Grey, width: L1.bodyWidth, marginTop: L1.bodyGap },
  arrow: { position: 'absolute', bottom: L1.arrowBottom, alignSelf: 'center', width: L1.arrowW, height: L1.arrowH },
})
