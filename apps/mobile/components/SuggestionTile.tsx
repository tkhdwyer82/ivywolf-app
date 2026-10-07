// apps/mobile/components/SuggestionTile.tsx
// A suggestion on More ideas (P12b, Figma 202:22–46): exactly an idea tile plus one small pin, bottom-right — the
// only thing that tells it from her own. No text. Tap opens it (P12c); hold for the arc (Job C+, 1453:325: Keep ·
// Not for this project · Link ideas · Share). Its height follows the same stable rhythm as her ideas.
// The pin is white: lime is never a card colour (Job C+).

import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native'
import { Image } from 'expo-image'
import { SymbolView } from 'expo-symbols'
import { colour, radius, size } from '@ivywolf/ui'
import { Shimmer } from '@/components/Shimmer'
import { tileHeight } from '@/lib/home'
import type { Suggestion } from '@/lib/suggestions'
import { HOLD_MS } from '@/components/HoldArc'

// Figma 202:22 (204:2) — measured, not tokens: the pin sits 10 in from the tile's bottom-right corner; its + is 18.
const PIN_INSET = 10
const PIN_GLYPH = 18

export function SuggestionTile({
  suggestion,
  onOpen,
  onLongPress,
  width,
}: {
  suggestion: Suggestion
  onOpen?: (s: Suggestion) => void
  /** Hold for the arc. */
  onLongPress?: (e: GestureResponderEvent) => void
  width?: number
}) {
  return (
    <Pressable
      onPress={onOpen ? () => onOpen(suggestion) : undefined}
      onLongPress={onLongPress}
      delayLongPress={HOLD_MS}
      accessibilityRole="button"
      accessibilityLabel={suggestion.title}
      accessibilityHint="Suggested for this thread. Hold to keep it, set it aside, link it or share it."
      style={[styles.tile, { height: tileHeight(suggestion.id) }, width !== undefined && { width }]}
      testID={`suggestion-${suggestion.id}`}
    >
      <Shimmer style={StyleSheet.absoluteFill} />
      {!!suggestion.frameUrl && (
        <Image
          source={{ uri: suggestion.frameUrl }}
          recyclingKey={suggestion.id}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          accessibilityIgnoresInvertColors
        />
      )}
      <View style={styles.pin} testID="suggestion-pin">
        <SymbolView name="plus" tintColor={colour.Ink} size={PIN_GLYPH} weight="semibold" />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colour.Shimmer },
  pin: {
    position: 'absolute',
    right: PIN_INSET,
    bottom: PIN_INSET,
    width: size.pin,
    height: size.pin,
    borderRadius: size.pin / 2,
    backgroundColor: colour.Surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
