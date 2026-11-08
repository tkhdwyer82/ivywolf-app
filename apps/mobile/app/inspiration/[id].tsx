// apps/mobile/app/inspiration/[id].tsx
// One Ivy library item's page (inspiration demo), laid out as the idea page (B.8a I1):
//   1. The picture, as a card: below the status bar, 8 in from each side, r32, at its own aspect ratio (capped at
//      75 % of the screen, at least 300). A clip plays muted and looping. Over it only the frosted back square.
//   2. What it is: the caption (Regular 15/21), then "Ivy library · {shot}" grey, its keywords and its colours as chips.
//   3. More like this: GET /api/inspiration/{id}/more — pictures that look alike alternated with ones of the same
//      look, never this one, near-duplicates never side by side — in the library masonry. Each opens its own page.
// The item comes from what search already fetched (lib/inspiration.ts recall); its signed URL lasts an hour, so a
// page opened later than that asks her to search again rather than show a dead picture.

import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useAuth } from '@clerk/clerk-expo'
import { colour, space } from '@ivywolf/ui'
import { moreLikeThis, recall, shotLabel, type InspirationItem } from '@/lib/inspiration'
import { Clip, LibraryGrid } from '@/components/InspirationTile'
import { FrostSquare } from '@/components/FrostSquare'
import { useTileWidth } from '@/components/Tile'

const GREY = '#6E6E73'
const SOFT = '#F2F2F7'
// The idea page's measurements (app/idea/[id].tsx): card 8 in and 8 down, r32, 4:5 until the picture says otherwise,
// 300 to 75 % of the screen; 20 side padding under it; the frosted squares 16 in from the card's corner.
const CARD_INSET = 8
const CARD_TOP = 8
const CARD_RADIUS = 32
const RATIO = 1.25
const PICTURE_MIN = 300
const PICTURE_MAX = 0.75
const PAD = 20
const CHROME_INSET = 16

export default function LibraryItemPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const screen = useWindowDimensions()
  const tileWidth = useTileWidth()
  const { getToken } = useAuth()
  const tokenRef = useRef(getToken)
  tokenRef.current = getToken
  const [item] = useState<InspirationItem | null>(() => recall(id))
  const [more, setMore] = useState<InspirationItem[] | null>(null)
  const [moreError, setMoreError] = useState(false)

  // More like this: one fetch per item. A reply for an item she's left is dropped.
  useEffect(() => {
    let live = true
    setMore(null)
    setMoreError(false)
    tokenRef
      .current()
      .then((token) => (token ? moreLikeThis(token, id) : []))
      .then((m) => live && setMore(m))
      .catch(() => live && setMoreError(true))
    return () => {
      live = false
    }
  }, [id])

  const cardW = screen.width - 2 * CARD_INSET
  const ratio = item?.width && item.height ? item.height / item.width : RATIO
  const pictureH = Math.round(Math.min(Math.max(cardW * ratio, PICTURE_MIN), screen.height * PICTURE_MAX))
  const back = <FrostSquare icon="chevron.left" label="Back" onPress={() => router.back()} testID="library-back" />

  if (!item) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <Text style={[styles.caption, styles.grey, styles.centerText]}>This picture’s link has expired. Go back and search again.</Text>
        <View style={[styles.chrome, { top: insets.top + CARD_TOP + CHROME_INSET }]}>{back}</View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingTop: insets.top + CARD_TOP, paddingBottom: insets.bottom + space.section }}>
        {/* 1. The picture */}
        <View style={[styles.picture, { width: cardW, height: pictureH }]} testID={item.kind === 'video' ? 'library-clip' : 'library-picture'}>
          {item.kind === 'video' ? (
            <Clip uri={item.url} />
          ) : (
            <Image source={{ uri: item.url }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
          )}
        </View>

        {/* 2. What it is */}
        <View style={styles.body}>
          <Text style={styles.caption} accessibilityRole="header">
            {item.caption}
          </Text>
          <Text style={styles.meta}>
            Ivy library · {shotLabel(item.shot)}
            {item.kind === 'video' ? ' · Clip' : ''}
          </Text>
          <View style={styles.chips}>
            {item.keywords.map((k) => (
              <View key={k} style={styles.chip}>
                <Text style={styles.chipText}>{k}</Text>
              </View>
            ))}
          </View>
          <View style={styles.chips}>
            {item.colours.map((c) => (
              <View key={c} style={[styles.chip, styles.colourChip]}>
                <Text style={styles.chipText}>{c}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 3. More like this */}
        <View testID="more-like-this">
          <Text style={styles.header} accessibilityRole="header">
            More like this
          </Text>
          <View style={styles.grid}>
            {more ? (
              more.length > 0 ? (
                <LibraryGrid items={more} tileWidth={tileWidth} />
              ) : (
                <Text style={[styles.small, styles.grey]}>Nothing else looks like this yet.</Text>
              )
            ) : moreError ? (
              <Text style={[styles.small, styles.grey]}>More like this didn’t load.</Text>
            ) : (
              <ActivityIndicator color={colour.Ink} />
            )}
          </View>
        </View>
      </ScrollView>

      {/* The status bar sits on the page: the picture scrolls under this band, never under the clock. */}
      <View style={[styles.statusBand, { height: insets.top }]} pointerEvents="none" />
      <View style={[styles.chrome, { top: insets.top + CARD_TOP + CHROME_INSET }]} pointerEvents="box-none">
        {back}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center', padding: PAD },
  centerText: { textAlign: 'center' },
  grey: { color: GREY },
  picture: { alignSelf: 'center', borderRadius: CARD_RADIUS, overflow: 'hidden', backgroundColor: SOFT },
  statusBand: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colour.Surface },
  chrome: { position: 'absolute', left: CARD_INSET + CHROME_INSET, right: CARD_INSET + CHROME_INSET, flexDirection: 'row' },
  body: { paddingHorizontal: PAD, paddingTop: 20 },
  caption: { fontSize: 15, lineHeight: 21, color: colour.Ink },
  meta: { fontSize: 13, color: GREY, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { height: 28, borderRadius: 14, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: SOFT },
  colourChip: { borderWidth: 1, borderColor: SOFT, backgroundColor: colour.Surface },
  chipText: { fontSize: 13, color: colour.Ink },
  small: { fontSize: 13 },
  // The idea page's section header: Semibold 20 ink, 36 above, 12 below.
  header: { fontSize: 20, fontWeight: '600', color: colour.Ink, marginTop: 36, marginBottom: 12, paddingHorizontal: PAD },
  grid: { paddingHorizontal: space.margin },
})
