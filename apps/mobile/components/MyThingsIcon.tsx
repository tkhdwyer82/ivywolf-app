// apps/mobile/components/MyThingsIcon.tsx
// My things in Home's header (B.5), left of search: 28 pt. A placeholder ☰ in ink until the mascot asset lands — swap
// the glyph for it here and nowhere else.

import { StyleSheet, Text, View } from 'react-native'
import { colour } from '@ivywolf/ui'

export const MY_THINGS_ICON = 28

export function MyThingsIcon() {
  return (
    <View style={styles.box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.glyph}>☰</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { width: MY_THINGS_ICON, height: MY_THINGS_ICON, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 24, lineHeight: MY_THINGS_ICON, color: colour.Ink, includeFontPadding: false },
})
