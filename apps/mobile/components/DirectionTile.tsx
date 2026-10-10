// apps/mobile/components/DirectionTile.tsx
// A direction on More ideas (Job H, Figma 165:423; tile styling 227:2 v3.4): the project's gradient bed (a direction
// never has a frame), the cite pill top-left (her words, one line), the title bottom-left, and the lime + bottom-right
// — Save, and the screen's one lime thing. Tap shows the gist. Hold for the arc (♥ · Save · Link to… · Not this),
// like every other tile; there is no row of buttons.
// Under it, the references strip: 3 free references that steer the look (packages/pipeline/references). Tap one for
// its credit and a way to open its source. Unsplash and Pixabay fill their square; a Pinterest pin is shown whole,
// never cropped or covered (Pinterest terms, packages/schema/pinterest.ts).

import { useState } from 'react'
import { ActionSheetIOS, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import * as WebBrowser from 'expo-web-browser'
import { SymbolView } from 'expo-symbols'
import { colour, radius, size, space, type } from '@ivywolf/ui'
import { gradientOf } from '@ivywolf/ui/theme/gradients'
import { tileHeight } from '@/lib/home'
import { HOLD_MS } from '@/components/HoldArc'
import type { Direction, Reference } from '@/lib/directions'

// Figma 165:423 — measured, not tokens: pill 10 in from the corner, Caption on white, 2 lines; title Heading / Card,
// 14 in; the + disc is size/pin (30) at 12 in. The strip is 3 equal squares, gutter/2 apart, gutter under the tile.
const PILL_INSET = 10
const TITLE_INSET = 14
const PLUS_INSET = 12
const STRIP_GAP = space.gutter / 2
const STRIP_RADIUS = 10

const SOURCE_NAME: Record<Reference['source'], string> = { unsplash: 'Unsplash', pixabay: 'Pixabay', pinterest: 'Pinterest' }

/** "from Thu 0:31: “…”" → "From Thu 0:31 · “…”" for the pill. */
const pillText = (why: string) => why.replace(/^from ([^:]+:\d\d): /, (_m, at: string) => `From ${at} · `)

export function DirectionTile({
  direction,
  gradient,
  width,
  onSave,
  onLongPress,
  onReference,
}: {
  direction: Direction
  /** The project's gradient name (0034). */
  gradient: string | null
  width: number
  onSave: (d: Direction) => void
  /** Hold for the arc. */
  onLongPress?: (e: GestureResponderEvent) => void
  /** She opened a reference (for Unsplash's download event). */
  onReference?: (r: Reference) => void
}) {
  const [open, setOpen] = useState(false)
  const g = gradientOf(gradient)
  const fg = g.ink ? colour.Ink : colour.Surface

  const showReference = (r: Reference) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: r.credit.name, options: [`Open on ${SOURCE_NAME[r.source]}`, 'Cancel'], cancelButtonIndex: 1 },
      (i) => {
        if (i !== 0) return
        onReference?.(r)
        WebBrowser.openBrowserAsync(r.link_url).catch(() => {})
      }
    )

  return (
    <View style={{ width }} testID={`direction-${direction.id}`}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        onLongPress={onLongPress}
        delayLongPress={HOLD_MS}
        accessibilityRole="button"
        accessibilityLabel={`${direction.title}. ${direction.why}`}
        accessibilityHint="Shows what it is. Hold for Like, Save, Link to or Not this."
      >
        <LinearGradient colors={g.colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.tile, { minHeight: tileHeight(direction.id) }]}>
          <View style={styles.pill}>
            <Text style={styles.pillText} numberOfLines={2}>
              {pillText(direction.why)}
            </Text>
          </View>
          <View style={styles.bottom}>
            <Text style={[styles.title, { color: fg }]} numberOfLines={open ? undefined : 3}>
              {direction.title}
            </Text>
            {open && !!direction.gist && <Text style={[styles.gist, { color: fg }]}>{direction.gist}</Text>}
          </View>
          <Pressable onPress={() => onSave(direction)} hitSlop={(size.tap - size.pin) / 2} style={styles.plus} accessibilityRole="button" accessibilityLabel={`Save ${direction.title}`} testID={`direction-save-${direction.id}`}>
            <SymbolView name="plus" tintColor={colour.Ink} size={16} weight="semibold" />
          </Pressable>
        </LinearGradient>
      </Pressable>

      {direction.references.length > 0 && (
        <View style={styles.strip} accessibilityLabel="References">
          {direction.references.slice(0, 3).map((r) => {
            const side = (width - STRIP_GAP * 2) / 3
            return (
              <Pressable key={`${r.source}:${r.id}`} onPress={() => showReference(r)} accessibilityRole="button" accessibilityLabel={`Reference: ${r.credit.name}`}>
                <View style={[styles.thumb, { width: side, height: side }]}>
                  <Image
                    source={{ uri: r.thumb_url }}
                    style={StyleSheet.absoluteFill}
                    // Pinterest: shown whole, never cropped (its terms). Stock photos fill the square.
                    contentFit={r.source === 'pinterest' ? 'contain' : 'cover'}
                    accessibilityIgnoresInvertColors
                  />
                </View>
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.tile, borderCurve: 'continuous', overflow: 'hidden', justifyContent: 'space-between', paddingBottom: TITLE_INSET + size.pin / 2 },
  pill: { alignSelf: 'flex-start', margin: PILL_INSET, maxWidth: '86%', backgroundColor: colour.Surface, borderRadius: radius.chip / 2 + 2, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { ...type['Caption'], color: colour.Ink },
  bottom: { paddingHorizontal: TITLE_INSET, paddingRight: TITLE_INSET + size.pin },
  title: { ...type['Heading / Card'] },
  gist: { ...type['Body / Small'], marginTop: 6, opacity: 0.85 },
  plus: {
    position: 'absolute',
    right: PLUS_INSET,
    bottom: PLUS_INSET,
    width: size.pin,
    height: size.pin,
    borderRadius: size.pin / 2,
    backgroundColor: colour.Lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strip: { flexDirection: 'row', gap: STRIP_GAP, marginTop: space.gutter / 2 },
  thumb: { borderRadius: STRIP_RADIUS, overflow: 'hidden', backgroundColor: colour.Chip },
})
