// apps/mobile/components/InspirationTile.tsx
// One Ivy library item in a masonry (the test screen, a tile page's More like this, the idea page's Ivy library row):
// the picture alone, portrait-first (lib/inspiration.ts tileRatio — wider than 4:5 is cropped to 4:5), corners as
// Home's tiles. A clip plays on its own, muted and looping, from the moment it's on screen. Tap opens its page.
// The caption is the accessibility label, so VoiceOver reads what's in it.

import { Pressable, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { router } from 'expo-router'
import { colour, radius, space } from '@ivywolf/ui'
import { libraryColumns, tileRatio, type InspirationItem } from '@/lib/inspiration'

export function InspirationTile({ item, width, onOpen }: { item: InspirationItem; width: number; onOpen: (item: InspirationItem) => void }) {
  const height = Math.round(width * tileRatio(item))
  return (
    <Pressable
      onPress={() => onOpen(item)}
      style={({ pressed }) => [styles.tile, { width, height }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={item.kind === 'video' ? `Clip: ${item.caption}` : item.caption}
      testID={`library-tile-${item.id}`}
    >
      {item.kind === 'video' ? <Clip uri={item.url} /> : <Image source={{ uri: item.url }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.id} transition={150} accessibilityIgnoresInvertColors />}
    </Pressable>
  )
}

/** A clip: muted, looping, playing as soon as it loads; no controls. Also the tile page's hero. */
export function Clip({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true
    p.loop = true
    p.play()
  })
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
    </View>
  )
}

/** Two columns of library tiles (lib/inspiration.ts libraryColumns), each opening its own page. */
export function LibraryGrid({ items, tileWidth }: { items: InspirationItem[]; tileWidth: number }) {
  return (
    <View style={styles.columns}>
      {libraryColumns(items).map((col, c) => (
        <View key={c} style={{ width: tileWidth }}>
          {col.map((item) => (
            <View key={item.id} style={styles.cell}>
              <InspirationTile item={item} width={tileWidth} onOpen={(i) => router.push(`/inspiration/${i.id}`)} />
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { marginBottom: space.gutter },
  tile: { borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colour.Chip },
  pressed: { opacity: 0.85 },
})
