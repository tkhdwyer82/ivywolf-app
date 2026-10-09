// apps/mobile/components/CollapsingHeader.tsx
// Home's header, Pinterest-style: a logo row over a chips row, floating over the feed.
// - The status-bar strip is always opaque; tiles never show behind the clock.
// - The logo row (49) moves up 1:1 with scroll-down and is faded out by half its travel; the chips row (41) rides up
//   to sit directly under the status bar.
// - Any scroll-up brings the logo row back (diff-clamp), wherever you are in the feed.
// - On release, a half-shown logo row snaps open or closed (200 ms).
// Wire useCollapsingHeader().onScroll to the feed (an Animated FlashList) and pad the feed by useHeaderInset().

import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colour, space } from '@ivywolf/ui'

// Pinterest-measured, not tokens: logo row 49, chips row 41, 8 of air before the first row; a hairline under the
// chips once the logo row is mostly gone.
export const LOGO_ROW_H = 49
export const CHIP_ROW_H = 41
const FEED_GAP = 8
const SNAP_MS = 200
const HAIRLINE = 'rgba(0,0,0,0.08)'

/**
 * `hidden` runs 0 (logo row shown) → LOGO_ROW_H (hidden). `onScroll` and `onBeginDrag` are the screen's own JS
 * handlers, called from the UI thread — a worklet handler takes over the list's scroll events.
 */
export function useCollapsingHeader({ onScroll, onBeginDrag }: { onScroll?: () => void; onBeginDrag?: () => void } = {}) {
  const hidden = useSharedValue(0)
  const lastY = useSharedValue(0)

  const handler = useAnimatedScrollHandler(
    {
      onBeginDrag: (e) => {
        lastY.value = Math.max(0, e.contentOffset.y)
        if (onBeginDrag) scheduleOnRN(onBeginDrag)
      },
      onScroll: (e) => {
        // Ignore the rubber-band at the top and bottom.
        const maxY = Math.max(0, e.contentSize.height - e.layoutMeasurement.height)
        const y = Math.min(Math.max(0, e.contentOffset.y), maxY)
        const dy = y - lastY.value
        lastY.value = y
        // Near the very top the logo row is never more hidden than the distance scrolled.
        hidden.value = Math.min(LOGO_ROW_H, Math.max(0, hidden.value + dy), y)
        if (onScroll) scheduleOnRN(onScroll)
      },
      onEndDrag: (e) => {
        if (Math.abs(e.velocity?.y ?? 0) < 0.2) snap(hidden, lastY) // no fling → snap now
      },
      onMomentumEnd: () => {
        snap(hidden, lastY)
      },
    },
    [onScroll, onBeginDrag]
  )

  return { hidden, onScroll: handler }
}

function snap(hidden: SharedValue<number>, lastY: SharedValue<number>) {
  'worklet'
  const target = hidden.value > LOGO_ROW_H / 2 && lastY.value > LOGO_ROW_H ? LOGO_ROW_H : 0
  hidden.value = withTiming(target, { duration: SNAP_MS, easing: Easing.out(Easing.cubic) })
}

/** The feed's contentContainerStyle paddingTop (and scrollIndicatorInsets.top): the first row starts under the header. */
export function useHeaderInset() {
  const insets = useSafeAreaInsets()
  return insets.top + LOGO_ROW_H + CHIP_ROW_H + FEED_GAP
}

/**
 * Render after the feed and before anything that must sit over it (sheets, the hold arc). `logo` is the wordmark,
 * `right` search + the avatar, `chips` the chips row's content; without chips there's no chips row.
 */
export function CollapsingHeader({
  hidden,
  logo,
  right,
  chips,
}: {
  hidden: SharedValue<number>
  logo: ReactNode
  right?: ReactNode
  chips?: ReactNode
}) {
  const insets = useSafeAreaInsets()

  const blockStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -hidden.value }] }))
  // Gone by half-travel.
  const logoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(hidden.value, [0, LOGO_ROW_H * 0.5], [1, 0], Extrapolation.CLAMP),
  }))
  const hairlineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(hidden.value, [LOGO_ROW_H * 0.6, LOGO_ROW_H], [0, 1], Extrapolation.CLAMP),
  }))

  return (
    <>
      <Animated.View style={[styles.block, { top: insets.top }, blockStyle]} pointerEvents="box-none">
        <Animated.View style={[styles.logoRow, logoStyle]}>
          {logo}
          <View style={styles.right}>{right}</View>
        </Animated.View>
        {chips && (
          <View style={styles.chipRow}>
            {chips}
            <Animated.View style={[styles.hairline, hairlineStyle]} />
          </View>
        )}
      </Animated.View>

      {/* Status-bar strip: always over the block, always opaque. */}
      <View style={[styles.statusStrip, { height: insets.top }]} pointerEvents="none" />
    </>
  )
}

const styles = StyleSheet.create({
  statusStrip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colour.Surface },
  block: { position: 'absolute', left: 0, right: 0, backgroundColor: colour.Surface },
  logoRow: {
    height: LOGO_ROW_H,
    paddingHorizontal: space.margin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.stack },
  chipRow: { height: CHIP_ROW_H, justifyContent: 'center' },
  hairline: { position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: HAIRLINE },
})
