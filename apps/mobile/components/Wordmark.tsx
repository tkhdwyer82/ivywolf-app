// apps/mobile/components/Wordmark.tsx
// The IVY wordmark in Home's logo row (Title / Wordmark). Holding it opens the Ivy library test screen (inspiration
// demo, app/inspiration) — deliberately hidden: no hint, no change to how it looks, and a tap does nothing.

import { Pressable, StyleSheet, Text } from 'react-native'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { type } from '@ivywolf/ui'

export const LIBRARY_HOLD_MS = 600

export function Wordmark() {
  return (
    <Pressable
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
        router.push('/inspiration')
      }}
      delayLongPress={LIBRARY_HOLD_MS}
      testID="wordmark"
    >
      <Text style={styles.wordmark} accessibilityRole="header">
        IVY
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wordmark: type['Title / Wordmark'],
})
