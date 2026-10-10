// apps/mobile/app/project/[id].tsx
// Project (P11). Back; share and ••• (Rename, Delete — her own projects only; the defaults can't be changed); the
// name; the Private project chip and "4 ideas · 1 board"; the ideas in a two-column masonry, frames only; the action
// bar (Talk, scoped to this project).
// More ideas (Job H, Figma 165:423): Ivy's directions for the project — new things her own cards point to, each with
// one cited line of her words and 3 references under it (lib/directions.ts). Staged: the tabs and the bar's More ideas
// appear once the project has 3 cards. Opening the project checks whether directions are due (a change quiet 5 min,
// or 24 h old) and they're rewritten in the background. Each direction is a tile with a lime + (Save, the screen's one
// lime thing); ♥ · Save · Link to… · Not this live in the hold arc. Job G's thread suggestions no longer show here.
// No blank state (rule 1): a project with no ideas yet is one prompt to talk to it.
// Job I (165:5, 1468:128): the header is fixed under the status bar — back; add people (private in the pilot, and
// says so), share, •••; POWERED BY her connected tools and + Add tool; All ideas · More ideas always (More ideas is
// her strip until a thread earns suggestions). Still left out: the filter icon over the grid and the tile stars —
// nothing yet says what they do.
// Reached from the Idea page's project button and "You keep coming back to this" in My things.
// Job C+: pinned ideas sit at the top (Pinned row); hold an idea for its arc, a suggestion for Keep · Not for this
// project · Link ideas · Share. Link mode here shows only this project's ideas. ?linkFrom=<card> (an idea's •••
// Link ideas) opens the page in link mode.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useSupabase } from '@/lib/supabase'
import { masonry, tileHeight } from '@/lib/home'
import { countLine, deleteProject, loadProject, renameProject, type ProjectPage } from '@/lib/project'
import { Tile, useTileWidth } from '@/components/Tile'
import { ProjectTabs, type ProjectTab } from '@/components/ProjectTabs'
import { Shimmer } from '@/components/Shimmer'
import { takePinNote, type PinNote } from '@/lib/suggestions'
import { loadDirections, referenceUsed, saveDirection, type Direction, type Directions } from '@/lib/directions'
import { DirectionTile } from '@/components/DirectionTile'
import { useAuth } from '@clerk/clerk-expo'
import { IvyNote } from '@/components/IvyNote'
import { Menu, MENU_OFFSET } from '@/components/PinChrome'
import { colour, radius, size, space, type } from '@ivywolf/ui'
import { ActionBar, BAR_BOTTOM } from '@/components/ActionBar'
import { Hold, HoldProvider, useHolding } from '@/components/HoldArc'
import { useCardActions } from '@/components/CardActions'
import { LinkBanner } from '@/components/LinkMode'
import { PinnedRow, pinnedOf } from '@/components/PinnedRow'
import type { CardItem } from '@/lib/home'

export default function Project() {
  return (
    <HoldProvider>
      <ProjectScreen />
    </HoldProvider>
  )
}

function ProjectScreen() {
  const { id, linkFrom } = useLocalSearchParams<{ id: string; linkFrom?: string }>()
  const holding = useHolding()
  const supabase = useSupabase()
  const insets = useSafeAreaInsets()
  const [page, setPage] = useState<ProjectPage | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<ProjectTab>('all')
  const [dirs, setDirs] = useState<Directions | null>(null)
  const [ivyLine, setIvyLine] = useState<string | null>(null)
  const { getToken } = useAuth()
  const [pinNote, setPinNote] = useState<PinNote | null>(null)
  const [dissolve, setDissolve] = useState(false)
  const [menu, setMenu] = useState(false)
  const [tools, setTools] = useState<Tool[]>([])
  const tileWidth = useTileWidth()

  // On focus: so a pin or a dismiss on the open screen, or a new card in the thread, is here when she's back.
  const load = useCallback(() => {
    // Back from a pin (P12d): All ideas, with Ivy's one cited line; it dissolves on its own or on scroll.
    const note = takePinNote(id)
    if (note) {
      setPinNote(note)
      setDissolve(false)
      setTab('all')
    }
    Promise.all([loadProject(supabase, id), loadTools(supabase)])
      .then(([p, t]) => {
        setPage(p)
        setTools(t)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
    // Opening the project is a trigger: due directions are rewritten in the background (no references needed yet).
    refreshDirections(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, id])

  // Directions, with references when the tab is open. While new ones are being written the previous set shows, and
  // the tab looks again in a little while (twice at most) — never on scroll.
  const polls = useRef(0)
  const refreshDirections = useCallback(
    async (withReferences: boolean) => {
      const token = await getToken()
      if (!token) return
      try {
        const d = await loadDirections(token, id, withReferences)
        setDirs((prev) => (withReferences || !prev ? d : { ...d, directions: prev.directions }))
        if (d.generating && withReferences && polls.current < 2) {
          polls.current++
          setTimeout(() => refreshDirections(true), 25_000)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'More ideas didn’t load')
      }
    },
    // getToken is a new function every render (Clerk): never key on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  )
  // The More ideas tab opened: directions with references, and Ivy's one line (it dissolves).
  useEffect(() => {
    if (tab !== 'more') return
    polls.current = 0
    refreshDirections(true)
  }, [tab, refreshDirections])
  useEffect(() => {
    if (tab === 'more' && dirs?.ivy_line && dirs.directions.length) {
      setIvyLine(dirs.ivy_line)
      setDissolve(false)
    }
  }, [tab, dirs?.ivy_line, dirs?.directions.length])

  // Saved or set aside: gone from the tab at once. If it didn't take, the next load puts it back.
  const gone = useCallback((d: Direction) => {
    setDirs((x) => (x ? { ...x, directions: x.directions.filter((y) => y.id !== d.id) } : x))
  }, [])
  const [dirLeft, dirRight] = useMemo(() => balanceDirections(dirs?.directions ?? []), [dirs])
  useFocusEffect(load)

  // load() returns nothing; the arc's reload wants to wait for the page, so it loads directly.
  const reload = useCallback(async () => {
    const p = await loadProject(supabase, id)
    setPage(p)
    return p
  }, [supabase, id])
  const latest = useRef<ProjectPage | null | undefined>(undefined)
  latest.current = page
  const actions = useCardActions({
    links: page?.links,
    reload,
    findCard: (cardId) => latest.current?.ideas.find((i) => i.id === cardId),
  })
  const linking = actions.linking

  // Opened from an idea's ••• → Link ideas: link mode from that idea, once it's loaded.
  const startedFrom = useRef<string | null>(null)
  useEffect(() => {
    if (!linkFrom || !page || startedFrom.current === linkFrom) return
    const from = page.ideas.find((i) => i.id === linkFrom)
    if (from) {
      startedFrom.current = linkFrom
      setTab('all')
      actions.startLinking(from)
    }
  }, [linkFrom, page, actions])

  const tile = (item: CardItem, width: number, inPinned?: boolean) => (
    <Hold
      actions={() => actions.actionsFor(item)}
      face={() => <Tile item={item} width={width} pinned={inPinned} />}
      viewRef={actions.viewRef(item.id)}
      disabled={!!linking}
    >
      {(onLongPress) => (
        <Tile
          item={item}
          width={width}
          onOpen={linking ? actions.toggleLink : (i) => router.push(`/idea/${i.id}`)}
          onLongPress={onLongPress}
          mark={actions.markFor(item)}
          pinned={inPinned}
        />
      )}
    </Hold>
  )

  function rename() {
    if (!page) return
    Alert.prompt(
      'Rename project',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: (name?: string) =>
            renameProject(supabase, page.project.id, name ?? '').then(
              (n) => setPage({ ...page, project: { ...page.project, name: n } }),
              (e) => setError(e instanceof Error ? e.message : 'That didn’t rename')
            ),
        },
      ],
      'plain-text',
      page.project.name
    )
  }

  function remove() {
    if (!page) return
    Alert.alert(`Delete “${page.project.name}”?`, 'Its ideas go back to My things. Nothing else is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete project',
        style: 'destructive',
        onPress: () =>
          deleteProject(supabase, page.project.id).then(
            () => router.back(),
            (e) => setError(e instanceof Error ? e.message : 'That didn’t delete')
          ),
      },
    ])
  }

  if (page === undefined || page === null) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {page === null || error ? (
          <Text style={[type['Body'], styles.secondary]}>{error ?? 'This project has gone.'}</Text>
        ) : (
          <ActivityIndicator color={colour.Ink} />
        )}
      </View>
    )
  }

  const { project, ideas, boards } = page
  const talk = () => router.push({ pathname: '/record', params: { projectId: project.id } })
  const own = project.kind === 'user'
  // Add people (165:5). Projects are private in the pilot: the icon is there, and says so.
  const people = () => Alert.alert('Private project', 'Only you can view this project.')
  const pinned = pinnedOf(ideas)
  const [left, right] = masonry(ideas.filter((i) => !i.pinnedAt))
  // Staged unlock (Job H): More ideas — the tab and the bar's verb — once the project has 3 cards.
  const unlocked = dirs?.unlocked ?? ideas.length >= 3
  // + : the direction becomes a card in this project (and on Home); it leaves the tab.
  const saveOne = (d: Direction) => {
    gone(d)
    saveDirection(supabase, d.id)
      .then(() => reload())
      .catch((e) => setError(e instanceof Error ? e.message : 'That didn’t save'))
  }

  // Rule 1: before the first idea, the whole screen is the prompt to talk to it.
  if (ideas.length === 0) {
    return (
      <View style={styles.screen}>
        <Header top={insets.top} own={own} onMenu={() => setMenu(true)} onPeople={people} />
        <View style={styles.cold}>
          <Text style={styles.coldTitle}>Talk to {project.name}</Text>
          <Text style={[type['Body'], styles.secondary, styles.coldLine]}>Only this project hears it. Ivy files what you say here.</Text>
          <Pressable onPress={talk} style={styles.coldMic} accessibilityRole="button" accessibilityLabel={`Talk to ${project.name}`}>
            <SymbolView name="mic.fill" tintColor={colour.Ink} size={size.icon} />
          </Pressable>
        </View>
        {menu && <ProjectMenu top={insets.top + MENU_OFFSET} onClose={() => setMenu(false)} onRename={rename} onDelete={remove} />}
      </View>
    )
  }

  const share = () => Share.share({ message: [project.name, '', ...ideas.map((i) => `• ${i.title}`)].join('\n') })

  return (
    <View style={styles.screen}>
      <Header top={insets.top} own={own} onMenu={() => setMenu(true)} onShare={share} onPeople={people} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: BAR_BOTTOM + size['bar-h'] + space.section }}
        onScrollBeginDrag={() => setDissolve(true)}
        scrollEnabled={!holding}
        onScroll={linking ? actions.remeasure : undefined}
        scrollEventThrottle={16}
      >
        <View style={styles.body}>
          <Text style={styles.name}>{project.name}</Text>
          <View style={styles.metaRow}>
            <View style={styles.private}>
              <Text style={type['Label / Pill']}>Private project</Text>
            </View>
            <Text style={styles.count}>{countLine(ideas.length, boards)}</Text>
          </View>
          <PoweredBy tools={tools} />
          {error && <Text style={[type['Caption'], { marginTop: space.gutter }]}>{error}</Text>}

          {linking && (
            <View style={styles.banner}>
              <LinkBanner title={linking.from.title} />
            </View>
          )}
          {pinNote && (
            <View style={styles.pinNote}>
              <IvyNote sentences={[{ text: pinNote.text, cites: pinNote.cites }]} dissolve={dissolve} onGone={() => setPinNote(null)} />
            </View>
          )}
          {unlocked && <ProjectTabs tab={tab} onChange={setTab} />}
          {!unlocked && <View style={styles.noTabs} />}

          {tab === 'all' || !unlocked ? (
            <>
              <View style={styles.pinned}>
                <PinnedRow cards={pinned} render={(c, w) => tile(c, w, true)} />
              </View>
              <View style={styles.columns}>
                {[left, right].map((col, c) => (
                  <View key={c} style={{ width: tileWidth }}>
                    {col.map((item) => (
                      <View key={item.id} style={styles.cell}>
                        {tile(item, tileWidth)}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </>
          ) : (
            <>
              {ivyLine && (
                <View style={styles.pinNote}>
                  <IvyNote sentences={[{ text: ivyLine, cites: [] }]} dissolve={dissolve} onGone={() => setIvyLine(null)} quiet />
                </View>
              )}
              <View style={styles.columns}>
                {dirs && dirs.directions.length > 0
                  ? [dirLeft, dirRight].map((col, c) => (
                      <View key={c} style={{ width: tileWidth }}>
                        {col.map((d) => (
                          <View key={d.id} style={styles.cell}>
                            <Hold
                              actions={() => actions.directionActions(d, gone, () => refreshDirections(true))}
                              face={() => <DirectionTile direction={d} gradient={project.gradient ?? null} width={tileWidth} onSave={() => {}} />}
                            >
                              {(onLongPress) => (
                                <DirectionTile
                                  direction={d}
                                  gradient={project.gradient ?? null}
                                  width={tileWidth}
                                  onSave={saveOne}
                                  onLongPress={onLongPress}
                                  onReference={async (r) => {
                                    const token = await getToken()
                                    if (token) referenceUsed(token, r)
                                  }}
                                />
                              )}
                            </Hold>
                          </View>
                        ))}
                      </View>
                    ))
                  : // Rule 1: never a blank tab — while the first directions are written, the tiles shimmer.
                    [0, 1].map((c) => (
                      <View key={c} style={{ width: tileWidth }}>
                        {[0, 1].map((r) => (
                          <View key={r} style={styles.cell}>
                            <Shimmer style={[styles.waiting, { height: tileHeight(`wait-${c}-${r}`) }]} />
                          </View>
                        ))}
                      </View>
                    ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {actions.layer(
        // 165:5's five verbs are the full set; each joins as it's earned: More ideas at 3 cards (Job H), Create with Job D.
        // On More ideas the + is the screen's one lime thing, so Talk isn't lime there.
        <ActionBar
          verbs={[
            ...(unlocked ? [{ key: 'more', label: 'More ideas', icon: 'sparkles' as const, onPress: () => setTab('more') }] : []),
            { key: 'talk', label: 'Talk', icon: 'mic.fill', lime: tab !== 'more' || !unlocked, accessibilityLabel: `Talk to ${project.name}`, onPress: talk },
          ]}
        />
      )}

      {menu && <ProjectMenu top={insets.top + MENU_OFFSET} onClose={() => setMenu(false)} onRename={rename} onDelete={remove} />}
    </View>
  )
}

/**
 * Fixed above the scroll (165:5): back; add people, share, •••. White, from under the status bar, so the page
 * scrolls beneath it and never under the clock.
 */
function Header({ top, own, onMenu, onShare, onPeople }: { top: number; own: boolean; onMenu: () => void; onShare?: () => void; onPeople: () => void }) {
  return (
    <View style={[styles.headerWrap, { paddingTop: top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={TAP_SLOP} accessibilityRole="button" accessibilityLabel="Back" testID="project-back">
          <SymbolView name="chevron.left" tintColor={colour.Ink} size={size.icon} />
        </Pressable>
        <View style={styles.headerRight}>
          <Pressable onPress={onPeople} hitSlop={TAP_SLOP} accessibilityRole="button" accessibilityLabel="Add people">
            <SymbolView name="person.badge.plus" tintColor={colour.Ink} size={size.icon} />
          </Pressable>
          {onShare && (
            <Pressable onPress={onShare} hitSlop={TAP_SLOP} accessibilityRole="button" accessibilityLabel="Share">
              <SymbolView name="square.and.arrow.up" tintColor={colour.Ink} size={size.icon} />
            </Pressable>
          )}
          {own && (
            <Pressable onPress={onMenu} hitSlop={TAP_SLOP} accessibilityRole="button" accessibilityLabel="More">
              <SymbolView name="ellipsis" tintColor={colour.Ink} size={size.icon} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}

/** Her connected tools (0013 creator_connections), by name. */
type Tool = { slug: string; name: string; tileUrl: string | null }
async function loadTools(supabase: ReturnType<typeof useSupabase>): Promise<Tool[]> {
  const { data, error } = await supabase.from('creator_connections').select('slug, connections(name, tile_url)').order('connected_at')
  if (error) return [] // a footnote: never block the page on it
  return ((data ?? []) as unknown as { slug: string; connections: { name: string; tile_url: string | null } | null }[]).map((r) => ({
    slug: r.slug,
    name: r.connections?.name ?? r.slug,
    tileUrl: r.connections?.tile_url ?? null,
  }))
}

/** POWERED BY · her tools · + Add tool (1468:128). Tools are the footnote (rule 4): small, grey overline, chips. */
function PoweredBy({ tools }: { tools: Tool[] }) {
  return (
    <View style={styles.powered}>
      <Text style={styles.poweredLabel}>POWERED BY</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.poweredRow}>
        {tools.map((t) => (
          <View key={t.slug} style={styles.tool}>
            {t.tileUrl ? <Image source={{ uri: t.tileUrl }} style={styles.toolIcon} /> : <View style={[styles.toolIcon, styles.toolIconBlank]} />}
            <Text style={styles.toolName}>{t.name}</Text>
          </View>
        ))}
        <Pressable onPress={() => router.push('/connections')} style={styles.addTool} accessibilityRole="button" accessibilityLabel="Add tool">
          <Text style={styles.addToolText}>+ Add tool</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

function ProjectMenu({ top, onClose, onRename, onDelete }: { top: number; onClose: () => void; onRename: () => void; onDelete: () => void }) {
  return (
    <Menu
      top={top}
      onClose={onClose}
      items={[
        { icon: 'pencil', label: 'Rename project', onPress: onRename },
        { icon: 'trash', label: 'Delete project', onPress: onDelete, destructive: true },
      ]}
    />
  )
}


/** Two columns of directions, each into the shorter one — the same fill as her ideas (the strip adds a third of a tile). */
function balanceDirections(items: Direction[]): [Direction[], Direction[]] {
  const cols: [Direction[], Direction[]] = [[], []]
  const h = [0, 0]
  for (const d of items) {
    const c = h[0] <= h[1] ? 0 : 1
    cols[c].push(d)
    h[c] += tileHeight(d.id) + (d.references.length ? 60 : 0) + space.gutter
  }
  return cols
}


// P12b (Figma 202:2) — measured, not tokens: the chip is 10 under the name, radius 16 (not radius/chip), 12 × 8
// padding (tabs: components/ProjectTabs.tsx). P12b sets its text
// column at 16 while its tiles sit at 12; both use space/margin here. The empty project (P11, no Job G frame) keeps
// its 84 lime mic and 32 side padding.
const CHIP_GAP = 10
const CHIP_R = 16
const CHIP_PAD_H = 12
const CHIP_PAD_V = 8
const COLD_MIC = 84
const COLD_PAD = 32
const TAP_SLOP = (size.tap - size.icon) / 2
// 1468:128 — measured: the Powered by row 10 under the chip; tool chips 32 tall with a 24 logo.
const POWERED_GAP = 10
const TOOL_H = 32
const TOOL_ICON = 24

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space.margin },
  secondary: { color: colour.Grey },
  headerWrap: { backgroundColor: colour.Surface, zIndex: 1 },
  header: { height: size.tap, paddingHorizontal: space.margin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.stack },
  body: { paddingHorizontal: space.margin },
  name: { ...type['Title / Screen'], marginTop: space.stack },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.stack, marginTop: CHIP_GAP },
  private: { borderRadius: CHIP_R, paddingHorizontal: CHIP_PAD_H, paddingVertical: CHIP_PAD_V, backgroundColor: colour.Chip },
  count: { ...type['Body'], color: colour.Grey },
  powered: { flexDirection: 'row', alignItems: 'center', gap: space.gutter, marginTop: POWERED_GAP },
  poweredLabel: { ...type['Label / Overline'], color: colour.Grey },
  poweredRow: { gap: space.gutter, alignItems: 'center' },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, height: TOOL_H, paddingLeft: 4, paddingRight: CHIP_PAD_H, borderRadius: TOOL_H / 2, backgroundColor: colour.Chip },
  toolIcon: { width: TOOL_ICON, height: TOOL_ICON, borderRadius: TOOL_ICON / 2 },
  toolIconBlank: { backgroundColor: colour.Shimmer },
  toolName: { ...type['Label / Pill'] },
  addTool: { height: TOOL_H, paddingHorizontal: CHIP_PAD_H, borderRadius: TOOL_H / 2, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: '#E6E6E4', justifyContent: 'center' },
  addToolText: { ...type['Label / Pill'], color: colour.Grey },
  // IvyNote pads itself to the margin; the body already has it.
  pinNote: { marginHorizontal: -space.margin },
  noTabs: { height: space.stack },
  waiting: { borderRadius: radius.tile },
  columns: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { paddingBottom: space.gutter },
  // PinnedRow and LinkBanner pad themselves to the margin; the body already has it.
  pinned: { marginHorizontal: -space.margin, marginBottom: space.stack },
  banner: { marginHorizontal: -space.margin, marginBottom: space.gutter },
  cold: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: COLD_PAD, paddingBottom: BAR_BOTTOM + size['bar-h'] },
  coldTitle: { ...type['Title / Section'], textAlign: 'center' },
  coldLine: { textAlign: 'center', marginTop: space.gutter },
  coldMic: {
    marginTop: space.section * 2,
    width: COLD_MIC,
    height: COLD_MIC,
    borderRadius: COLD_MIC / 2,
    backgroundColor: colour.Lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
