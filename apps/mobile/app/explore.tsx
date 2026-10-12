// apps/mobile/app/explore.tsx
// Explore (Home v4, H2 1737:164; feed 1464:5): a nav tab, feed only. The header, "Turning ideas into
// masterpieces.", a search over ideas and tools, the kind chips, and the tool tiles — each loops its official
// sample video (lib/explore.ts VIDEOS; a flat placeholder until the file is in), with "Connected ✓" on the
// Higgsfield-run tools and "Coming soon" on anything not live. Tap a live tool → Pick an idea (1464:124); a tool page
// isn't built yet. Nothing here spends credits.

import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { colour, size } from '@ivywolf/ui'
import { CATEGORIES, filterTools, TOOLS, toolLine, VIDEOS, type Category, type Tool } from '@/lib/explore'
import { GRID } from '@/lib/home'
import { Nav } from '@/components/Nav'
import { BAR_BOTTOM } from '@/components/ActionBar'
import { PickIdeaSheet } from '@/components/PickIdeaSheet'

export default function Explore() {
  const insets = useSafeAreaInsets()
  const [category, setCategory] = useState<Category>('All')
  const [q, setQ] = useState('')
  const [trying, setTrying] = useState<Tool | null>(null)
  const tools = useMemo(() => filterTools(TOOLS, category, q), [category, q])
  const [left, right] = useMemo(() => columns(tools), [tools])

  const searchIdeas = () => {
    if (q.trim()) router.push({ pathname: '/search', params: { q: q.trim() } })
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + HEADER_TOP, paddingBottom: BAR_BOTTOM + size['bar-h'] + GRID.after * 2 }} keyboardDismissMode="on-drag">
        <Text style={styles.title} accessibilityRole="header">
          Explore
        </Text>
        <Text style={styles.subtitle}>Turning ideas into masterpieces.</Text>

        <View style={styles.search}>
          <Image source={require('@/assets/figma/l1-search.svg')} style={styles.searchIcon} tintColor={colour.Grey} accessibilityElementsHidden />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={searchIdeas}
            placeholder="Search ideas and tools"
            placeholderTextColor={colour.Grey}
            returnKeyType="search"
            style={styles.searchText}
            accessibilityLabel="Search ideas and tools"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORIES.map((c) => {
            const on = c === category
            return (
              <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{c}</Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {!!q.trim() && (
          <Pressable onPress={searchIdeas} style={styles.ideasRow} accessibilityRole="button">
            <Text style={styles.ideasText}>Search your ideas for “{q.trim()}”</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}

        <View style={styles.grid}>
          {[left, right].map((col, i) => (
            <View key={i} style={styles.column}>
              {col.map((t) => (
                <ToolTile key={t.key} tool={t} onTry={() => setTrying(t)} />
              ))}
            </View>
          ))}
        </View>
        {tools.length === 0 && <Text style={styles.empty}>No tools match “{q.trim()}”.</Text>}
      </ScrollView>

      <Nav room="explore" />
      {trying && <PickIdeaSheet tool={trying} onClose={() => setTrying(null)} />}
    </View>
  )
}

/** Two columns, each tile into the shorter one. */
function columns(tools: Tool[]): [Tool[], Tool[]] {
  const cols: [Tool[], Tool[]] = [[], []]
  const h = [0, 0]
  for (const t of tools) {
    const c = h[0] <= h[1] ? 0 : 1
    cols[c].push(t)
    h[c] += t.height + CAPTION
  }
  return cols
}

function ToolTile({ tool, onTry }: { tool: Tool; onTry: () => void }) {
  const video = VIDEOS[tool.key]
  return (
    <Pressable
      onPress={tool.live ? onTry : undefined}
      disabled={!tool.live}
      accessibilityRole="button"
      accessibilityLabel={`${tool.name}. ${toolLine(tool)}.${tool.live ? '' : ' Coming soon.'}`}
      accessibilityHint={tool.live ? 'Pick an idea to try it on.' : undefined}
      testID={`tool-${tool.key}`}
    >
      <View style={[styles.tile, { height: tool.height, backgroundColor: tool.placeholder }]}>
        {video !== undefined && <Loop source={video} />}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{tool.live ? 'Connected ✓' : 'Coming soon'}</Text>
        </View>
        <View style={styles.play}>
          <Image source={require('@/assets/figma/explore-play.svg')} style={styles.playIcon} accessibilityElementsHidden />
        </View>
        <Text style={styles.looping}>LOOPING RESULTS</Text>
      </View>
      <Text style={styles.name}>{tool.name}</Text>
      <Text style={styles.line} numberOfLines={2}>
        {toolLine(tool)}
      </Text>
    </Pressable>
  )
}

/** The tool's sample, looping, muted. */
function Loop({ source }: { source: number }) {
  const player = useVideoPlayer(source, (p) => {
    p.muted = true
    p.loop = true
    p.play()
  })
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} pointerEvents="none" />
}

// Figma 1737:164 — measured: "Explore" Bold 28 at 54 (the status bar is 44 of it), the line Regular 15 grey; the
// search 353 × 40 at radius 20 on #F2F2F0 with a 16 magnifier 14 in and Regular 14; chips 30 tall, 12 × 7, radius 20,
// Semibold 13, 8 apart, ink when selected; tiles 170 wide at radius 18, 13 apart; the play disc 26 at white 90 % with
// a 12 glyph, 10 in; the badge white, Semibold 9, 8 × 4, radius 20; "LOOPING RESULTS" Bold 9 at white 80 %, 10 in;
// the name Semibold 14 8 under the tile, the line Regular 11 grey.
const HEADER_TOP = 10
const FIELD = '#F2F2F0'
const CAPTION = 8 + 17 + 2 + 26 + GRID.after

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  title: { fontSize: 28, fontWeight: '700', color: colour.Ink, marginHorizontal: GRID.margin },
  subtitle: { fontSize: 15, color: colour.Grey, marginHorizontal: GRID.margin, marginTop: 6 },
  search: { height: 40, borderRadius: 20, backgroundColor: FIELD, marginHorizontal: GRID.margin, marginTop: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  searchIcon: { width: 16, height: 16 },
  searchText: { flex: 1, fontSize: 14, color: colour.Ink },
  chips: { paddingHorizontal: GRID.margin, gap: 8, paddingVertical: 12 },
  chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: FIELD },
  chipOn: { backgroundColor: colour.Ink },
  chipText: { fontSize: 13, fontWeight: '600', color: colour.Ink },
  chipTextOn: { color: colour.Surface },
  ideasRow: { marginHorizontal: GRID.margin, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  ideasText: { flex: 1, fontSize: 15, fontWeight: '600', color: colour.Ink },
  chevron: { fontSize: 22, fontWeight: '600', color: colour.Grey },
  grid: { flexDirection: 'row', gap: GRID.gutter, paddingHorizontal: GRID.margin, paddingTop: 6 },
  column: { flex: 1 },
  tile: { borderRadius: 18, borderCurve: 'continuous', overflow: 'hidden' },
  badge: { position: 'absolute', left: 10, top: 10, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colour.Surface },
  badgeText: { fontSize: 9, fontWeight: '600', color: colour.Ink },
  play: { position: 'absolute', right: 10, top: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  playIcon: { width: 12, height: 12 },
  looping: { position: 'absolute', left: 10, bottom: 10, fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  name: { fontSize: 14, fontWeight: '600', color: colour.Ink, marginTop: 8 },
  line: { fontSize: 11, color: colour.Grey, marginTop: 2, marginBottom: GRID.after },
  empty: { fontSize: 15, color: colour.Grey, marginHorizontal: GRID.margin, marginTop: 20 },
})
