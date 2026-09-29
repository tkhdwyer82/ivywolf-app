// apps/mobile/components/Shimmer.tsx
// A frame that hasn't arrived yet (v3.4b): Colour / Shimmer with a lighter band sweeping across — never a colour
// block, never the title. Figma 209:28: the band is Colour / Chip, 35 % of the tile's width. With Reduce Motion on,
// the band stays still.

import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colour } from '@ivywolf/ui'

const BAND = 0.35 // of the width (Figma 209:29: 63.35 of 181)
const SWEEP_MS = 1400

export function Shimmer({ style }: { style?: StyleProp<ViewStyle> }) {
  const [width, setWidth] = useState(0)
  const [still, setStill] = useState(false)
  const x = useRef(new Animated.Value(0)).current

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill, () => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill)
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!width || still) return
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [width, still, x])

  const band = width * BAND
  return (
    <View
      style={[styles.shimmer, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel="Frame on its way"
      testID="shimmer"
    >
      {width > 0 && (
        <Animated.View
          style={[
            styles.band,
            { width: band, transform: [{ translateX: still ? 0 : x.interpolate({ inputRange: [0, 1], outputRange: [-band, width] }) }] },
          ]}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  shimmer: { backgroundColor: colour.Shimmer, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colour.Chip },
})
