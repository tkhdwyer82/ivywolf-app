// apps/mobile/components/LiveWaveform.tsx
// Ivy listening: a strip of bars driven by the mic's metering level. A new bar is sampled on a fixed clock,
// so the strip keeps moving left through silence — time passes even when nobody is speaking. Geometry from the
// Record frame (Figma 83:11): 4 pt bars on an 8.4 pt pitch in ink at 85%; the newest bars — what she's saying
// now — are lime. Levels are smoothed so it breathes rather than jitters.

import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { hero } from '@/lib/theme'

const BARS = 42
const LIME_BARS = 9
const SAMPLE_MS = 90
const HEIGHT = 90
const MAX_BAR = 64
const MIN_BAR = 6
// Speech sits roughly between these dBFS values on a phone mic; below the floor reads as silence.
const FLOOR_DB = -52
const CEIL_DB = -12

/** dBFS → 0..1, eased so quiet speech still shows but loud speech doesn't slam the ceiling. */
function normalise(db: number | undefined) {
  if (db === undefined || !Number.isFinite(db)) return 0
  const t = Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEIL_DB - FLOOR_DB)))
  return Math.pow(t, 1.4)
}

export function LiveWaveform({ level }: { level: number | undefined }) {
  const latest = useRef(level)
  latest.current = level
  const smoothed = useRef(0)
  const [samples, setSamples] = useState<number[]>(() => Array(BARS).fill(0))

  useEffect(() => {
    const id = setInterval(() => {
      const target = normalise(latest.current)
      // Rise quickly with the voice, settle slowly after it — calm, not twitchy.
      const k = target > smoothed.current ? 0.55 : 0.2
      smoothed.current += (target - smoothed.current) * k
      setSamples((prev) => [...prev.slice(1), smoothed.current])
    }, SAMPLE_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <View style={styles.strip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {samples.map((v, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            {
              height: MIN_BAR + v * (MAX_BAR - MIN_BAR),
              backgroundColor: i >= BARS - LIME_BARS ? hero.lime : hero.inkSoft,
            },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  strip: { height: HEIGHT, width: 353, flexDirection: 'row', alignItems: 'center', gap: 4.4 },
  bar: { width: 4, borderRadius: 2 },
})
