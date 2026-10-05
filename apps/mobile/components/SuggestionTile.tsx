// apps/mobile/components/SuggestionTile.tsx
// A suggestion on More ideas (P12b, Figma 202:22–46): exactly an idea tile plus one small lime pin, bottom-right —
// the only thing that tells it from her own. No text. Tap opens it (P12c); long-press hides it (a negative signal,
// no UI). Its height follows the same stable rhythm as her ideas.

import { Pressable, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { SymbolView } from 'expo-symbols'
import { colour, radius, size } from '@ivywolf/ui'
import { Shimmer } from '@/components/Shimmer'
import { tileHeight } from '@/lib/home'
import type { Suggestion } from '@/lib/suggestions'

// Figma 202:22 (204:2) — measured, not tokens: the pin sits 10 in from the tile's bottom-right corner; its + is 18.
const PIN_INSET = 10
const PIN_GLYPH = 18

export function SuggestionTile({
  suggestion,
  onOpen,
  onHide,
  width,
}: {
  suggestion: Suggestion
  onOpen: (s: Suggestion) => void
  onHide: (s: Suggestion) => void
  width?: number
}) {
  return (
    <Pressable
      onPress={() => onOpen(suggestion)}
      onLongPress={() => onHide(suggestion)}
      accessibilityRole="button"
      accessibilityLabel={suggestion.title}
      accessibilityHint="Suggested for this thread. Hold to hide it."
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
    backgroundColor: colour.Lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
