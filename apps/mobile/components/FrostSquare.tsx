// apps/mobile/components/FrostSquare.tsx
// A 48 button over a photo — the idea page's back and •••, and any square that sits on a picture later (a search-visual
// square too). Pinterest's and Instagram's frosted squares: the photo blurred (expo-blur, 40), under #F2F2F7 at 0.85,
// r14, with a 1 pt ink hairline at 6 % so it reads on any photo — a white one included (B.8a, build 30).

import { Pressable, StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { colour } from '@ivywolf/ui'

export const FROST_SQUARE = 48
const BLUR = 40
// A symbol's glyph draws at about 0.8 of its size: 30 is a 24 pt glyph, at stroke 2 (medium).
const SYMBOL = 30

export function FrostSquare({ icon, label, onPress, testID }: { icon: SFSymbol; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.square} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <BlurView intensity={BLUR} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.fill]} />
      <SymbolView name={icon} tintColor={colour.Ink} size={SYMBOL} weight="medium" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // The hairline is the square's own border, drawn over the blur and the fill.
  square: {
    width: FROST_SQUARE,
    height: FROST_SQUARE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(29,29,31,0.06)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { backgroundColor: 'rgba(242,242,247,0.85)' },
})
