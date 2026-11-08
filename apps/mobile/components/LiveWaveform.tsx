// apps/mobile/components/LiveWaveform.tsx
// Ivy listening: a strip of bars driven by the mic's metering level. A new bar is sampled on a fixed clock,
// so the strip keeps moving left through silence — time passes even when nobody is speaking. Geometry from the
// Record frame (Figma 83:11): 4 pt bars on an 8.4 pt pitch in ink at 85%; the newest bars — what she's saying
// now — are lime. Levels are smoothed so it breathes rather than jitters.
// Capture (B.11, Figma 2272:2) uses two smaller strips: `compact` above the black bar (C1: 28 bars, 4 on a 9 pitch,
// up to 32 high, ink with the last few grey) and `thin` over the note while she types (C2: 3 on a 7 pitch, 18 high).

import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { hero } from '@/lib/theme'

const SAMPLE_MS = 90

type Look = { bars: number; width: number; gap: number; height: number; max: number; min: number; tail: number; tailColour: string; colour: string }
const LOOKS: Record<'record' | 'compact' | 'thin', Look> = {
  record: { bars: 42, width: 4, gap: 4.4, height: 90, max: 64, min: 6, tail: 9, tailColour: hero.lime, colour: hero.inkSoft },
  compact: { bars: 28, width: 4, gap: 5, height: 34, max: 32, min: 4, tail: 6, tailColour: '#AEAEB2', colour: hero.ink },
  thin: { bars: 20, width: 3, gap: 4, height: 20, max: 18, min: 4, tail: 0, tailColour: hero.ink, colour: hero.ink },
}
// Speech sits roughly between these dBFS values on a phone mic; below the floor reads as silence.
const FLOOR_DB = -52
const CEIL_DB = -12

/** dBFS → 0..1, eased so quiet speech still shows but loud speech doesn't slam the ceiling. */
function normalise(db: number | undefined) {
  if (db === undefined || !Number.isFinite(db)) return 0
  const t = Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEIL_DB - FLOOR_DB)))
  return Math.pow(t, 1.4)
}

export function LiveWaveform({ level, look = 'record' }: { level: number | undefined; look?: keyof typeof LOOKS }) {
  const L = LOOKS[look]
  const latest = useRef(level)
  latest.current = level
  const smoothed = useRef(0)
  const [samples, setSamples] = useState<number[]>(() => Array(L.bars).fill(0))

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
    <View
      style={[styles.strip, { height: L.height, gap: L.gap, width: L.bars * L.width + (L.bars - 1) * L.gap }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {samples.map((v, i) => (
        <View
          key={i}
          style={[
            {
              width: L.width,
              borderRadius: L.width / 2,
              height: L.min + v * (L.max - L.min),
              backgroundColor: i >= L.bars - L.tail ? L.tailColour : L.colour,
            },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center' },
})
