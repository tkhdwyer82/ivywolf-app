// apps/mobile/components/AvatarInitials.tsx
// Every person's avatar in the app: their photo when they have one, else a circle in a soft blue gradient (#A9BAE6 →
// #7888B8, top-left to bottom-right) with their initials in white Semibold at 40 % of the diameter — TestFlight's
// "TD". One name → one initial ("Tim" → T); two or more → first and last ("Tim Dwyer" → TD). A handle splits on its
// dots, dashes and underscores ("@maya.makes" → MM).

import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'

const GRADIENT = ['#A9BAE6', '#7888B8'] as const

/** "Tim Dwyer" → "TD", "Tim" → "T", "@maya.makes" → "MM", "" → "?". */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '')
    .trim()
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (!words.length) return '?'
  const first = [...words[0]][0] ?? ''
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : ''
  return (first + last).toUpperCase()
}

export function AvatarInitials({
  name,
  size,
  uri,
  style,
  testID,
}: {
  name: string | null | undefined
  size: number
  /** Their photo. Only pass a real one (Clerk: user.hasImage) — never a generated placeholder. */
  uri?: string | null
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const box = { width: size, height: size, borderRadius: size / 2 }
  if (uri) return <Image source={{ uri }} style={[box, style as object]} accessibilityIgnoresInvertColors testID={testID} />
  return (
    <View style={[box, styles.clip, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      <LinearGradient colors={GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={[styles.initials, { fontSize: Math.round(size * 0.4) }]} allowFontScaling={false} numberOfLines={1}>
        {initialsOf(name)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFFFFF', fontWeight: '600' },
})
