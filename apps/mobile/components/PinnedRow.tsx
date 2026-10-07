// apps/mobile/components/PinnedRow.tsx
// Pin to top (Job C+, Figma 1461:133): a PINNED overline and the pinned cards, newest pin first — one across the
// whole width, more in a row that scrolls sideways. Above Today on Home, and at the top of a project.

import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colour, space, type } from '@ivywolf/ui'
import type { CardItem } from '@/lib/home'

/** Two or more: each card this share of the row, so the next one peeks in. */
const PEEK = 0.78

export function PinnedRow({ cards, render }: { cards: CardItem[]; render: (card: CardItem, width: number) => ReactNode }) {
  const { width } = useWindowDimensions()
  if (cards.length === 0) return null
  const full = width - space.margin * 2
  const each = cards.length === 1 ? full : Math.round(full * PEEK)
  return (
    <View style={styles.wrap}>
      <Text style={styles.overline}>PINNED</Text>
      {cards.length === 1 ? (
        <View style={styles.one}>{render(cards[0], each)}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {cards.map((c) => (
            <View key={c.id} style={{ width: each }}>
              {render(c, each)}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

/** Pinned cards, newest pin first. */
export const pinnedOf = <T extends { kind: string; pinnedAt?: string | null }>(items: T[]): (T & CardItem)[] =>
  items
    .filter((i): i is T & CardItem => i.kind === 'card' && !!i.pinnedAt)
    .sort((a, b) => (a.pinnedAt! < b.pinnedAt! ? 1 : -1))

// 1461:133 — measured: the overline 10 above the card, the row 20 above the chips.
const styles = StyleSheet.create({
  wrap: { marginTop: space.stack },
  overline: { ...type['Label / Overline'], color: colour.Grey, textTransform: 'uppercase', marginHorizontal: space.margin, marginBottom: 10 },
  one: { marginHorizontal: space.margin },
  row: { paddingHorizontal: space.margin, gap: space.gutter },
})
