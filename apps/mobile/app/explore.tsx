// apps/mobile/app/explore.tsx
// Explore (P22) — search, Ideas for you, Rising. Built in Job 4 step 10; until then the trio's Explore lands here.

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { hero, text } from '@/lib/theme'

export default function Explore() {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
        <SymbolView name="chevron.left" tintColor={hero.ink} size={20} />
      </Pressable>
      <Text style={[text.titleScreen, styles.title]}>Explore</Text>
      <Text style={[text.body, { color: hero.secondary }]}>Search and ideas for you are next.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room, paddingHorizontal: 20 },
  title: { marginTop: 16, marginBottom: 8 },
})
