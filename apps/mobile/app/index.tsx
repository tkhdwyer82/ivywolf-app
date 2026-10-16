// apps/mobile/app/index.tsx
// Home (P1; v4, Figma 1737:5 — visual first). Ideas in a two-column masonry, newest first, with a divider per local
// day; every idea is a picture (lib/picture.ts), and a filed one carries its project's name over it (B.5; tap the name
// for the project). To-dos aren't tiles: the header's My things entry opens their list. One Ivy direction tile a day
// sits among the ideas. An idea with links is a deck (1742:2): swipe it through its links, and its lines draw in each
// link's project hue. Project chips filter it — an idea appears under its own project and under every project it's
// linked into; all ink, the selected one underlined, no My things chip. The header has My things, search and the
// avatar (Voice notes); the nav is Home · Explore · ⊕ · Mini (1739:2–14). The header collapses Pinterest-style
// (components/CollapsingHeader.tsx): the logo row slides away on scroll-down and back on any scroll-up; the chips
// stay, under an always-opaque status bar.
// No blank state (rule 1): before the first card exists Home is First open (L1, 170:5) — Ivy's one line, "Say an
// idea out loud.", and a lime arrow down to the ⊕. No grid, no setup.
// Ivy on open (162:2): one line from the graph, only when something changed since her last look, written in under the
// chips with its cite; tap to hear that moment; gone after ~6 s or on scroll. When nothing changed, the My things line
// takes its place (B.5): "13 things today · get some milk first", 4 s, then it fades; nothing when her plate is clear.
// While a recording is being processed, or a frame is on its way, Home re-polls so the card and its frame appear
// on their own.
// Job C+: pinned cards sit in a Pinned row above Today (and leave the days); hold any card for its arc (Like · Link
// ideas · Add context · Share; to-dos Done · Date · Share); Link ideas puts Home in link mode — the banner where
// Ivy's line was, a mark on every tile, Done in the nav's place.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Animated, { useSharedValue } from 'react-native-reanimated'
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
  deckOf,
  feedItems,
  GRID,
  thingsSentence,
  type CardItem,
} from '@/lib/home'
import { colour, hueLineOf, size, type } from '@ivywolf/ui'
import { IvyNote, DISSOLVE_AFTER_MS, THINGS_DISSOLVE_MS } from '@/components/IvyNote'
import { Tile } from '@/components/Tile'
import { ProjectChips } from '@/components/HomeChrome'
import { CollapsingHeader, LOGO_ROW_H, useCollapsingHeader, useHeaderInset } from '@/components/CollapsingHeader'
import { Nav } from '@/components/Nav'
import { BAR_BOTTOM } from '@/components/ActionBar'
import { FailedRecordings } from '@/components/FailedRecordings'
import { UndoPill } from '@/components/UndoPill'
import { useBackToTop } from '@/lib/backToTop'
import { deleteRecording } from '@/lib/deleteRecording'
import { Hold, HoldProvider, useHolding } from '@/components/HoldArc'
import { useCardActions } from '@/components/CardActions'
import { LinkBanner, LinkLines, type LinkLinesHandle } from '@/components/LinkMode'
import { PinnedRow, pinnedOf } from '@/components/PinnedRow'
import { MyThingsIcon } from '@/components/MyThingsIcon'
import { HomeDirectionTile } from '@/components/HomeDirectionTile'
import { useOpenCredit } from '@/components/useOpenCredit'
import { dismissForToday, directionOfDay, directionPicture, type HomeDirection } from '@/lib/directionOfDay'
import { dismissDirection, saveDirection } from '@/lib/directions'
import type { Picture, ReferencePicture } from '@/lib/picture'

// The masonry, driven by the collapsing header's UI-thread scroll handler.
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList<Row>)

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
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<string | null>(null)
  const [ivy, setIvy] = useState<IvySentence[] | null>(null)
  // B.5: the My things line stays 4 s; Ivy on open keeps 162:2's ~6.
  const [ivyAfter, setIvyAfter] = useState(DISSOLVE_AFTER_MS)
  const [dissolve, setDissolve] = useState(false)
  const list = useRef<FlashListRef<Row>>(null)
  const backToTop = useBackToTop(project, setProject, list)
  // Ivy's line (162:2) plays from where it was said, without leaving Home.
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

  // Today's direction (one a day) and its picture: the first stock reference, else the project's hue.
  const [direction, setDirection] = useState<HomeDirection | null>(null)
  const [directionRef, setDirectionRef] = useState<ReferencePicture | null>(null)
  const loadDirection = useCallback(async () => {
    const d = await directionOfDay(supabase).catch(() => null)
    setDirection(d)
    if (!d) return setDirectionRef(null)
    const token = await getToken()
    setDirectionRef(token ? await directionPicture(token, d.id).catch(() => null) : null)
  }, [supabase, getToken])
  useFocusEffect(
    useCallback(() => {
      loadDirection()
    }, [loadDirection])
  )
  const directionDone = useCallback(async (run: () => Promise<unknown>) => {
    setDirection(null)
    await dismissForToday()
    await run().catch((e) => setError(e instanceof Error ? e.message : 'That didn’t save'))
    load()
  }, [load])
  const openCredit = useOpenCredit()

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
    if (ivy === null) {
      // Something new since she last looked comes first; otherwise what's on her plate (where the My things row was).
      const said = ivyOnOpen(data)
      const things = said.length ? null : thingsSentence(data.items)
      setIvyAfter(things ? THINGS_DISSOLVE_MS : DISSOLVE_AFTER_MS)
      setIvy(said.length ? said : things ? [things] : [])
    }
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

  // The feed is ideas only; to-dos are the My things row (v4).
  const visible = useMemo(() => (data ? feedItems(data.items, project, data.links) : []), [data, project])
  const byId = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data])
  // The deck being swiped: its lines show while it's moving or off its top card.
  const [deckFocus, setDeckFocus] = useState<{ from: string; active: string | null } | null>(null)
  const deckLines = useRef<LinkLinesHandle>(null)
  const pinned = useMemo(() => pinnedOf(visible), [visible])
  const rows = useMemo(
    () => toRows(groupByDay(visible.filter((i) => !i.pinnedAt)), project === null ? direction : null),
    [visible, project, direction]
  )
  // A board's 3-up: two more pictures from its thread.
  const trioOf = useCallback(
    (card: CardItem): Picture[] => {
      const thread = data?.threads.find((t) => t.cardIds.includes(card.id))
      if (!thread) return []
      return visible.filter((c) => c.id !== card.id && thread.cardIds.includes(c.id) && c.picture.uri).slice(0, 2).map((c) => c.picture)
    },
    [data, visible]
  )
  const actions = useCardActions({
    links: data?.links,
    reload: load,
    findCard: (id) => data?.items.find((i) => i.kind === 'card' && i.id === id) as never,
  })
  const linking = actions.linking
  const startScroll = useCallback(() => setDissolve(true), [])
  const remeasureLines = useCallback(() => {
    actions.remeasure()
    deckLines.current?.remeasure()
  }, [actions])
  const header = useCollapsingHeader({ onScroll: linking || deckFocus ? remeasureLines : undefined, onBeginDrag: startScroll })
  const headerInset = useHeaderInset()

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
        face={() => <Tile item={item} meta={meta} pinned={inPinned} overlay={!linking} deck={linking || inPinned ? undefined : deckOf(item, data?.links, byId)} />}
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
            trio={item.kind === 'card' && item.shape === 'board' ? trioOf(item) : undefined}
            onCredit={openCredit}
            deck={linking || inPinned ? undefined : deckOf(item, data?.links, byId)}
            onDeck={(active, swiping) => setDeckFocus(active || swiping ? { from: item.id, active: active?.id ?? null } : null)}
            overlay={!linking}
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
      <AnimatedFlashList
        ref={list}
        data={rows}
        extraData={[linking, directionRef, deckFocus]}
        scrollEnabled={!holding}
        onScroll={header.onScroll}
        scrollEventThrottle={16}
        scrollIndicatorInsets={{ top: headerInset }}
        masonry
        numColumns={2}
        keyExtractor={(r) => r.key}
        getItemType={(r) => (r.kind === 'tile' ? r.item.kind : r.kind)}
        overrideItemLayout={(layout, r) => {
          if (r.kind === 'day') layout.span = 2
        }}
        contentContainerStyle={{
          paddingTop: headerInset,
          paddingHorizontal: GRID.margin - GRID.gutter / 2,
          paddingBottom: BAR_BOTTOM + size['bar-h'] + GRID.after * 2,
        }}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {linking ? (
              <LinkBanner title={linking.from.title} />
            ) : (
              ivy && ivy.length > 0 && <IvyNote sentences={ivy} dissolve={dissolve} after={ivyAfter} onGone={() => setIvy([])} onPlay={(c) => play('ivy', c.storagePath, c.ms)} />
            )}
            {error && <Text style={[type['Body / Small'], styles.error]}>{error}</Text>}
            {failed}
            <PinnedRow cards={pinned} render={(c, w) => tile(c, w, true)} />
          </View>
        }
        renderItem={({ item: r }) =>
          r.kind === 'day' ? (
            <Text style={styles.divider}>{r.label}</Text>
          ) : r.kind === 'direction' ? (
            <View style={styles.cell}>
              <Hold
                actions={() => [
                  { key: 'save', label: 'Save', icon: 'plus', run: () => directionDone(() => saveDirection(supabase, r.direction.id)) },
                  { key: 'not', label: 'Not this', icon: 'xmark', run: () => directionDone(() => dismissDirection(supabase, r.direction.id)) },
                ]}
                face={() => <HomeDirectionTile direction={r.direction} reference={directionRef} />}
                disabled={!!linking}
              >
                {(onLongPress) => (
                  <HomeDirectionTile
                    direction={r.direction}
                    reference={directionRef}
                    onOpen={() => router.push(`/project/${r.direction.projectId}?tab=more`)}
                    onLongPress={onLongPress}
                    onCredit={openCredit}
                  />
                )}
              </Hold>
            </View>
          ) : (
            <View style={styles.cell}>{tile(r.item)}</View>
          )
        }
      />

      <CollapsingHeader
        hidden={header.hidden}
        logo={<Wordmark />}
        right={<HeaderActions />}
        chips={<ProjectChips projects={chips} selected={project} onSelect={(id) => (chips.find((p) => p.id === id)?.kind === 'things' ? router.push('/things') : setProject(id))} />}
      />

      {deckFocus && !linking && (
        <LinkLines
          ref={deckLines}
          from={deckFocus.from}
          to={[...(data.links.get(deckFocus.from) ?? [])]}
          views={actions.views}
          paint={(id) => {
            const c = byId.get(id)
            return { colour: hueLineOf(c?.kind === 'card' ? c.hue : null), opacity: id === deckFocus.active ? 1 : 0.25 }
          }}
        />
      )}
      {actions.layer(<Nav room="home" listening={data.inFlight > 0} onHome={backToTop} />)}
      <UndoPill onUndone={load} />
    </View>
  )
}

/**
 * Home's list: each day's overline across both columns, then its tiles in the masonry, newest first. Today's
 * direction, when there is one, comes second — the right column of the first row (1737:152).
 */
type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'tile'; key: string; item: Item }
  | { kind: 'direction'; key: string; direction: HomeDirection }
function toRows(groups: DayGroup[], direction: HomeDirection | null): Row[] {
  const rows: Row[] = groups.flatMap((g) => [
    ...(g.label ? [{ kind: 'day' as const, key: `day-${g.day}`, label: g.label }] : []),
    ...g.items.map((item) => ({ kind: 'tile' as const, key: item.id, item })),
  ])
  if (direction) {
    const first = rows.findIndex((r) => r.kind === 'tile')
    rows.splice(first < 0 ? rows.length : first + 1, 0, { kind: 'direction', key: `direction-${direction.id}`, direction })
  }
  return rows
}

function Wordmark() {
  return (
    <Text style={styles.wordmark} accessibilityRole="header">
      IVY
    </Text>
  )
}

/** The logo row's right: My things (Ivy, B.6 — her own 44 pt tap), search and the avatar (Voice notes). No + — adding lives on the ⊕'s long-press. */
function HeaderActions() {
  return (
    <>
      <MyThingsIcon />
      <Pressable onPress={() => router.push('/search')} hitSlop={TAP_SLOP} accessibilityRole="button" accessibilityLabel="Search">
        <SymbolView name="magnifyingglass" tintColor={colour.Ink} size={size.icon} />
      </Pressable>
      <Pressable onPress={() => router.push('/notes')} hitSlop={TAP_SLOP} style={styles.avatar} accessibilityRole="button" accessibilityLabel="Voice notes">
        <Image source={require('@/assets/figma/l1-profile.svg')} style={StyleSheet.absoluteFill} />
        <Image source={require('@/assets/figma/l1-profile-glyph.svg')} style={styles.avatarGlyph} />
      </Pressable>
    </>
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
  const still = useSharedValue(0) // nothing scrolls here; the logo row stays
  return (
    <View style={styles.screen}>
      <View style={{ paddingTop: insets.top + LOGO_ROW_H }}>
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
      <CollapsingHeader hidden={still} logo={<Wordmark />} right={<HeaderActions />} />
      <Nav room="home" listening={writing} />
    </View>
  )
}

// Home (Figma 227:5; L3b 209:2) — measured, not tokens: the day overline sits 10 above its tiles. First open (L1, 170:5) keeps its own frame: headline Bold 28 at y 330, body Regular 16 at 374,
// arrow 28 × 60 at y 660.
const OVERLINE_GAP = 10
const TAP_SLOP = (size.tap - size.icon) / 2
const L1 = { frame: 852, heroTop: 330, title: 28, body: 16, bodyLine: 19, bodyWidth: 330, bodyGap: 10, arrowBottom: 132, arrowW: 28, arrowH: 60 }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: GRID.margin },
  secondary: { color: colour.Grey, textAlign: 'center' },
  error: { color: colour.Grey, paddingHorizontal: GRID.margin, paddingTop: GRID.gutter },
  wordmark: type['Title / Wordmark'],
  avatar: { width: size.icon, height: size.icon, alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { width: size.icon / 2, height: size.icon / 2 },
  // The list is inset by margin − gutter/2 and every cell pads gutter/2, so tiles sit at the margin, a gutter apart;
  // the list header undoes the inset.
  listHeader: { marginHorizontal: -(GRID.margin - GRID.gutter / 2), paddingBottom: 0 },
  // Each cell pads half a gutter, so tiles sit at the margin, 13 apart; the tile's caption carries the 18 below it.
  cell: { paddingHorizontal: GRID.gutter / 2 },
  divider: { ...type['Label / Overline'], color: colour.Grey, textTransform: 'uppercase', marginHorizontal: GRID.gutter / 2, marginTop: OVERLINE_GAP, marginBottom: OVERLINE_GAP },
  firstHero: { position: 'absolute', left: GRID.margin, right: GRID.margin },
  firstTitle: { fontSize: L1.title, fontWeight: '700', color: colour.Ink },
  firstBody: { fontSize: L1.body, lineHeight: L1.bodyLine, color: colour.Grey, width: L1.bodyWidth, marginTop: L1.bodyGap },
  arrow: { position: 'absolute', bottom: L1.arrowBottom, alignSelf: 'center', width: L1.arrowW, height: L1.arrowH },
})
