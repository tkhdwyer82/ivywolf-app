// apps/mobile/components/Tile.tsx
// One pin in a masonry (Home P1, a project's All ideas, search).
//   Idea tile  — the form the idea takes (Job B revised, Figma 227:5): photo, quote, diagram, board or text, drawn by
//                CardFace. A photo shows the Shimmer until it lands, then its title and Unsplash credit under it.
//                Tap opens the idea page; a quote's ▶ chip plays from where it was said.
//                Below 0.6 confidence the tile is greyed (the idea page says "Ivy isn't sure").
//   To-do tile — no frame: Heading / Card title, the Caption meta ("My things · Thu"), and a calendar only when a
//                date was heard (L3b, Figma 209:17).
// The title is still the tile's accessibility label, so VoiceOver reads it; it isn't drawn.

import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { LOW_CONFIDENCE } from '@ivywolf/schema'
import { colour, radius, space, type } from '@ivywolf/ui'
import { frameHeight, type Item } from '@/lib/home'
import { CardFace } from '@/components/CardFace'

/**
 * Two columns, always (never three): margin + tile + gutter + tile + margin fills the screen. Figma draws size/tile-w
 * 181 at 393, which adds up to 394; at 393 this gives 180.5, and wider phones grow the tile.
 */
export function useTileWidth(): number {
  const { width } = useWindowDimensions()
  return (width - space.margin * 2 - space.gutter) / 2
}

// L3b (Figma 209:17) — measured, not tokens: to-do content 14 in from the tile's edges, the calendar 24, the meta 6
// under the title; the unsure grey is half opacity.
const TODO_PAD = 14
const TODO_ICON = 24
const TODO_META_GAP = 6
const UNSURE_OPACITY = 0.5

export function Tile({
  item,
  meta,
  onOpen,
  onPlay,
  playing,
  width,
}: {
  item: Item
  /** A to-do's meta line ("My things · Thu"). Ideas carry no text. */
  meta?: string
  /** Opens the idea (P9) or the to-do (P17). */
  onOpen?: (item: Item) => void
  /** A quote card's ▶ chip: play from play_from_ms. */
  onPlay?: (item: Item) => void
  /** This card's audio is playing (the chip shows pause). */
  playing?: boolean
  /** Omit to fill the parent (a masonry cell). */
  width?: number
}) {
  const open = onOpen ? () => onOpen(item) : undefined

  if (item.kind === 'action') {
    return (
      <Pressable onPress={open} disabled={!open} accessibilityRole={open ? 'button' : undefined} style={[styles.todo, width !== undefined && { width }]} testID={`tile-${item.id}`}>
        <View style={styles.todoTop}>
          <Text style={styles.todoTitle} numberOfLines={3}>
            {item.text}
          </Text>
          {item.dueDate && !item.done && <SymbolView name="calendar" tintColor={colour.Ink} size={TODO_ICON} />}
        </View>
        {!!meta && <Text style={styles.todoMeta}>{meta}</Text>}
      </Pressable>
    )
  }

  const unsure = item.confidence < LOW_CONFIDENCE
  return (
    <Pressable
      onPress={open}
      disabled={!open}
      accessibilityRole={open ? 'button' : undefined}
      accessibilityLabel={unsure ? `${item.title}. Ivy isn’t sure.` : item.title}
      style={[width !== undefined && { width }, unsure && styles.unsure]}
      testID={`tile-${item.id}`}
    >
      <CardFace card={item} photoHeight={frameHeight(item)} playing={playing} onPlay={onPlay && item.storagePath ? () => onPlay(item) : undefined} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  unsure: { opacity: UNSURE_OPACITY },
  todo: { borderRadius: radius.tile, backgroundColor: colour.Chip, padding: TODO_PAD },
  todoTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.stack },
  todoTitle: { ...type['Heading / Card'], flex: 1 },
  todoMeta: { ...type['Caption'], marginTop: TODO_META_GAP },
})
