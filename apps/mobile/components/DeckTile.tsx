// apps/mobile/components/DeckTile.tsx
// A deck (Home v4, Figma 1742:2 deck, 1742:75 swiping): an idea with at least one link sits on top of the ideas it's
// linked to. Two are visible at most — the top card, and the first link peeking 6 up and 6 in from the right at
// 70 % — with "🔗 N" top right. A horizontal swipe pages through the links inside the tile's own slot (the slot
// clips, so the masonry never moves), with dots while she's off the top card; the words under it follow the page.
// While it's swiped, Home draws the deck's link lines (components/LinkMode.tsx LinkLines): the active link's in its
// project's hue at full colour, the others at 25 %. Errands never deck (lib/home.ts deckOf).

import { useState } from 'react'
import { StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
// Gesture Handler's ScrollView: inside the hold arc's detector it takes a sideways swipe (and cancels the tile's tap);
// React Native's own lost it to the tap.
import { ScrollView } from 'react-native-gesture-handler'
import { colour } from '@ivywolf/ui'
import type { CardItem } from '@/lib/home'
import type { Picture } from '@/lib/picture'
import { IdeaCaption, IdeaPicture, pictureBox } from '@/components/IdeaTile'

export function DeckTile({
  card,
  deck,
  height,
  page,
  onPage,
  onSwiping,
  trio,
  pinned,
  onCredit,
  overlay = false,
}: {
  card: CardItem
  /** The ideas it's linked to, in page order. */
  deck: CardItem[]
  height: number
  /** 0 is the card itself; 1… its links. */
  page: number
  onPage: (page: number) => void
  /** A swipe began (true) or settled (false). */
  onSwiping?: (swiping: boolean) => void
  trio?: Picture[]
  pinned?: boolean
  onCredit?: (p: Picture) => void
  /** Each page carries its project's name when filed (B.5). */
  overlay?: boolean
}) {
  const [width, setWidth] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const pages = [card, ...deck]
  const shown = pages[Math.min(page, pages.length - 1)]

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = width ? Math.round(e.nativeEvent.contentOffset.x / width) : 0
    setSwiping(false)
    onSwiping?.(false)
    if (p !== page) onPage(p)
  }

  return (
    <View>
      <View style={{ height }}>
        {page === 0 && !swiping && deck[0] && (
          <View style={[pictureBox(), styles.peek, { height }]} pointerEvents="none" accessibilityElementsHidden>
            <IdeaPicture card={deck[0]} />
          </View>
        )}
        <View style={[pictureBox(), { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              directionalLockEnabled
              onScrollBeginDrag={() => {
                setSwiping(true)
                onSwiping?.(true)
              }}
              onMomentumScrollEnd={settle}
              accessibilityLabel={`${card.title}, and ${deck.length} linked ${deck.length === 1 ? 'idea' : 'ideas'}. Swipe to see them.`}
              testID={`deck-${card.id}`}
            >
              {pages.map((c, i) => (
                <View key={c.id} style={{ width, height }}>
                  <IdeaPicture card={c} trio={i === 0 ? trio : undefined} pinned={i === 0 && pinned} badged overlay={overlay} />
                </View>
              ))}
            </ScrollView>
          )}
          <View style={styles.badge} pointerEvents="none">
            <Text style={styles.badgeText}>{`🔗 ${deck.length}`}</Text>
          </View>
          {(swiping || page > 0) && (
            <View style={styles.dots} pointerEvents="none">
              {pages.map((c, i) => (
                <View key={c.id} style={[styles.dot, i === page && styles.dotOn]} />
              ))}
            </View>
          )}
        </View>
      </View>
      <IdeaCaption card={shown} onCredit={onCredit} />
    </View>
  )
}

// Figma 1742:2 / 1742:75 — measured: the peek 6 up and 6 in each side (158 of 170), at 70 %; the badge #3380FF,
// Semibold 11 white, 9 × 4, radius 12, 10 in from the top right; the dots 6 across, 11 apart, white and white at 45 %,
// 8 from the bottom.
const PEEK = 6
const DOT = 6

const styles = StyleSheet.create({
  peek: { position: 'absolute', left: PEEK, right: PEEK, top: -PEEK, opacity: 0.7 },
  badge: { position: 'absolute', top: 10, right: 10, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: '#3380FF' },
  badgeText: { fontSize: 11, fontWeight: '600', color: colour.Surface },
  dots: { position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', gap: 11 - DOT },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { backgroundColor: colour.Surface },
})

