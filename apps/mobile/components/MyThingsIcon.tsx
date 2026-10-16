// apps/mobile/components/MyThingsIcon.tsx
// My things in Home's header (B.6), left of search: Ivy the mascot in a 44 pt slot, the whole slot a tap to /things.
// On a cold open she plays once — 36 frames at 12 fps, swapped on one Image by an Animated clock, every frame
// preloaded first so nothing stutters — then holds her still. Once per launch: a module flag, so coming back to Home
// or resuming from the background doesn't replay her. Reduce Motion on: the still only. If the still won't load,
// the ☰ it replaced.

import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text } from 'react-native'
import { Image } from 'expo-image'
import { Asset } from 'expo-asset'
import { router } from 'expo-router'
import { colour, size } from '@ivywolf/ui'

export const MY_THINGS_ICON = size.tap // 44
const FPS = 12

// Required without the @3x: Metro resolves the scale suffix itself (naming it fails to resolve); Jest maps it in package.json.
const FRAMES = [
  require('@/assets/mascot/ivy-mascot-00.png'),
  require('@/assets/mascot/ivy-mascot-01.png'),
  require('@/assets/mascot/ivy-mascot-02.png'),
  require('@/assets/mascot/ivy-mascot-03.png'),
  require('@/assets/mascot/ivy-mascot-04.png'),
  require('@/assets/mascot/ivy-mascot-05.png'),
  require('@/assets/mascot/ivy-mascot-06.png'),
  require('@/assets/mascot/ivy-mascot-07.png'),
  require('@/assets/mascot/ivy-mascot-08.png'),
  require('@/assets/mascot/ivy-mascot-09.png'),
  require('@/assets/mascot/ivy-mascot-10.png'),
  require('@/assets/mascot/ivy-mascot-11.png'),
  require('@/assets/mascot/ivy-mascot-12.png'),
  require('@/assets/mascot/ivy-mascot-13.png'),
  require('@/assets/mascot/ivy-mascot-14.png'),
  require('@/assets/mascot/ivy-mascot-15.png'),
  require('@/assets/mascot/ivy-mascot-16.png'),
  require('@/assets/mascot/ivy-mascot-17.png'),
  require('@/assets/mascot/ivy-mascot-18.png'),
  require('@/assets/mascot/ivy-mascot-19.png'),
  require('@/assets/mascot/ivy-mascot-20.png'),
  require('@/assets/mascot/ivy-mascot-21.png'),
  require('@/assets/mascot/ivy-mascot-22.png'),
  require('@/assets/mascot/ivy-mascot-23.png'),
  require('@/assets/mascot/ivy-mascot-24.png'),
  require('@/assets/mascot/ivy-mascot-25.png'),
  require('@/assets/mascot/ivy-mascot-26.png'),
  require('@/assets/mascot/ivy-mascot-27.png'),
  require('@/assets/mascot/ivy-mascot-28.png'),
  require('@/assets/mascot/ivy-mascot-29.png'),
  require('@/assets/mascot/ivy-mascot-30.png'),
  require('@/assets/mascot/ivy-mascot-31.png'),
  require('@/assets/mascot/ivy-mascot-32.png'),
  require('@/assets/mascot/ivy-mascot-33.png'),
  require('@/assets/mascot/ivy-mascot-34.png'),
  require('@/assets/mascot/ivy-mascot-35.png'),
]
const STILL = require('@/assets/mascot/ivy-mascot-still.png')

/** Set when she starts playing: once per launch. */
let played = false
/** Tests only: a fresh launch. */
export function resetMascotForTests() {
  played = false
}

/** 'play' while the frames run; 'still' after, or from the start. */
type Phase = 'wait' | 'play' | 'still'

export function MyThingsIcon() {
  const [phase, setPhase] = useState<Phase>(() => (played ? 'still' : 'wait'))
  const [frame, setFrame] = useState(0)
  const [broken, setBroken] = useState(false)
  const clock = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (phase !== 'wait') return
    let live = true
    Promise.all([AccessibilityInfo.isReduceMotionEnabled().catch(() => false), Asset.loadAsync([...FRAMES, STILL]).then(() => true, () => false)]).then(
      ([still, loaded]) => {
        if (!live) return
        played = true
        setPhase(still || !loaded ? 'still' : 'play')
      }
    )
    return () => {
      live = false
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'play') return
    const id = clock.addListener(({ value }) => setFrame(Math.min(FRAMES.length - 1, Math.floor(value))))
    const run = Animated.timing(clock, { toValue: FRAMES.length, duration: (FRAMES.length * 1000) / FPS, easing: Easing.linear, useNativeDriver: false })
    run.start(() => setPhase('still'))
    return () => {
      run.stop()
      clock.removeListener(id)
    }
  }, [phase, clock])

  return (
    <Pressable
      onPress={() => router.push('/things')}
      style={styles.slot}
      accessibilityRole="button"
      accessibilityLabel="My things"
      testID="header-things"
    >
      {broken ? (
        <Text style={styles.glyph} testID="mascot-fallback">
          ☰
        </Text>
      ) : phase === 'still' ? (
        <Image source={STILL} style={styles.slot} contentFit="contain" onError={() => setBroken(true)} testID="mascot-still" />
      ) : (
        // While she's waiting to play, frame 0 holds the slot.
        <Image source={FRAMES[frame]} style={styles.slot} contentFit="contain" testID={`mascot-frame-${frame}`} />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  slot: { width: MY_THINGS_ICON, height: MY_THINGS_ICON, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 24, lineHeight: 28, color: colour.Ink, includeFontPadding: false },
})
