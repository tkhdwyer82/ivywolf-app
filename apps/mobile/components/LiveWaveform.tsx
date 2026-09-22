// apps/mobile/components/LiveWaveform.tsx
// Ivy listening: a strip of bars driven by the mic's metering level. A new bar is sampled on a fixed clock,
// so the strip keeps moving left through silence — time passes even when nobody is speaking. Older bars fade
// in ink; only the newest bar (now) carries the accent. Levels are smoothed so it breathes rather than jitters.

import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { color } from '@/lib/theme'

const BARS = 44
const SAMPLE_MS = 90
const MAX_HEIGHT = 56
const MIN_HEIGHT = 3
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
      {samples.map((v, i) => {
        const now = i === BARS - 1
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: MIN_HEIGHT + v * (MAX_HEIGHT - MIN_HEIGHT),
                backgroundColor: now ? color.accent : color.ink,
                // The past recedes: oldest bars at ~15% ink, recent ones near full.
                opacity: now ? 1 : 0.15 + 0.6 * (i / (BARS - 1)),
              },
            ]}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  strip: { height: MAX_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 3 },
  bar: { width: 3, borderRadius: 1.5 },
})
