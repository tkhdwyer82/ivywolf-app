// apps/mobile/app/project/[id].tsx
// Project (P11). Back; share and ••• (Rename, Delete — her own projects only; the defaults can't be changed); the
// name; the Private project chip and "4 ideas · 1 board"; the ideas in a two-column masonry, frames only; the action
// bar (Talk, scoped to this project).
// More ideas (Job G, P12b 202:2): a tab only when a thread in the project has come back ≥ 3 times — "Your ideas" (a
// strip of her thumbs, → All ideas) and "More ideas for this thread" (up to five suggestions, each a frame with a
// lime pin: tap opens it, long-press hides it). The action bar gains More ideas with the tab. Create joins the bar
// once there's a Create flow.
// No blank state (rule 1): a project with no ideas yet is one prompt to talk to it.
// Left out of the frame: add-people (projects are private in the pilot), the filter icon over the grid, and the
// stars on tile corners — nothing yet says what they do.
// Reached from the Idea page's project button and "You keep coming back to this" in My things.

import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useSupabase } from '@/lib/supabase'
import { masonry, tileHeight } from '@/lib/home'
import { countLine, deleteProject, loadProject, renameProject, type ProjectPage } from '@/lib/project'
import { Tile, useTileWidth } from '@/components/Tile'
import { SuggestionTile } from '@/components/SuggestionTile'
import { ProjectTabs, type ProjectTab } from '@/components/ProjectTabs'
import { Shimmer } from '@/components/Shimmer'
import { hideSuggestion, loadMoreIdeas, takePinNote, type PinNote, type Suggestion } from '@/lib/suggestions'
import { IvyNote } from '@/components/IvyNote'
import { Menu, MENU_OFFSET } from '@/components/PinChrome'
import { colour, radius, size, space, type } from '@ivywolf/ui'
import { ActionBar, BAR_BOTTOM } from '@/components/ActionBar'

export default function Project() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const insets = useSafeAreaInsets()
  const [page, setPage] = useState<ProjectPage | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<ProjectTab>('all')
  const [more, setMore] = useState<Awaited<ReturnType<typeof loadMoreIdeas>>>(null)
  const [pinNote, setPinNote] = useState<PinNote | null>(null)
  const [dissolve, setDissolve] = useState(false)
  const [menu, setMenu] = useState(false)
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
    Promise.all([loadProject(supabase, id), loadMoreIdeas(supabase, id)])
      .then(([p, m]) => {
        setPage(p)
        setMore(m)
        if (!m) setTab('all')
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [supabase, id])

  // Long-press: gone at once, no UI. If it didn't take, the next load puts it back.
  const hide = useCallback(
    (s: Suggestion) => {
      setMore((m) => (m ? { ...m, suggestions: m.suggestions.filter((x) => x.id !== s.id) } : m))
      hideSuggestion(supabase, s.id).catch(load)
    },
    [supabase, load]
  )
  const [moreLeft, moreRight] = useMemo(() => balance(more?.suggestions ?? []), [more])
  useFocusEffect(load)

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
  const [left, right] = masonry(ideas)

  // Rule 1: before the first idea, the whole screen is the prompt to talk to it.
  if (ideas.length === 0) {
    return (
      <View style={styles.screen}>
        <Header top={insets.top} own={own} onMenu={() => setMenu(true)} onShare={undefined} />
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
      <ScrollView contentContainerStyle={{ paddingBottom: BAR_BOTTOM + size['bar-h'] + space.section }} onScrollBeginDrag={() => setDissolve(true)}>
        <Header top={insets.top} own={own} onMenu={() => setMenu(true)} onShare={share} />
        <View style={styles.body}>
          <Text style={styles.name}>{project.name}</Text>
          <View style={styles.metaRow}>
            <View style={styles.private}>
              <Text style={type['Label / Pill']}>Private project</Text>
            </View>
            <Text style={styles.count}>{countLine(ideas.length, boards)}</Text>
          </View>
          {error && <Text style={[type['Caption'], { marginTop: space.gutter }]}>{error}</Text>}

          {pinNote && (
            <View style={styles.pinNote}>
              <IvyNote sentences={[{ text: pinNote.text, cites: pinNote.cites }]} dissolve={dissolve} onGone={() => setPinNote(null)} />
            </View>
          )}
          <ProjectTabs tab={tab} moreIdeas={!!more} onChange={setTab} />
          {!more && <View style={styles.noTabs} />}

          {tab === 'all' || !more ? (
            <View style={styles.columns}>
              {[left, right].map((col, c) => (
                <View key={c} style={{ width: tileWidth }}>
                  {col.map((item) => (
                    <View key={item.id} style={styles.cell}>
                      <Tile item={item} width={tileWidth} onOpen={(i) => router.push(`/idea/${i.id}`)} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <>
              <View style={styles.sectionRow}>
                <Text style={type['Title / Section']}>Your ideas</Text>
                <Pressable onPress={() => setTab('all')} hitSlop={(size.tap - ARROW) / 2} style={styles.arrow} accessibilityRole="button" accessibilityLabel="All ideas">
                  <SymbolView name="arrow.right" tintColor={colour.Ink} size={ARROW / 2} weight="semibold" />
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripRow}>
                {ideas.map((i) => (
                  <Pressable key={i.id} onPress={() => router.push(`/idea/${i.id}`)} style={styles.thumb} accessibilityRole="button" accessibilityLabel={i.title}>
                    {i.shape !== 'photo' ? (
                      // A quote, comparison, board or text card has no picture: its title stands in.
                      <Text style={styles.thumbTitle} numberOfLines={4}>
                        {i.title}
                      </Text>
                    ) : (
                      <>
                        <Shimmer style={StyleSheet.absoluteFill} />
                        {i.frameStatus === 'done' && !!i.frameUrl && (
                          <Image source={{ uri: i.frameUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
                        )}
                      </>
                    )}
                  </Pressable>
                ))}
              </ScrollView>

              {more.suggestions.length > 0 && (
                <>
                  <Text style={[type['Title / Section'], styles.moreTitle]}>More ideas for this thread</Text>
                  <View style={styles.columns}>
                    {[moreLeft, moreRight].map((col, c) => (
                      <View key={c} style={{ width: tileWidth }}>
                        {col.map((s) => (
                          <View key={s.id} style={styles.cell}>
                            <SuggestionTile suggestion={s} width={tileWidth} onOpen={(x) => router.push(`/suggestion/${x.id}`)} onHide={hide} />
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <ActionBar
        verbs={[
          ...(more ? [{ key: 'more', label: 'More ideas', icon: 'square.grid.2x2' as const, onPress: () => setTab('more') }] : []),
          { key: 'talk', label: 'Talk', icon: 'mic.fill', lime: true, accessibilityLabel: `Talk to ${project.name}`, onPress: talk },
        ]}
      />

      {menu && <ProjectMenu top={insets.top + MENU_OFFSET} onClose={() => setMenu(false)} onRename={rename} onDelete={remove} />}
    </View>
  )
}

function Header({ top, own, onMenu, onShare }: { top: number; own: boolean; onMenu: () => void; onShare?: () => void }) {
  return (
    <View style={[styles.header, { marginTop: top }]}>
      <Pressable onPress={() => router.back()} hitSlop={TAP_SLOP} accessibilityRole="button" accessibilityLabel="Back">
        <SymbolView name="chevron.left" tintColor={colour.Ink} size={size.icon} />
      </Pressable>
      <View style={styles.headerRight}>
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


/** Two columns of suggestions, each into the shorter one — the same fill as her ideas. */
function balance(items: Suggestion[]): [Suggestion[], Suggestion[]] {
  const cols: [Suggestion[], Suggestion[]] = [[], []]
  const h = [0, 0]
  for (const s of items) {
    const c = h[0] <= h[1] ? 0 : 1
    cols[c].push(s)
    h[c] += tileHeight(s.id) + space.gutter
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
const ARROW = 36 // the → disc by Your ideas (202:15)
const COLD_PAD = 32
const TAP_SLOP = (size.tap - size.icon) / 2

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space.margin },
  secondary: { color: colour.Grey },
  header: { height: size.tap, paddingHorizontal: space.margin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: space.stack },
  body: { paddingHorizontal: space.margin },
  name: { ...type['Title / Screen'], marginTop: space.stack },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.stack, marginTop: CHIP_GAP },
  private: { borderRadius: CHIP_R, paddingHorizontal: CHIP_PAD_H, paddingVertical: CHIP_PAD_V, backgroundColor: colour.Chip },
  count: { ...type['Body'], color: colour.Grey },
  noTabs: { height: space.stack },
  // IvyNote pads itself to the margin; the body already has it.
  pinNote: { marginHorizontal: -space.margin },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: ARROW, height: ARROW, borderRadius: ARROW / 2, backgroundColor: colour.Chip, alignItems: 'center', justifyContent: 'center' },
  // The strip runs to the screen's edge: out of the body's margin, back in for the first thumb.
  strip: { marginHorizontal: -space.margin, marginTop: space.stack },
  stripRow: { paddingHorizontal: space.margin, gap: space.gutter },
  thumbTitle: { ...type['Body / Small'], fontWeight: '600', padding: space.gutter + 2 },
  thumb: { width: size.thumb, height: size.thumb, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colour.Chip },
  moreTitle: { marginTop: space.section, marginBottom: space.stack },
  columns: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { paddingBottom: space.gutter },
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
