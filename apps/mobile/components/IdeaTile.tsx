// apps/mobile/components/IdeaTile.tsx
// An idea on Home v4 (Figma 1737:5): visual first. Every idea is a picture (lib/picture.ts: her own, else its
// Unsplash photo, else its reference, else the project's flat hue while one is found) with the form drawn on it:
//   quote — the line in white on a bottom scrim (1737:136);
//   board — 3-up: its picture and two more from its thread;
//   text, diagram, photo — the picture as is, the title under it.
// A take from the Create flow shows its still with "▶ 0:03" (1737:143); on Home video plays only when earned, so it
// never plays here. The hue block carries the title itself (1737:140) and "finding a picture…" in the meta while the
// pipeline is still looking.
// Under the picture: 8, the title (Semibold 13, two lines), 3, the meta (Regular 11) — then 18 to the next tile.
// The credit is shown on tap of the words under the picture; opening its source is "use" (Unsplash's download event).

import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useEvent } from 'expo'
import { SymbolView } from 'expo-symbols'
import { colour, hueOf } from '@ivywolf/ui'
import { clock } from '@/components/CardFace'
import { GRID, titleLines, type CardItem } from '@/lib/home'
import { findingPicture, takeLength, type Picture } from '@/lib/picture'

export function ideaMeta(card: CardItem, picture: Picture = card.picture): string {
  return [clock(card.playFromMs), card.projectName, findingPicture(picture, card.createdAt) ? 'finding a picture…' : null].filter(Boolean).join(' · ')
}

export function IdeaTile({
  card,
  height,
  trio,
  pinned,
  onCredit,
}: {
  card: CardItem
  /** The picture's height (the masonry's stable jitter). */
  height: number
  /** A board's 3-up: two more pictures from its thread. */
  trio?: Picture[]
  pinned?: boolean
  /** She opened the credit's source (the download event, for Unsplash). */
  onCredit?: (p: Picture) => void
}) {
  const [credit, setCredit] = useState(false)
  const p = card.picture
  const lines = titleLines(card)
  const quote = card.shape === 'quote' && card.quote && p.source !== 'hue'
  const board = card.shape === 'board' && p.source !== 'hue'

  return (
    <View>
      <View style={[styles.picture, { height }]}>
        {p.source === 'hue' ? (
          <View style={[StyleSheet.absoluteFill, styles.hue, { backgroundColor: hueOf(card.hue) }]}>
            <Text style={styles.hueTitle} numberOfLines={4}>
              {card.title}
            </Text>
          </View>
        ) : board ? (
          <ThreeUp pictures={[p, ...(trio ?? [])]} recyclingKey={card.id} />
        ) : (
          <Layer picture={p} recyclingKey={card.id} />
        )}
        {quote && (
          <>
            <LinearGradient colors={SCRIM} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <Text style={styles.quote} numberOfLines={4}>
              “{card.quote!.text}”
            </Text>
          </>
        )}
        {pinned && (
          <View style={styles.pin} pointerEvents="none" accessibilityLabel="Pinned">
            <SymbolView name="pin.fill" tintColor={p.source === 'hue' ? colour.Ink : colour.Surface} size={PIN} />
          </View>
        )}
      </View>
      <Pressable
        onPress={p.credit ? () => setCredit((c) => !c) : undefined}
        disabled={!p.credit}
        accessibilityRole={p.credit ? 'button' : undefined}
        accessibilityHint={p.credit ? 'Shows who made the picture.' : undefined}
        style={styles.caption}
      >
        {lines > 0 && (
          <Text style={styles.title} numberOfLines={2}>
            {card.title}
          </Text>
        )}
        <Text style={[styles.meta, lines === 0 && styles.metaAlone]} numberOfLines={1}>
          {ideaMeta(card)}
        </Text>
        {credit && p.credit && (
          <Text style={styles.credit} numberOfLines={1}>
            {p.credit.provider === 'Unsplash' ? 'Photo by ' : 'Image by '}
            <Text style={styles.creditLink} onPress={() => onCredit?.(p)} accessibilityRole="link">
              {p.credit.name}
            </Text>
            {` on ${p.credit.provider}`}
          </Text>
        )}
      </Pressable>
    </View>
  )
}

/** One picture filling its box: an image, or a take's still. */
function Layer({ picture, recyclingKey }: { picture: Picture; recyclingKey: string }) {
  if (picture.kind === 'video' && picture.uri) return <TakeStill uri={picture.uri} />
  if (!picture.uri) return null
  return <Image source={{ uri: picture.uri }} recyclingKey={recyclingKey} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
}

/** A board: its picture on the left, two more stacked on the right, 2 apart. Missing ones repeat the first. */
function ThreeUp({ pictures, recyclingKey }: { pictures: Picture[]; recyclingKey: string }) {
  const [a, b = a, c = b] = pictures.filter((x) => x.uri)
  return (
    <View style={[StyleSheet.absoluteFill, styles.trio]}>
      <View style={styles.trioMain}>
        <Layer picture={a} recyclingKey={`${recyclingKey}-a`} />
      </View>
      <View style={styles.trioSide}>
        <View style={styles.trioCell}>
          <Layer picture={b} recyclingKey={`${recyclingKey}-b`} />
        </View>
        <View style={styles.trioCell}>
          <Layer picture={c} recyclingKey={`${recyclingKey}-c`} />
        </View>
      </View>
    </View>
  )
}

/** A Create take, held on its first frame with its length (1737:148). Muted, never playing on Home. */
function TakeStill({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (pl) => {
    pl.muted = true
    pl.loop = false
  })
  const { status } = useEvent(player, 'statusChange', { status: player.status })
  return (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} pointerEvents="none" />
      {status === 'readyToPlay' && player.duration > 0 && (
        <View style={styles.take} pointerEvents="none">
          <Text style={styles.takeText}>{`▶  ${takeLength(player.duration)}`}</Text>
        </View>
      )}
    </>
  )
}

// Figma 1737:5 — measured: the hue block's title Semibold 16 / 20 at 14 in; the quote Semibold 15 / 18, white, 14 in,
// on a scrim from clear to black 65 %; the take chip ink at 70 % with white Semibold 10, 8 × 4, radius 8, 10 in. The
// caption sits 4 in from the picture's edge (24 against 20).
const HUE_PAD = 14
const SCRIM = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)'] as const
const TRIO_GAP = 2
const CAPTION_INSET = 4
const PIN = 16

const styles = StyleSheet.create({
  picture: { borderRadius: GRID.corner, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: colour.Shimmer },
  hue: { padding: HUE_PAD },
  hueTitle: { fontSize: 16, lineHeight: 20, fontWeight: '600', color: colour.Ink },
  quote: { position: 'absolute', left: HUE_PAD, right: HUE_PAD, bottom: HUE_PAD, fontSize: 15, lineHeight: 18, fontWeight: '600', color: colour.Surface },
  trio: { flexDirection: 'row', gap: TRIO_GAP },
  trioMain: { flex: 2, overflow: 'hidden' },
  trioSide: { flex: 1, gap: TRIO_GAP },
  trioCell: { flex: 1, overflow: 'hidden' },
  take: { position: 'absolute', left: 10, bottom: 10, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(29,29,31,0.7)' },
  takeText: { fontSize: 10, fontWeight: '600', color: colour.Surface },
  pin: { position: 'absolute', top: 12, right: 12 },
  caption: { paddingHorizontal: CAPTION_INSET, paddingBottom: GRID.after },
  title: { fontSize: GRID.title, lineHeight: GRID.titleLine, fontWeight: '600', color: colour.Ink, marginTop: GRID.titleGap },
  meta: { fontSize: GRID.meta, lineHeight: GRID.metaLine, color: colour.Grey, marginTop: GRID.metaGap },
  metaAlone: { marginTop: GRID.titleGap },
  credit: { fontSize: GRID.meta, lineHeight: GRID.metaLine, color: colour.Grey, marginTop: GRID.metaGap },
  creditLink: { textDecorationLine: 'underline' },
})
