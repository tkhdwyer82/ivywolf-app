// apps/mobile/components/HomeDirectionTile.tsx
// The one outside tile a day on Home (v4, 1737:152): today's direction (lib/directionOfDay.ts) as a picture — its
// first stock reference, else its project's hue — with the lime pill "IVY · DIRECTION", then its title and its cite
// line, "from Thu 0:31 · Restock Reel". Tap opens that project's More ideas. Hold is given by Home (Save / Not this).

import { useState } from 'react'
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native'
import { Image } from 'expo-image'
import { colour, hueOf } from '@ivywolf/ui'
import { GRID, tileHeight } from '@/lib/home'
import { directionMeta, type HomeDirection } from '@/lib/directionOfDay'
import { resolvePicture, type Picture, type ReferencePicture } from '@/lib/picture'
import { HOLD_MS } from '@/components/HoldArc'

export function HomeDirectionTile({
  direction,
  reference,
  onOpen,
  onLongPress,
  onCredit,
}: {
  direction: HomeDirection
  /** Its picture, once found; null while finding or when there's none (the hue). */
  reference: ReferencePicture | null
  onOpen?: () => void
  onLongPress?: (e: GestureResponderEvent) => void
  onCredit?: (p: Picture) => void
}) {
  const [credit, setCredit] = useState(false)
  const p = resolvePicture({ own: [], unsplash: null, reference })
  const meta = directionMeta(direction)
  return (
    <View testID={`home-direction-${direction.id}`}>
      <Pressable
        onPress={onOpen}
        onLongPress={onLongPress}
        delayLongPress={HOLD_MS}
        accessibilityRole="button"
        accessibilityLabel={`Ivy, a direction: ${direction.title}. ${meta}`}
        accessibilityHint="Opens More ideas. Hold for Save or Not this."
      >
        <View style={[styles.picture, { height: tileHeight(direction.id), backgroundColor: hueOf(direction.hue) }]}>
          {p.uri && <Image source={{ uri: p.uri }} recyclingKey={direction.id} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />}
          <View style={styles.pill}>
            <Text style={styles.pillText}>IVY · DIRECTION</Text>
          </View>
        </View>
      </Pressable>
      <Pressable onPress={p.credit ? () => setCredit((c) => !c) : undefined} disabled={!p.credit} style={styles.caption}>
        <Text style={styles.title} numberOfLines={2}>
          {direction.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        {credit && p.credit && (
          <Text style={styles.meta} numberOfLines={1}>
            {p.credit.provider === 'Unsplash' ? 'Photo by ' : 'Image by '}
            <Text style={styles.link} onPress={() => onCredit?.(p)} accessibilityRole="link">
              {p.credit.name}
            </Text>
            {` on ${p.credit.provider}`}
          </Text>
        )}
      </Pressable>
    </View>
  )
}

// Figma 1737:153 — measured: the pill lime, Semibold 10 tracked 0.6, 8 × 4, radius 8, 10 in from the corner.
const styles = StyleSheet.create({
  picture: { borderRadius: GRID.corner, borderCurve: 'continuous', overflow: 'hidden' },
  pill: { position: 'absolute', left: 10, top: 10, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colour.Lime },
  pillText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.6, color: colour.Ink },
  caption: { paddingHorizontal: 4, paddingBottom: GRID.after },
  title: { fontSize: GRID.title, lineHeight: GRID.titleLine, fontWeight: '600', color: colour.Ink, marginTop: GRID.titleGap },
  meta: { fontSize: GRID.meta, lineHeight: GRID.metaLine, color: colour.Grey, marginTop: GRID.metaGap },
  link: { textDecorationLine: 'underline' },
})
