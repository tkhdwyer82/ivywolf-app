// apps/mobile/components/HoldArc.tsx
// The hold arc (Job C+, Figma 1453:4 ideas, 1453:226 to-dos, 1453:325 suggestions). Hold a card about 0.35 s: it
// lifts and tilts, the screen fades to white, and its actions arc beside the thumb on the side with more room. Keep
// the finger down and slide: each action passed lights up with its label and a light haptic tick; let go on one to
// do it. Slide back to the card (or let go anywhere else) to cancel.
//
//   <HoldProvider>             once per screen, around everything; renders the overlay on top
//     <Hold actions={…} face={…}>{(onLongPress) => <Tile onLongPress={onLongPress} … />}</Hold>
//
// The tile's own Pressable fires the long-press (so a hold never also opens the card, and a scroll cancels it); the
// wrapper follows the finger with raw touch events, which keep arriving while the same touch is down. The screen
// stops its scroll view while `holding`, so the slide doesn't scroll.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Animated, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import * as Haptics from 'expo-haptics'
import { colour } from '@ivywolf/ui'

export interface HoldAction {
  key: string
  label: string
  icon: SFSymbol
  run: () => void
}

type Point = { x: number; y: number }
type Rect = Point & { w: number; h: number }
type Held = { rect: Rect; point: Point; actions: HoldAction[]; face: ReactNode }

interface Hold {
  holding: boolean
  begin: (h: Held) => void
  move: (p: Point) => void
  end: (cancelled?: boolean) => void
}
const HoldContext = createContext<Hold | null>(null)

/** Is a hold open on this screen — stop scrolling while it is. */
export function useHolding(): boolean {
  return useContext(HoldContext)?.holding ?? false
}

/** Long-press delay (clarified: about 0.35 s). */
export const HOLD_MS = 350

// Figma 1453:4 — measured: buttons 52 (the lit one 60, ink), 96 from the thumb, spread over 124° of arc; the label is
// an ink pill, Semibold 13, 14 above the lit button. The card lifts 4% and tilts 5° away from the arc.
const BUTTON = 52
const LIT = 60
const RADIUS = 96
const SPREAD = 124
const HIT = 40
const EDGE = 12
const LIFT = 1.04
const TILT = 5
const FADE_MS = 160
const WHITE = 'rgba(255,255,255,0.9)'

export function HoldProvider({ children }: { children: ReactNode }) {
  const [held, setHeld] = useState<Held | null>(null)
  const [lit, setLit] = useState<number | null>(null)
  const litRef = useRef<number | null>(null)
  const heldRef = useRef<Held | null>(null)
  const fade = useRef(new Animated.Value(0)).current
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  // Where each action sits: an arc around the thumb, opening to the side with more room.
  const spots = useMemo(() => {
    if (!held) return []
    const side = held.point.x > width / 2 ? -1 : 1
    const n = held.actions.length
    return held.actions.map((_, i) => {
      const deg = n === 1 ? 0 : -SPREAD / 2 + (SPREAD * i) / (n - 1)
      const a = (deg * Math.PI) / 180
      return {
        x: clamp(held.point.x + side * RADIUS * Math.cos(a), EDGE + LIT / 2, width - EDGE - LIT / 2),
        y: clamp(held.point.y + RADIUS * Math.sin(a), insets.top + LIT, height - insets.bottom - LIT / 2),
        side,
      }
    })
  }, [held, width, height, insets])
  const spotsRef = useRef(spots)
  spotsRef.current = spots

  const begin = useCallback(
    (h: Held) => {
      heldRef.current = h
      litRef.current = null
      setLit(null)
      setHeld(h)
      fade.setValue(0)
      Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start()
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    },
    [fade]
  )

  const move = useCallback((p: Point) => {
    const s = spotsRef.current
    let best: number | null = null
    let bestD = HIT
    s.forEach((spot, i) => {
      const d = Math.hypot(spot.x - p.x, spot.y - p.y)
      if (d < bestD) {
        best = i
        bestD = d
      }
    })
    if (best !== litRef.current) {
      litRef.current = best
      setLit(best)
      if (best !== null) Haptics.selectionAsync().catch(() => {})
    }
  }, [])

  const end = useCallback(
    (cancelled = false) => {
      const h = heldRef.current
      const i = litRef.current
      heldRef.current = null
      litRef.current = null
      setHeld(null)
      setLit(null)
      if (!cancelled && h && i !== null) h.actions[i]?.run()
    },
    []
  )

  const value = useMemo(() => ({ holding: !!held, begin, move, end }), [held, begin, move, end])

  return (
    <HoldContext.Provider value={value}>
      {children}
      {held && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="none">
          <View style={[StyleSheet.absoluteFill, { backgroundColor: WHITE }]} />
          <View
            style={[
              styles.lifted,
              {
                left: held.rect.x,
                top: held.rect.y,
                width: held.rect.w,
                transform: [{ scale: LIFT }, { rotate: `${(spots[0]?.side ?? 1) < 0 ? TILT : -TILT}deg` }],
              },
            ]}
          >
            {held.face}
          </View>
          {held.actions.map((a, i) => {
            const s = spots[i]
            if (!s) return null
            const on = lit === i
            const d = on ? LIT : BUTTON
            return (
              <View key={a.key}>
                <View style={[styles.button, on && styles.buttonLit, { width: d, height: d, borderRadius: d / 2, left: s.x - d / 2, top: s.y - d / 2 }]}>
                  <SymbolView name={a.icon} tintColor={on ? colour.Surface : colour.Ink} size={on ? 24 : 22} weight="semibold" />
                </View>
                {on && <Label text={a.label} x={s.x} y={s.y - LIT / 2 - 14} side={s.side} width={width} />}
              </View>
            )
          })}
        </Animated.View>
      )}
    </HoldContext.Provider>
  )
}

/** The lit action's name, an ink pill above it, kept on screen. */
function Label({ text, x, y, side, width }: { text: string; x: number; y: number; side: number; width: number }) {
  const [w, setW] = useState(0)
  // Leans outward, away from the card, like the frame's "Link ideas".
  const left = clamp(side < 0 ? x - w + LIT / 2 : x - LIT / 2, EDGE, width - EDGE - w)
  return (
    <View style={[styles.label, { left, top: y - LABEL_H }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Text style={styles.labelText}>{text}</Text>
    </View>
  )
}
const LABEL_H = 30

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Makes its child holdable. `children` gets the long-press handler to give the tile's Pressable; `face` is what
 * lifts (usually the same tile, drawn at the size it has on screen).
 */
export function Hold({
  actions,
  face,
  disabled,
  children,
  viewRef,
}: {
  actions: () => HoldAction[]
  face: () => ReactNode
  disabled?: boolean
  /** Also hand the wrapper's view out (link mode measures it for its lines). */
  viewRef?: (v: View | null) => void
  children: (onLongPress: ((e: GestureResponderEvent) => void) | undefined) => ReactNode
}) {
  const hold = useContext(HoldContext)
  const ref = useRef<View>(null)
  const active = useRef(false)
  // The finger is still down: measuring is async, and a hold whose finger has already lifted mustn't open.
  const down = useRef(false)

  // A hold that's still open when this tile goes (a reload under it) closes, without running anything.
  useEffect(
    () => () => {
      if (active.current) hold?.end(true)
    },
    [hold]
  )

  const onLongPress = useCallback(
    (e: GestureResponderEvent) => {
      if (!hold) return
      const point = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }
      ref.current?.measureInWindow((x, y, w, h) => {
        if (!down.current) return
        active.current = true
        hold.begin({ rect: { x, y, w, h }, point, actions: actions(), face: face() })
      })
    },
    [hold, actions, face]
  )

  return (
    <View
      ref={(v) => {
        ref.current = v
        viewRef?.(v)
      }}
      collapsable={false}
      onTouchStart={() => {
        down.current = true
      }}
      onTouchMove={(e) => active.current && hold?.move({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
      onTouchEnd={() => {
        down.current = false
        if (!active.current) return
        active.current = false
        hold?.end()
      }}
      onTouchCancel={() => {
        down.current = false
        if (!active.current) return
        active.current = false
        hold?.end(true)
      }}
    >
      {children(disabled || !hold ? undefined : onLongPress)}
    </View>
  )
}

const styles = StyleSheet.create({
  lifted: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  button: {
    position: 'absolute',
    backgroundColor: colour.Surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  buttonLit: { backgroundColor: colour.Ink },
  label: { position: 'absolute', height: LABEL_H, borderRadius: LABEL_H / 2, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: colour.Ink },
  labelText: { fontSize: 13, fontWeight: '600', color: colour.Surface },
})
