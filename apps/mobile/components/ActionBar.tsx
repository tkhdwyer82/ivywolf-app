// apps/mobile/components/ActionBar.tsx
// The floating action bar on Idea (L4b, Figma 209:36) and Project (P12b, 202:54): white, bar-h tall, radius/bar,
// equal columns. It renders only the verbs a screen has earned — callers pass them; nothing is greyed out. One verb
// is lime (Talk): a lime-dot disc; the rest are ink glyphs. Labels are Label / Tab.

import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { colour, radius, size, space, type } from '@ivywolf/ui'

export type Verb = { key: string; label: string; icon: SFSymbol; lime?: boolean; onPress: () => void; accessibilityLabel?: string }

// Figma 209:54 / 202:54 — measured, not tokens: bar 24 in from each edge (345 at 393), 36 above the screen's bottom
// edge; glyphs 22 at 14 from the top, the disc at 9, labels at 48; shadow 0 6 20 at 14 %.
const INSET = 24
export const BAR_BOTTOM = 36
const GLYPH = 22
const GLYPH_TOP = 14
const DISC_TOP = 9
const LABEL_TOP = 48
/** The floating shadow the bar and the nav pill share: 0 6 20 at 14 % (a CSS blur of 20 is an iOS radius of 10). */
export const FLOAT_SHADOW = { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } } as const

export function ActionBar({ verbs }: { verbs: Verb[] }) {
  const { width } = useWindowDimensions()
  if (verbs.length === 0) return null
  return (
    <View style={[styles.bar, { width: width - INSET * 2 }]} accessibilityRole="toolbar">
      {verbs.map((v) => (
        <Pressable
          key={v.key}
          onPress={v.onPress}
          style={({ pressed }) => [styles.verb, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={v.accessibilityLabel ?? v.label}
          testID={`verb-${v.key}`}
        >
          <View style={[styles.glyphRow, { paddingTop: v.lime ? DISC_TOP : GLYPH_TOP }]}>
            {v.lime ? (
              <View style={styles.disc}>
                <SymbolView name={v.icon} tintColor={colour.Ink} size={GLYPH} />
              </View>
            ) : (
              <SymbolView name={v.icon} tintColor={colour.Ink} size={GLYPH} />
            )}
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {v.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: BAR_BOTTOM,
    height: size['bar-h'],
    borderRadius: radius.bar,
    backgroundColor: colour.Surface,
    flexDirection: 'row',
    ...FLOAT_SHADOW,
  },
  verb: { flex: 1, minWidth: size.tap, alignItems: 'center' },
  glyphRow: { height: LABEL_TOP, alignItems: 'center' },
  disc: {
    width: size['lime-dot'],
    height: size['lime-dot'],
    borderRadius: size['lime-dot'] / 2,
    backgroundColor: colour.Lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...type['Label / Tab'], textAlign: 'center', paddingHorizontal: space.gutter / 2 },
})
