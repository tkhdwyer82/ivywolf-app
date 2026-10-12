// apps/mobile/components/MyThingsRow.tsx
// My things leaves the feed (Home v4, Row/My things 1737:129): one cool-grey row at the top of Home — "My things",
// "3 today · milk · visa · wipes", and a chevron — that opens the My things list (app/things.tsx). Not drawn when she
// has no open to-dos.

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { colour, hues } from '@ivywolf/ui'
import { GRID, thingsLine, type ThingsRow } from '@/lib/home'

export function MyThingsRow({ row, open }: { row: ThingsRow | null; open: number }) {
  if (!row) return null
  const line = thingsLine(row, open)
  return (
    <Pressable
      onPress={() => router.push('/things')}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={`My things. ${line}`}
      testID="my-things-row"
    >
      <View style={styles.words}>
        <Text style={styles.title}>My things</Text>
        <Text style={styles.line} numberOfLines={1}>
          {line}
        </Text>
      </View>
      <Text style={styles.chevron} accessibilityElementsHidden>
        ›
      </Text>
    </Pressable>
  )
}

// Figma 1737:129 — measured: 353 × 52 at 20 in, radius 14, cool-grey; "My things" Semibold 15 and the line Regular 12,
// 16 in; the › Semibold 22, grey.
const styles = StyleSheet.create({
  row: {
    height: 52,
    marginHorizontal: GRID.margin,
    marginBottom: 14,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: hues['cool-grey'],
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  words: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', color: colour.Ink },
  line: { fontSize: 12, color: colour.Grey },
  chevron: { fontSize: 22, fontWeight: '600', color: colour.Grey, marginLeft: 8 },
})
