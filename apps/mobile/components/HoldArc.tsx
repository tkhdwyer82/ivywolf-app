// apps/mobile/components/HoldArc.tsx
// The hold arc (Job C+, Figma 1453:4 ideas, 1453:226 to-dos, 1453:325 suggestions), polished to Pinterest's
// long-press menu. Hold a card 0.35 s: the whole screen (header and nav too) fades to white, the card lifts out of
// the grid, tilted by its column, and its actions fan out on a small arc around the thumb, aimed at the open middle
// of the screen. Keep the finger down and slide: the nearest button swells and leans toward it, the selected one
// turns ink with a tick, and its name shows large in the empty half of the screen. Let go on one to do it;
// anywhere else cancels. Either way everything fades and the card settles back.
//
//   <HoldProvider>             once per screen, around everything; renders the overlay on top
//     <Hold actions={…} face={…}>{(onLongPress) => <Tile onLongPress={onLongPress} … />}</Hold>
//
// One gesture: a Gesture Handler Pan that activates after the long press (Gesture.Pan().activateAfterLongPress), so
// press, drag and release are a single touch, tracked on the UI thread; the geometry is lib/holdArc.ts (worklets).
// A move before 0.35 s fails the Pan and the list scrolls; once it's active the screen stops its scroll view
// (`useHolding`). With VoiceOver on, the Pan is off and the tile's long-press (double-tap and hold) opens the same
// actions as a menu.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, ActionSheetIOS, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  FadeIn,
  FadeOut,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import * as Haptics from 'expo-haptics'
import { colour, type } from '@ivywolf/ui'
import { ARC, blob, labelSpot, pickSelected, placeArc, pull, restCentre, type Screen } from '@/lib/holdArc'

export interface HoldAction {
  key: string
  label: string
  icon: SFSymbol
  run: () => void
}

type Rect = { x: number; y: number; w: number; h: number }
type Held = { rect: Rect; point: { x: number; y: number }; actions: HoldAction[]; face: ReactNode }

/** What the gesture drives on the UI thread. */
interface Stage {
  /** 0 → 1 as the hold opens, back to 0 as it closes: the white, the lift, the arc. */
  progress: SharedValue<number>
  /** The touch that opened it (the arc's centre) and the finger now. */
  ox: SharedValue<number>
  oy: SharedValue<number>
  fx: SharedValue<number>
  fy: SharedValue<number>
  /** The finger is still down (the blob follows it). */
  tracking: SharedValue<boolean>
  angles: SharedValue<number[]>
  selected: SharedValue<number>
}

interface Hold {
  holding: boolean
  screenReader: boolean
  stage: Stage
  begin: (h: Held) => void
  select: (i: number) => void
  release: (i: number) => void
}
const HoldContext = createContext<Hold | null>(null)

/** Is a hold open on this screen — stop scrolling while it is. */
export function useHolding(): boolean {
  return useContext(HoldContext)?.holding ?? false
}

/** Long-press delay (clarified: about 0.35 s). */
export const HOLD_MS = 350

// Pinterest's long-press menu: white at 0.85 in 150 ms; the card lifts 5% and tilts 2.5° (left column anticlockwise,
// right column clockwise); a faint 44 ring at the touch; the label Title at 40, bold, ink; the selection fades
// 120 ms; out in 200 ms. The arc and the blob are lib/holdArc.ts.
const WHITE = 0.85
const IN_MS = 150
const OUT_MS = 200
const LABEL_MS = 120
const LIFT = 0.05
const TILT = 2.5
const RING = 44
const LABEL = 40
const LABEL_H = 48
const ICON = 22
const SPRING = { damping: 15, stiffness: 220 }

export function HoldProvider({ children }: { children: ReactNode }) {
  const [held, setHeld] = useState<Held | null>(null)
  const [holding, setHolding] = useState(false)
  const [selected, setSelected] = useState(-1)
  const [screenReader, setScreenReader] = useState(false)
  const heldRef = useRef<Held | null>(null)
  const generation = useRef(0)
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const stage: Stage = {
    progress: useSharedValue(0),
    ox: useSharedValue(0),
    oy: useSharedValue(0),
    fx: useSharedValue(0),
    fy: useSharedValue(0),
    tracking: useSharedValue(false),
    angles: useSharedValue<number[]>([]),
    selected: useSharedValue(-1),
  }
  const stageRef = useRef(stage)

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => {})
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader)
    return () => sub.remove()
  }, [])

  const begin = useCallback((h: Held) => {
    generation.current++
    heldRef.current = h
    setSelected(-1)
    setHeld(h)
    setHolding(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }, [])

  // A tick on landing on a button; none when the selection clears.
  const select = useCallback((i: number) => {
    setSelected(i)
    if (i >= 0) Haptics.selectionAsync().catch(() => {})
  }, [])

  // The exit's last frame: unmount the overlay, unless another hold has opened since.
  const clear = useCallback((gen: number) => {
    if (gen !== generation.current) return
    heldRef.current = null
    setHeld(null)
    setSelected(-1)
  }, [])

  // Let go: run the selected action (if any), then fade everything out and settle the card back.
  const release = useCallback(
    (i: number) => {
      const h = heldRef.current
      setHolding(false)
      setSelected(-1)
      if (h && i >= 0) h.actions[i]?.run()
      const gen = generation.current
      stageRef.current.progress.value = withTiming(0, { duration: OUT_MS }, (done) => {
        if (done) scheduleOnRN(clear, gen)
      })
    },
    [clear]
  )

  const value = useMemo(
    () => ({ holding, screenReader, stage: stageRef.current, begin, select, release }),
    [holding, screenReader, begin, select, release]
  )

  return (
    <HoldContext.Provider value={value}>
      {children}
      {held && <Overlay held={held} selected={selected} stage={stageRef.current} width={width} height={height} insets={insets} />}
    </HoldContext.Provider>
  )
}

function Overlay({
  held,
  selected,
  stage,
  width,
  height,
  insets,
}: {
  held: Held
  selected: number
  stage: Stage
  width: number
  height: number
  insets: { top: number; bottom: number; left: number; right: number }
}) {
  // The column the card is in sets its tilt: left anticlockwise, right clockwise.
  const tilt = held.rect.x + held.rect.w / 2 < width / 2 ? -TILT : TILT
  const white = useAnimatedStyle(() => ({ opacity: WHITE * stage.progress.value }))
  const fade = useAnimatedStyle(() => ({ opacity: stage.progress.value }))
  const ring = useAnimatedStyle(() => ({ opacity: 0.16 * stage.progress.value }))
  const lifted = useAnimatedStyle(() => ({
    shadowOpacity: 0.2 * stage.progress.value,
    transform: [{ scale: 1 + LIFT * stage.progress.value }, { rotate: `${tilt * stage.progress.value}deg` }],
  }))

  // The label: in the half away from the thumb, 180 above or below it, kept inside the safe area.
  const spot = labelSpot(held.point, { w: width, h: height })
  const labelTop = Math.min(Math.max(spot.y - LABEL_H / 2, insets.top + ARC.margin), height - insets.bottom - ARC.margin - LABEL_H)
  const labelSide =
    spot.side === 'right' ? { left: width / 2, right: ARC.margin + insets.right } : { left: ARC.margin + insets.left, right: width / 2 }

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.white, white]} />
      <Animated.View style={[styles.lifted, { left: held.rect.x, top: held.rect.y, width: held.rect.w }, lifted]}>{held.face}</Animated.View>
      <Animated.View style={[styles.ring, { left: held.point.x - RING / 2, top: held.point.y - RING / 2 }, ring]} />
      {held.actions.map((a, i) => (
        <ArcButton key={a.key} index={i} action={a} stage={stage} />
      ))}
      <Animated.View style={[styles.labelRow, labelSide, { top: labelTop }, fade]}>
        {selected >= 0 && held.actions[selected] && (
          <Animated.View key={selected} entering={FadeIn.duration(LABEL_MS)} exiting={FadeOut.duration(LABEL_MS)}>
            <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {held.actions[selected].label}
            </Text>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  )
}

/** One action on the arc: out from the touch as the hold opens, then a blob that swells and leans toward the finger. */
function ArcButton({ index, action, stage }: { index: number; action: HoldAction; stage: Stage }) {
  const body = useAnimatedStyle(() => {
    const angle = stage.angles.value[index] ?? 0
    const touch = { x: stage.ox.value, y: stage.oy.value }
    const rest = restCentre(touch, angle)
    const p = stage.tracking.value ? pull({ x: stage.fx.value, y: stage.fy.value }, rest) : 0
    const b = blob(p, angle)
    const t = stage.progress.value
    const on = stage.selected.value === index
    return {
      opacity: t,
      backgroundColor: on ? colour.Ink : colour.Surface,
      transform: [
        { translateX: touch.x + (rest.x - touch.x) * t - ARC.button / 2 },
        { translateY: touch.y + (rest.y - touch.y) * t - ARC.button / 2 },
        { translateX: withSpring(b.dx, SPRING) },
        { translateY: withSpring(b.dy, SPRING) },
        { scale: withSpring(b.scale, SPRING) },
      ],
    }
  })
  const ink = useAnimatedStyle(() => ({ opacity: stage.selected.value === index ? 0 : 1 }))
  const white = useAnimatedStyle(() => ({ opacity: stage.selected.value === index ? 1 : 0 }))
  return (
    <Animated.View style={[styles.button, body]}>
      <Animated.View style={[styles.icon, ink]}>
        <SymbolView name={action.icon} tintColor={colour.Ink} size={ICON} weight="semibold" />
      </Animated.View>
      <Animated.View style={[styles.icon, white]}>
        <SymbolView name={action.icon} tintColor={colour.Surface} size={ICON} weight="semibold" />
      </Animated.View>
    </Animated.View>
  )
}

/**
 * Makes its child holdable. `children` gets a long-press handler for the tile's Pressable — only with VoiceOver on,
 * where it opens the actions as a menu; otherwise the hold is the Pan around the tile. `face` is what lifts (usually
 * the same tile, drawn at the size it has on screen).
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
  const aref = useAnimatedRef<Animated.View>()
  const mine = useSharedValue(false)
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const count = actions().length
  const enabled = !!hold && !disabled && !hold.screenReader

  // The gesture's worklets call back into JS through this (scheduleOnRN needs a function it can hold on to).
  const latest = useRef({ actions, face, hold })
  latest.current = { actions, face, hold }
  const onBegin = useCallback((x: number, y: number, w: number, h: number, px: number, py: number) => {
    const { actions, face, hold } = latest.current
    hold?.begin({ rect: { x, y, w, h }, point: { x: px, y: py }, actions: actions(), face: face() })
  }, [])

  // A hold that's still open when this tile goes (a reload under it) closes, without running anything.
  useEffect(
    () => () => {
      if (mine.value) latest.current.hold?.release(-1)
    },
    [mine]
  )

  const stage = hold?.stage
  const select = hold?.select
  const release = hold?.release
  const gesture = useMemo(() => {
    const screen: Screen = { w: width, h: height, top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right }
    return Gesture.Pan()
      .activateAfterLongPress(HOLD_MS)
      .enabled(enabled)
      .onStart((e) => {
        if (!stage || !select || !release) return
        const m = measure(aref)
        if (!m) return
        mine.value = true
        stage.ox.value = e.absoluteX
        stage.oy.value = e.absoluteY
        stage.fx.value = e.absoluteX
        stage.fy.value = e.absoluteY
        stage.angles.value = placeArc({ x: e.absoluteX, y: e.absoluteY }, count, screen)
        stage.selected.value = -1
        stage.tracking.value = true
        stage.progress.value = withTiming(1, { duration: IN_MS })
        scheduleOnRN(onBegin, m.pageX, m.pageY, m.width, m.height, e.absoluteX, e.absoluteY)
      })
      .onUpdate((e) => {
        if (!mine.value || !stage || !select) return
        stage.fx.value = e.absoluteX
        stage.fy.value = e.absoluteY
        const s = pickSelected({ x: e.absoluteX, y: e.absoluteY }, { x: stage.ox.value, y: stage.oy.value }, stage.angles.value)
        if (s !== stage.selected.value) {
          stage.selected.value = s
          scheduleOnRN(select, s)
        }
      })
      .onFinalize((_e, success) => {
        if (!mine.value || !stage || !release) return
        mine.value = false
        stage.tracking.value = false
        const chosen = success ? stage.selected.value : -1
        stage.selected.value = -1
        scheduleOnRN(release, chosen)
      })
  }, [enabled, count, width, height, insets, stage, select, release, aref, mine, onBegin])

  // VoiceOver: double-tap and hold opens the same actions, in order, as a menu.
  const menu = useCallback(() => {
    const list = latest.current.actions()
    ActionSheetIOS.showActionSheetWithOptions({ options: [...list.map((a) => a.label), 'Cancel'], cancelButtonIndex: list.length }, (i) => list[i]?.run())
  }, [])

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View ref={aref} collapsable={false}>
        {/* The plain view link mode measures (its lines), as before the Pan. */}
        <View ref={viewRef} collapsable={false}>
          {children(hold && !disabled && hold.screenReader ? menu : undefined)}
        </View>
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  // Above everything on the screen, the collapsing header and the nav included.
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1000, elevation: 1000 },
  white: { backgroundColor: colour.Surface },
  lifted: {
    position: 'absolute',
    shadowColor: '#000',
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
  },
  ring: { position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, borderColor: colour.Ink },
  button: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ARC.button,
    height: ARC.button,
    borderRadius: ARC.button / 2,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  icon: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  labelRow: { position: 'absolute', height: LABEL_H, justifyContent: 'center', alignItems: 'center' },
  label: { ...type['Title / Screen'], fontSize: LABEL, lineHeight: LABEL_H, color: colour.Ink },
})
