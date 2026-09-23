// apps/mobile/components/IvyNote.tsx
// Ivy on open (P1 / P1a / P1c). Writes word by word at WORDS_PER_MINUTE with a lime caret, pushing the chips and
// grid down as each line lands; the last sentence fades. DISSOLVE_AFTER_MS after the last word — or as soon as
// she scrolls — the note fades and collapses, and the grid slides back up (≈400 ms, ease-out). Nothing is stored.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, LayoutAnimation, StyleSheet, Text, View } from 'react-native'
import { hero, text } from '@/lib/theme'
import type { IvySentence } from '@/lib/home'

/** Motion note under P1: "Ivy writes word by word (≈40 wpm)". */
export const WORDS_PER_MINUTE = 40
export const DISSOLVE_AFTER_MS = 8000
const DISSOLVE_MS = 400

// Sentence colours from P1: ink, then 72 %, the last one at 38 %.
const TONES = ['rgba(29,29,31,1)', 'rgba(29,29,31,0.72)', 'rgba(29,29,31,0.38)']
function tone(i: number, n: number) {
  if (n === 1) return TONES[0]
  if (i === n - 1) return TONES[2]
  return i === 0 ? TONES[0] : TONES[1]
}

const lineChange = () =>
  LayoutAnimation.configureNext({ duration: 220, update: { type: LayoutAnimation.Types.easeInEaseOut } })

export function IvyNote({ sentences, dissolve, onGone }: { sentences: IvySentence[]; dissolve: boolean; onGone: () => void }) {
  const words = useMemo(
    () => sentences.flatMap((s, si) => s.text.split(/\s+/).map((w) => ({ w, si }))),
    [sentences]
  )
  const [shown, setShown] = useState(1)
  const opacity = useRef(new Animated.Value(1)).current
  const [gone, setGone] = useState(false)
  const leaving = useRef(false)

  const leave = () => {
    if (leaving.current) return
    leaving.current = true
    Animated.timing(opacity, { toValue: 0, duration: DISSOLVE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
      LayoutAnimation.configureNext({ duration: DISSOLVE_MS, update: { type: LayoutAnimation.Types.easeOut }, delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity } })
      setGone(true)
      onGone()
    })
  }

  useEffect(() => {
    if (shown >= words.length) {
      const t = setTimeout(leave, DISSOLVE_AFTER_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      lineChange()
      setShown((n) => n + 1)
    }, 60_000 / WORDS_PER_MINUTE)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, words.length])

  useEffect(() => {
    if (dissolve) leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dissolve])

  if (gone || words.length === 0) return null
  const writing = shown < words.length

  return (
    <Animated.View style={[styles.note, { opacity }]} accessibilityLiveRegion="polite">
      <View style={styles.dot} />
      <Text style={[text.bodyLarge, styles.words]} accessibilityLabel={sentences.map((s) => s.text).join(' ')}>
        {words.slice(0, shown).map(({ w, si }, i) => (
          <Text key={i} style={{ color: tone(si, sentences.length) }}>
            {i > 0 ? ' ' : ''}
            {w}
          </Text>
        ))}
        {writing && <Text style={styles.caret}> ▏</Text>}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', paddingLeft: 24, paddingRight: 20, paddingTop: 12, paddingBottom: 14 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: hero.lime, marginTop: 6, marginRight: 14 },
  // Body / Large at the note's weight (Figma: SF Pro Medium 17 / 24).
  words: { flex: 1, fontWeight: '500' },
  caret: { color: hero.lime, fontWeight: '700' },
})
