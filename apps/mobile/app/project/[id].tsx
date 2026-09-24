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
import { Tile, TILE_WIDTH } from '@/components/Tile'
import { Menu } from '@/components/PinChrome'
import { hero, text } from '@/lib/theme'

const GAP = 16 // between tiles in a column (Figma 83:603)

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
          <Text style={[text.body, styles.secondary]}>{error ?? 'This project has gone.'}</Text>
        ) : (
          <ActivityIndicator color={hero.ink} />
        )}
      </View>
    )
  }

  const { project, ideas, boards } = page
  const talk = () => router.push({ pathname: '/record', params: { projectId: project.id } })
  const own = project.kind === 'user'
  const [left, right] = masonry(ideas, (i) => projectFrameHeight(i) + GAP)

  // Rule 1: before the first idea, the whole screen is the prompt to talk to it.
  if (ideas.length === 0) {
    return (
      <View style={styles.screen}>
        <Header top={insets.top} own={own} onMenu={() => setMenu(true)} onShare={undefined} />
        <View style={styles.cold}>
          <Text style={styles.coldTitle}>Talk to {project.name}</Text>
          <Text style={[text.body, styles.secondary, styles.coldLine]}>Only this project hears it. Ivy files what you say here.</Text>
          <Pressable onPress={talk} style={styles.coldMic} accessibilityRole="button" accessibilityLabel={`Talk to ${project.name}`}>
            <SymbolView name="mic" tintColor={hero.ink} size={30} />
          </Pressable>
        </View>
        {menu && <ProjectMenu top={insets.top + 10} onClose={() => setMenu(false)} onRename={rename} onDelete={remove} />}
      </View>
    )
  }

  const share = () => Share.share({ message: [project.name, '', ...ideas.map((i) => `• ${i.title}`)].join('\n') })

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <Header top={insets.top} own={own} onMenu={() => setMenu(true)} onShare={share} />
        <View style={styles.body}>
          <Text style={styles.name}>{project.name}</Text>
          <View style={styles.metaRow}>
            <View style={styles.private}>
              <SymbolView name="lock" tintColor={hero.ink} size={14} />
              <Text style={styles.privateLabel}>Private project</Text>
            </View>
            <Text style={styles.count}>{countLine(ideas.length, boards)}</Text>
          </View>
          {error && <Text style={[text.caption, styles.secondary, { marginTop: 8 }]}>{error}</Text>}

          <View style={styles.tabs} accessibilityRole="tablist">
            <Tab label="All ideas" on={tab === 'all'} onPress={() => setTab('all')} />
            <Tab label="More ideas" on={tab === 'more'} onPress={() => setTab('more')} />
          </View>

          {tab === 'all' ? (
            <View style={styles.columns}>
              {[left, right].map((col, c) => (
                <View key={c} style={{ width: TILE_WIDTH }}>
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
            <Text style={[text.body, styles.secondary]}>
              Ideas from other creators, picked for {project.name} and your style, will show here once Rising opens.
            </Text>
          )}
        </View>
      </ScrollView>

      <Pressable onPress={talk} style={[styles.talk, { bottom: insets.bottom + 2 }]} accessibilityRole="button" accessibilityLabel={`Talk to ${project.name}`}>
        <View style={styles.talkMic}>
          <SymbolView name="mic" tintColor={hero.ink} size={22} />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.talkTitle} numberOfLines={1}>
            Talk to {project.name}
          </Text>
          <Text style={styles.talkSub}>only this project hears it</Text>
        </View>
      </Pressable>

      {menu && <ProjectMenu top={insets.top + 10} onClose={() => setMenu(false)} onRename={rename} onDelete={remove} />}
    </View>
  )
}

function Header({ top, own, onMenu, onShare }: { top: number; own: boolean; onMenu: () => void; onShare?: () => void }) {
  return (
    <View style={[styles.header, { marginTop: top }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
        <SymbolView name="chevron.left" tintColor={hero.ink} size={20} weight="semibold" />
      </Pressable>
      <View style={styles.headerRight}>
        {onShare && (
          <Pressable onPress={onShare} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share">
            <SymbolView name="square.and.arrow.up" tintColor={hero.ink} size={22} />
          </Pressable>
        )}
        {own && (
          <Pressable onPress={onMenu} hitSlop={10} accessibilityRole="button" accessibilityLabel="More">
            <SymbolView name="ellipsis" tintColor={hero.ink} size={22} />
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
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }}>
      <Text style={[styles.tab, on && styles.tabOn]}>{label}</Text>
      <View style={[styles.tabRule, !on && { opacity: 0 }]} />
    </Pressable>
  )
}

// Figma 83:603 — header icons 24 at y 62; name Bold 34; Private chip fill 29 high radius 8, lock 16, Medium 14;
// count Regular 14 secondary; tabs 17 (active Semibold, 2.5 rule under it), 28 apart; tiles 170 wide, 16 apart,
// from y 296; Talk pill 230 × 60 white, radius 30, shadow, lime 44 mic, Semibold 15 + Regular 11 secondary.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  secondary: { color: hero.secondary },
  header: { height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  body: { paddingHorizontal: 20 },
  name: { fontSize: 34, fontWeight: '700', letterSpacing: -0.8, color: hero.ink, marginTop: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  private: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 29, borderRadius: 8, paddingHorizontal: 10, backgroundColor: hero.fill },
  privateLabel: { fontSize: 14, fontWeight: '500', color: hero.ink },
  count: { fontSize: 14, color: hero.secondary },
  tabs: { flexDirection: 'row', gap: 28, marginTop: 21, marginBottom: 20 },
  tab: { fontSize: 17, color: hero.ink },
  tabOn: { fontWeight: '600' },
  tabRule: { height: 2.5, borderRadius: 1.25, backgroundColor: hero.ink, marginTop: 6 },
  columns: { flexDirection: 'row', justifyContent: 'space-between' },
  talk: {
    position: 'absolute',
    alignSelf: 'center',
    width: 230,
    height: 60,
    borderRadius: 30,
    backgroundColor: hero.room,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 8,
    paddingRight: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  talkMic: { width: 44, height: 44, borderRadius: 22, backgroundColor: hero.lime, alignItems: 'center', justifyContent: 'center' },
  talkTitle: { fontSize: 15, fontWeight: '600', color: hero.ink },
  talkSub: { fontSize: 11, color: hero.secondary, marginTop: 2 },
  cold: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 },
  coldTitle: { fontSize: 22, fontWeight: '700', color: hero.ink, textAlign: 'center' },
  coldLine: { textAlign: 'center', marginTop: 8 },
  coldMic: { marginTop: 48, width: 84, height: 84, borderRadius: 42, backgroundColor: hero.lime, alignItems: 'center', justifyContent: 'center' },
})
