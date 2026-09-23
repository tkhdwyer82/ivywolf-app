// apps/mobile/components/Tile.tsx
// One pin in Home's masonry (P1): the frame on top, title and meta under it. Every tile has a frame (rule 6):
// the generated one, or — while it's coming, when the idea was abstract, or if drawing failed — the title set in
// the palette. Ideas get a play-from-here button; to-dos a lime TO-DO / DONE pill. Below 0.6 confidence the
// tile is greyed with "Ivy isn't sure" (pipeline invariant).

import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { LOW_CONFIDENCE } from '@ivywolf/schema'
import { hero, text } from '@/lib/theme'
import { frameHeight, type Item } from '@/lib/home'

export const TILE_WIDTH = 170

export function Tile({
  item,
  meta,
  playing,
  onPlay,
  onOpen,
}: {
  item: Item
  meta: string
  playing: boolean
  onPlay: (item: Item) => void
  /** Opens the idea (P9). To-dos open P17 once it exists. */
  onOpen?: (item: Item) => void
}) {
  const title = item.kind === 'card' ? item.title : item.text
  const unsure = item.kind === 'card' && item.confidence < LOW_CONFIDENCE
  const height = frameHeight(item)
  const drawn = item.frameStatus === 'done' && !!item.frameUrl

  return (
    <Pressable
      onPress={onOpen ? () => onOpen(item) : undefined}
      disabled={!onOpen}
      accessibilityRole={onOpen ? 'button' : undefined}
      style={[styles.tile, unsure && styles.unsure]}
    >
      <View style={[styles.frame, { height }]}>
        {drawn ? (
          <Image source={{ uri: item.frameUrl! }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={styles.typographic}>
            <Text style={[text.headingCard, styles.typographicTitle]} numberOfLines={5}>
              {title}
            </Text>
          </View>
        )}
        {item.kind === 'action' && (
          <View style={styles.pill}>
            <Text style={text.labelPill}>{item.done ? 'Done' : 'To-do'}</Text>
          </View>
        )}
        {item.kind === 'card' && item.storagePath && (
          <Pressable
            onPress={() => onPlay(item)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play from here'}
            style={styles.play}
          >
            <SymbolView name={playing ? 'pause.fill' : 'play.fill'} tintColor={hero.ink} size={14} />
          </Pressable>
        )}
      </View>
      <Text style={[text.bodySmall, styles.title]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {unsure ? 'Ivy isn’t sure' : meta}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tile: { width: TILE_WIDTH, marginBottom: 16 },
  unsure: { opacity: 0.5 },
  frame: { borderRadius: 16, overflow: 'hidden', backgroundColor: hero.fill },
  typographic: { flex: 1, padding: 14, justifyContent: 'flex-end', backgroundColor: hero.fill, borderLeftWidth: 4, borderLeftColor: hero.lime },
  typographicTitle: { color: hero.ink },
  pill: { position: 'absolute', left: 10, top: 10, backgroundColor: hero.lime, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  play: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Figma: SF Pro Semibold 13 for the title, Regular 11 in secondary for the meta.
  title: { fontWeight: '600', marginTop: 8, marginHorizontal: 4, width: 140 },
  meta: { fontSize: 11, lineHeight: 14, color: hero.secondary, marginTop: 2, marginHorizontal: 4 },
})
