// apps/mobile/app/project/[id].tsx
// Project (P11). Back; share and ••• (Rename, Delete — her own projects only; the defaults can't be changed); the
// name; the Private project chip and "4 ideas · 1 board"; All ideas / More ideas; the ideas in a two-column masonry
// with the title in the frame; one floating pill, Talk to {project}, which opens Record scoped to this project.
// More ideas is Rising scoped to the project (P12) — a line of placeholder until the cohort exists.
// No blank state (rule 1): a project with no ideas yet is one prompt to talk to it.
// Left out of the frame: add-people (projects are private in the pilot), the filter icon over the grid, and the
// stars on tile corners — nothing yet says what they do.
// Reached from the Idea page's project button and "You keep coming back to this" in My things.

import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useAudioPlayer } from 'expo-audio'
import { useSupabase } from '@/lib/supabase'
import { masonry, projectFrameHeight, type Item } from '@/lib/home'
import { countLine, deleteProject, loadProject, renameProject, type ProjectPage } from '@/lib/project'
import { Tile, useTileWidth } from '@/components/Tile'
import { Menu, MENU_OFFSET } from '@/components/PinChrome'
import { colour, radius, size, space, type } from '@ivywolf/ui'
import { ActionBar, BAR_BOTTOM } from '@/components/ActionBar'

export default function Project() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const insets = useSafeAreaInsets()
  const [page, setPage] = useState<ProjectPage | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'more'>('all')
  const [menu, setMenu] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const player = useAudioPlayer(null)
  const tileWidth = useTileWidth()

  const load = useCallback(() => {
    loadProject(supabase, id)
      .then((p) => {
        setPage(p)
        setError(null)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [supabase, id])
  useFocusEffect(load)

  async function play(item: Item) {
    if (item.kind !== 'card' || !item.storagePath) return
    if (playing === item.id) {
      player.pause()
      return setPlaying(null)
    }
    const { data } = await supabase.storage.from('recordings').createSignedUrl(item.storagePath, 3600)
    if (!data) return
    player.replace({ uri: data.signedUrl })
    await player.seekTo(item.playFromMs / 1000)
    player.play()
    setPlaying(item.id)
  }

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
  const [left, right] = masonry(ideas, (i) => projectFrameHeight(i) + space.gutter)

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
      <ScrollView contentContainerStyle={{ paddingBottom: BAR_BOTTOM + size['bar-h'] + space.section }}>
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

          <View style={styles.tabs} accessibilityRole="tablist">
            <Tab label="All ideas" on={tab === 'all'} onPress={() => setTab('all')} />
            <Tab label="More ideas" on={tab === 'more'} onPress={() => setTab('more')} />
          </View>

          {tab === 'all' ? (
            <View style={styles.columns}>
              {[left, right].map((col, c) => (
                <View key={c} style={{ width: tileWidth }}>
                  {col.map((item) => (
                    <Tile
                      key={item.id}
                      item={item}
                      meta=""
                      inside
                      playing={playing === item.id}
                      onPlay={play}
                      onOpen={(i) => router.push(`/idea/${i.id}`)}
                    />
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <Text style={[type['Body'], styles.secondary]}>
              Ideas from other creators, picked for {project.name} and your style, will show here once Rising opens.
            </Text>
          )}
        </View>
      </ScrollView>

      <ActionBar verbs={[{ key: 'talk', label: 'Talk', icon: 'mic.fill', lime: true, accessibilityLabel: `Talk to ${project.name}`, onPress: talk }]} />

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

function Tab({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} style={styles.tabHit}>
      <Text style={[styles.tab, on && styles.tabOn]}>{label}</Text>
      <View style={[styles.tabRule, !on && { opacity: 0 }]} />
    </Pressable>
  )
}

// P12b (Figma 202:2) — measured, not tokens: the chip is 10 under the name, radius 16 (not radius/chip), 12 × 8
// padding; tabs start 26 under the chip, 24 apart, with a 3-pt rule (radius 2) 6 under the label. P12b sets its text
// column at 16 while its tiles sit at 12; both use space/margin here. The empty project (P11, no Job G frame) keeps
// its 84 lime mic and 32 side padding.
const CHIP_GAP = 10
const CHIP_R = 16
const CHIP_PAD_H = 12
const CHIP_PAD_V = 8
const TABS_GAP = 26
const TAB_GAP = 24
const RULE_H = 3
const RULE_R = 2
const RULE_GAP = 6
const COLD_MIC = 84
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
  tabs: { flexDirection: 'row', gap: TAB_GAP, marginTop: TABS_GAP, marginBottom: space.stack },
  tabHit: { minHeight: size.tap, justifyContent: 'center' },
  tab: { ...type['Heading / Small'], color: colour.Grey },
  tabOn: { color: colour.Ink },
  tabRule: { height: RULE_H, borderRadius: RULE_R, backgroundColor: colour.Ink, marginTop: RULE_GAP },
  columns: { flexDirection: 'row', justifyContent: 'space-between' },
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
