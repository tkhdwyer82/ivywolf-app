// apps/mobile/components/Marquee.tsx
// One line of text that fits as it is, or, when it's wider than maxWidth, scrolls sideways in a loop — a pause, then
// it slides left until its copy (GAP behind) is where it started, and again. With Reduce Motion on it stays still and
// ends in an ellipsis. Used for the saved pill's project name on the idea page (B.8a).

import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

const GAP = 32
/** Points per second. */
const SPEED = 30
const PAUSE_MS = 1500

export function Marquee({ text, maxWidth, style, testID }: { text: string; maxWidth: number; style?: StyleProp<TextStyle>; testID?: string }) {
  // The text's own width, measured unconstrained; 0 until it has laid out.
  const [full, setFull] = useState(0)
  const [still, setStill] = useState(false)
  const x = useRef(new Animated.Value(0)).current
  const runs = full > maxWidth && !still

  useEffect(() => {
    let live = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => live && setStill(on))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    x.setValue(0)
    if (!runs) return
    const distance = full + GAP
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(PAUSE_MS),
        Animated.timing(x, { toValue: -distance, duration: (distance / SPEED) * 1000, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [runs, full, x])

  return (
    <View style={[styles.box, { maxWidth }, full > 0 && { width: Math.min(full, maxWidth) }]} testID={testID}>
      {/* The measure: off-screen width, so the text lays out at its natural width. */}
      <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[style, styles.hug]} numberOfLines={1} onLayout={(e) => setFull(Math.ceil(e.nativeEvent.layout.width))}>
          {text}
        </Text>
      </View>
      {runs ? (
        <Animated.View style={[styles.row, { width: full * 2 + GAP, transform: [{ translateX: x }] }]} accessible accessibilityLabel={text}>
          <Text style={[style, { width: full }]} numberOfLines={1}>
            {text}
          </Text>
          <Text style={[style, { width: full, marginLeft: GAP }]} numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden>
            {text}
          </Text>
        </Animated.View>
      ) : (
        <Text style={style} numberOfLines={1}>
          {text}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  measure: { position: 'absolute', left: 0, top: 0, width: 9999, opacity: 0 },
  hug: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row' },
})
