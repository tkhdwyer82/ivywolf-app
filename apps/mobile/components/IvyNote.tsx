// apps/mobile/components/IvyNote.tsx
// Ivy on open (v3.2, Figma 162:2 "Ivy thinks alongside, then gets out of the way"; Home in 227:5). A lime dot, then
// the line written in word by word at WORDS_PER_MINUTE with a lime caret, into room kept for the whole line from the
// first frame — typing never moves the chips or the grid, so a card held while she writes stays under the finger
// (Job I: the reflow cancelled the hold arc's long-press). Then the cite in grey — " · Thu 0:31", the recording and the moment it's about (rule 2). Tap the line to hear that
// moment. DISSOLVE_AFTER_MS after the last word — or as soon as she scrolls — the words fade out, the timestamp last,
// then the note collapses and the grid slides back up (≈400 ms, ease-out). Nothing is stored.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native'
import { colour, space, type } from '@ivywolf/ui'
import type { IvySentence } from '@/lib/home'

/** Typing pace (Tim, 23 Sep): 162:2's "≈40 wpm" was reading pace. 220 wpm ≈ 270 ms a word. */
export const WORDS_PER_MINUTE = 220
/** 162:2 "02 Dissolving": after ~6 s. */
export const DISSOLVE_AFTER_MS = 6000
const FADE_MS = 300 // words, then the timestamp (162:2: "words fade out, the timestamp last")
const COLLAPSE_MS = 400

// Sentence colours from P1: ink, then 72 %, the last one at 38 %.
const TONES = ['rgba(29,29,31,1)', 'rgba(29,29,31,0.72)', 'rgba(29,29,31,0.38)']
function tone(i: number, n: number) {
  if (n === 1) return TONES[0]
  if (i === n - 1) return TONES[2]
  return i === 0 ? TONES[0] : TONES[1]
}

export function IvyNote({
  sentences,
  dissolve,
  onGone,
  onPlay,
  quiet = false,
}: {
  sentences: IvySentence[]
  dissolve: boolean
  onGone: () => void
  /** A grey dot instead of lime, on a screen whose one lime thing is something else (More ideas: the +). */
  quiet?: boolean
  /** Tap the line: play the moment its cite points at. */
  onPlay?: (cite: NonNullable<IvySentence['cite']>) => void
}) {
  const words = useMemo(
    () => sentences.flatMap((s, si) => s.text.split(/\s+/).map((w) => ({ w, si }))),
    [sentences]
  )
  const cite = sentences.find((s) => s.cite)?.cite ?? null
  const [shown, setShown] = useState(1)
  const wordsOpacity = useRef(new Animated.Value(1)).current
  const citeOpacity = useRef(new Animated.Value(1)).current
  const [gone, setGone] = useState(false)
  const leaving = useRef(false)

  const leave = () => {
    if (leaving.current) return
    leaving.current = true
    const fade = (v: Animated.Value) => Animated.timing(v, { toValue: 0, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true })
    Animated.sequence([fade(wordsOpacity), fade(citeOpacity)]).start(() => {
      LayoutAnimation.configureNext({ duration: COLLAPSE_MS, update: { type: LayoutAnimation.Types.easeOut }, delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity } })
      setGone(true)
      onGone()
    })
  }

  useEffect(() => {
    if (shown >= words.length) {
      const t = setTimeout(leave, DISSOLVE_AFTER_MS)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setShown((n) => n + 1), 60_000 / WORDS_PER_MINUTE)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, words.length])

  useEffect(() => {
    if (dissolve) leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dissolve])

  if (gone || words.length === 0) return null
  const writing = shown < words.length
  const label = sentences.map((s) => s.text).join(' ') + (cite ? `, ${cite.label}` : '')
  const playable = !!(onPlay && cite?.storagePath)

  return (
    <Pressable
      onPress={playable ? () => onPlay!(cite!) : undefined}
      disabled={!playable}
      style={styles.note}
      accessibilityRole={playable ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityHint={playable ? 'Plays that moment' : undefined}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.dot, quiet && styles.dotQuiet]} />
      {/* The whole line and its cite, clear, hold the note at its final height from the start. Over it: the words
          written so far with the caret, then the cite in its own layer so it fades on its own (nested Text spans
          can't animate opacity on iOS). Each layer lays out the same text from the same start, so the words land
          exactly where the room was kept. */}
      <View style={styles.layers}>
        <Line words={words} n={sentences.length} cite={cite?.label ?? null} show="none" caret={false} />
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: wordsOpacity }]} pointerEvents="none">
          <Line words={words.slice(0, shown)} n={sentences.length} cite={null} show="words" caret={writing} />
        </Animated.View>
        {!writing && cite && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: citeOpacity }]} pointerEvents="none">
            <Line words={words} n={sentences.length} cite={cite.label} show="cite" caret={false} />
          </Animated.View>
        )}
      </View>
    </Pressable>
  )
}

const CLEAR = 'transparent'

function Line({ words, n, cite, show, caret }: { words: { w: string; si: number }[]; n: number; cite: string | null; show: 'words' | 'cite' | 'none'; caret: boolean }) {
  return (
    <Text style={styles.words}>
      {words.map(({ w, si }, i) => (
        <Text key={i} style={{ color: show === 'words' ? tone(si, n) : CLEAR }}>
          {i > 0 ? ' ' : ''}
          {w}
        </Text>
      ))}
      {caret && <Text style={styles.caret}> ▏</Text>}
      {!!cite && <Text style={{ color: show === 'cite' ? colour.Grey : CLEAR }}>{` · ${cite}`}</Text>}
    </Text>
  )
}

// 162:2 / 227:13 — measured, not tokens: the lime dot is 8, 8 in from the margin's text and centred on the first line.
const DOT = 8
const DOT_TOP = (type['Body / Large'].lineHeight - DOT) / 2

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: DOT, paddingHorizontal: space.margin, paddingTop: space.stack },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginTop: DOT_TOP, backgroundColor: colour.Lime },
  dotQuiet: { backgroundColor: colour.Grey },
  layers: { flex: 1 },
  words: type['Body / Large'],
  caret: { color: colour.Lime },
})
