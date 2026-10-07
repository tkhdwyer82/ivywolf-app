// apps/mobile/components/LinkMode.tsx
// Link ideas (Job C+, Figma 1459:4 link mode, 1459:109 linked). From the hold arc (or an idea's •••): the idea she
// held is "linking from", with a blue outline; every other idea gets a + (a blue ✓ once linked; to-dos are dimmed),
// and Ivy's merge suggestions for it show as suggested links. Blue lines join the linked cards. A big black
// "Done · N linked" replaces the nav; after Done, a toast says how many she linked, with Undo.
// Links are made as she taps (and unmade on a second tap), so nothing is lost if she leaves without Done.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { colour, space } from '@ivywolf/ui'

export const LINK_BLUE = '#2F6BFF'

/** A card's mark in link mode. */
export type LinkMark = 'from' | 'linked' | 'open' | 'suggested' | 'dimmed'

// Figma 1459:4 — measured: markers 30 (glyph 14), 10 in from the tile's top-right; the outline 3 wide, 2 outside the
// tile; LINKING FROM Bold 9 on blue, 7 × 3; the banner 40 tall at radius 20; Done 200 × 56 at radius 28.
const MARK = 30
const MARK_INSET = 10
const OUTLINE = 3
const DONE_W = 200
const DONE_H = 56
const BANNER_H = 40
const DOT = 7

/** Over a tile in link mode. Draws only; the tile's own press does the linking. */
export function LinkMarkView({ mark }: { mark: LinkMark }) {
  if (mark === 'dimmed') return <View style={[StyleSheet.absoluteFill, styles.dim]} pointerEvents="none" />
  if (mark === 'from')
    return (
      <View style={styles.fromWrap} pointerEvents="none">
        <View style={styles.outline} />
        <View style={styles.fromPill}>
          <Text style={styles.fromText}>LINKING FROM</Text>
        </View>
      </View>
    )
  const on = mark === 'linked'
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.mark, on ? styles.markOn : styles.markOff, mark === 'suggested' && styles.markSuggested]}>
        <SymbolView name={on ? 'checkmark' : 'plus'} tintColor={on ? colour.Surface : mark === 'suggested' ? LINK_BLUE : colour.Ink} size={14} weight="bold" />
      </View>
      {mark === 'suggested' && (
        <View style={styles.suggestedPill}>
          <Text style={styles.suggestedText}>IVY SUGGESTS</Text>
        </View>
      )}
    </View>
  )
}

/** Linked cards show a small link count (1459:109): a blue pill, top right. */
export function LinkBadge({ count }: { count: number }) {
  if (count < 1) return null
  return (
    <View style={styles.badge} pointerEvents="none" accessibilityLabel={`Linked to ${count} ${count === 1 ? 'idea' : 'ideas'}`}>
      <SymbolView name="link" tintColor={colour.Surface} size={11} weight="bold" />
      <Text style={styles.badgeText}>{count}</Text>
    </View>
  )
}

/** "Linking from <title>" — where Ivy's line and the chips' top would be. */
export function LinkBanner({ title }: { title: string }) {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerLabel}>Linking from </Text>
      <Text style={styles.bannerTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  )
}

/** The big black Done, in the nav's place. */
export function LinkDone({ count, onDone }: { count: number; onDone: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.doneWrap, { bottom: Math.max(insets.bottom, space.stack) + 8 }]} pointerEvents="box-none">
      <Pressable onPress={onDone} style={styles.done} accessibilityRole="button" accessibilityLabel={`Done, ${count} linked`}>
        <Text style={styles.doneText}>Done · {count} linked</Text>
      </Pressable>
    </View>
  )
}

/** A short-lived ink toast with an optional action ("2 ideas linked · Undo"). Gone after `ms`. */
export function Toast({ text, action, onAction, onGone, ms = 4000 }: { text: string; action?: string; onAction?: () => void; onGone: () => void; ms?: number }) {
  const insets = useSafeAreaInsets()
  const fade = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start()
    const t = setTimeout(onGone, ms)
    return () => clearTimeout(t)
  }, [fade, onGone, ms])
  return (
    <Animated.View style={[styles.toast, { bottom: Math.max(insets.bottom, space.stack) + 84, opacity: fade }]} accessibilityLiveRegion="polite">
      <SymbolView name="checkmark" tintColor={colour.Lime} size={16} weight="bold" />
      <Text style={styles.toastText}>{text}</Text>
      {action && onAction && (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
          <Text style={styles.toastAction}>{action}</Text>
        </Pressable>
      )}
    </Animated.View>
  )
}

// ── The blue lines ──────────────────────────────────────────────────────────────────────────────────────────────

type Rect = { x: number; y: number; w: number; h: number }
export interface LinkLinesHandle {
  /** Measure again — after a scroll, or when the links change. */
  remeasure: () => void
}

/**
 * Lines from the "linking from" card to each card it's linked to, edge to edge with a dot at each end, drawn over the
 * screen. Cards report their views through `register`; only the ones on screen are measured and drawn.
 */
export const LinkLines = forwardRef<LinkLinesHandle, { from: string; to: string[]; views: Map<string, View> }>(function LinkLines({ from, to, views }, ref) {
  const [rects, setRects] = useState<Map<string, Rect>>(new Map())
  const root = useRef<View>(null)
  const pending = useRef(false)

  const remeasure = useCallback(() => {
    if (pending.current) return
    pending.current = true
    requestAnimationFrame(() => {
      pending.current = false
      const ids = [from, ...to]
      const out = new Map<string, Rect>()
      let left = ids.length
      const done = () => --left === 0 && setRects(out)
      root.current?.measureInWindow((ox, oy) => {
        for (const id of ids) {
          const v = views.get(id)
          if (!v) {
            done()
            continue
          }
          v.measureInWindow((x, y, w, h) => {
            if (w > 0) out.set(id, { x: x - ox, y: y - oy, w, h })
            done()
          })
        }
      })
    })
  }, [from, to, views])
  useImperativeHandle(ref, () => ({ remeasure }), [remeasure])
  useEffect(remeasure, [remeasure])

  const a = rects.get(from)
  return (
    <View ref={root} style={StyleSheet.absoluteFill} pointerEvents="none">
      {a &&
        to.map((id) => {
          const b = rects.get(id)
          if (!b) return null
          const [p, q] = edgeToEdge(a, b)
          const len = Math.hypot(q.x - p.x, q.y - p.y)
          const angle = Math.atan2(q.y - p.y, q.x - p.x)
          return (
            <View key={id}>
              <View
                style={[
                  styles.line,
                  { left: (p.x + q.x) / 2 - len / 2, top: (p.y + q.y) / 2 - 1, width: len, transform: [{ rotate: `${angle}rad` }] },
                ]}
              />
              <View style={[styles.dot, { left: p.x - DOT / 2, top: p.y - DOT / 2 }]} />
              <View style={[styles.dot, { left: q.x - DOT / 2, top: q.y - DOT / 2 }]} />
            </View>
          )
        })}
    </View>
  )
})

/** The segment between two rects' centres, cut where it leaves each rect. */
export function edgeToEdge(a: Rect, b: Rect): [{ x: number; y: number }, { x: number; y: number }] {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const exit = (c: { x: number; y: number }, r: Rect, dx: number, dy: number) => {
    const tx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx)
    const ty = dy === 0 ? Infinity : r.h / 2 / Math.abs(dy)
    const t = Math.min(tx, ty, 1)
    return { x: c.x + dx * t, y: c.y + dy * t }
  }
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  return [exit(ca, a, dx, dy), exit(cb, b, -dx, -dy)]
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 14 },
  fromWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  outline: { position: 'absolute', left: -2, right: -2, top: -2, bottom: -2, borderWidth: OUTLINE, borderColor: LINK_BLUE, borderRadius: 22 },
  fromPill: { position: 'absolute', left: 10, bottom: 10, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: LINK_BLUE },
  fromText: { fontSize: 9, fontWeight: '700', color: colour.Surface },
  mark: {
    position: 'absolute',
    top: MARK_INSET,
    right: MARK_INSET,
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  markOff: { backgroundColor: colour.Surface },
  markOn: { backgroundColor: LINK_BLUE, borderWidth: 2, borderColor: colour.Surface },
  markSuggested: { borderWidth: 2, borderColor: LINK_BLUE },
  suggestedPill: { position: 'absolute', left: 10, bottom: 10, borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: colour.Surface, borderWidth: 1, borderColor: LINK_BLUE },
  suggestedText: { fontSize: 9, fontWeight: '700', color: LINK_BLUE },
  badge: {
    position: 'absolute',
    top: MARK_INSET,
    right: MARK_INSET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: LINK_BLUE,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colour.Surface },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BANNER_H,
    borderRadius: BANNER_H / 2,
    paddingHorizontal: 16,
    marginHorizontal: space.margin,
    marginTop: space.gutter,
    backgroundColor: colour.Chip,
  },
  bannerLabel: { fontSize: 13, color: colour.Grey },
  bannerTitle: { fontSize: 13, fontWeight: '600', color: colour.Ink, flexShrink: 1 },
  doneWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  done: {
    width: DONE_W,
    height: DONE_H,
    borderRadius: DONE_H / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colour.Ink,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  doneText: { fontSize: 16, fontWeight: '600', color: colour.Surface },
  toast: {
    position: 'absolute',
    left: 40,
    right: 40,
    height: 50,
    borderRadius: 25,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colour.Ink,
  },
  toastText: { flex: 1, fontSize: 15, fontWeight: '500', color: colour.Surface },
  toastAction: { fontSize: 15, fontWeight: '600', color: colour.Lime },
  line: { position: 'absolute', height: 2, backgroundColor: LINK_BLUE },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: LINK_BLUE },
})
