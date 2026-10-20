// apps/mobile/components/RainbowSweep.tsx
// The lens's rainbow sweep (v5.0 review, B.8 §5): a 3pt gradient stroke slowly rotating round a tile while Ivy works.
// Drawn as a rotating gradient square behind the tile, clipped to the tile's radius, with the child inset by the
// stroke. B.10 uses it while a reel turns into a recipe; B.8's Make page can reuse it for Generate.

import { useEffect, type ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { colour, radius } from '@ivywolf/ui'

const STROKE = 3
const TURN_MS = 3200
const HUES = ['#FF5E5E', '#FFB547', '#D8F27A', '#5ED6A8', '#5EA8FF', '#A77BFF', '#FF5E5E'] as const

export function RainbowSweep({ active, children, style, r = radius.tile }: { active: boolean; children: ReactNode; style?: ViewStyle; r?: number }) {
  const turn = useSharedValue(0)
  const still = useReducedMotion()

  useEffect(() => {
    if (active && !still) turn.value = withRepeat(withTiming(360, { duration: TURN_MS, easing: Easing.linear }), -1, false)
    else {
      cancelAnimation(turn)
      turn.value = 0
    }
  }, [active, still, turn])

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }))

  return (
    <View style={[{ borderRadius: r, overflow: 'hidden', padding: active ? STROKE : 0 }, style]} accessibilityState={{ busy: active }}>
      {active && (
        <Animated.View style={[styles.spinner, spin]} pointerEvents="none">
          <LinearGradient colors={HUES} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      <View style={{ borderRadius: Math.max(0, r - (active ? STROKE : 0)), overflow: 'hidden', backgroundColor: colour.Surface }}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Big enough that its corners never show as it turns.
  spinner: { position: 'absolute', top: '-75%', left: '-75%', width: '250%', height: '250%' },
})
