// apps/mobile/components/IdeaTile.tsx
// An idea on Home v4 (Figma 1737:5): visual first. Every idea is a picture (lib/picture.ts: her own, else its
// Unsplash photo, else its reference, else the project's flat hue while one is found) with the form drawn on it:
//   quote — the line in white on a bottom scrim (1737:136);
//   board — 3-up: its picture and two more from its thread (just its own picture until the thread has three);
//   text, diagram, photo — the picture as is, the title under it.
// A take from the Create flow shows its still with "▶ 0:03" (1737:143); on Home video plays only when earned, so it
// never plays here. The hue block carries the title itself (1737:140) and "finding a picture…" in the meta while the
// pipeline is still looking.
// B.5: a card filed in one of her projects carries the project over the picture — a gradient on its lower 40 % (ink
// 35 % → clear) and the name bottom-left, Semibold 13 white, 12 in, with a ›. Tapping the name opens the project; the
// rest of the tile opens the card. Unfiled cards (My things) have no overlay.
// Under the picture: 8, the title (Semibold 15, two lines), 3, the time (Regular 11) — then 18 to the next tile.
// The credit is shown on tap of the words under the picture; opening its source is "use" (Unsplash's download event).

import { useState } from 'react'
import { router } from 'expo-router'
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

/** The picture box: corners, clipped, Shimmer grey under a picture that's still loading. */
export const pictureBox = () => styles.picture

/** Under the tile, the time only (B.5) — the project is on the picture — and "finding a picture…" while it's new. */
export function ideaMeta(card: CardItem, picture: Picture = card.picture): string {
  return [clock(card.playFromMs), findingPicture(picture, card.createdAt) ? 'finding a picture…' : null].filter(Boolean).join(' · ')
}

export function IdeaTile({
  card,
  height,
  trio,
  pinned,
  onCredit,
  overlay = false,
}: {
  card: CardItem
  /** The picture's height (the masonry's stable jitter). */
  height: number
  /** A board's 3-up: two more pictures from its thread. */
  trio?: Picture[]
  pinned?: boolean
  /** She opened the credit's source (the download event, for Unsplash). */
  onCredit?: (p: Picture) => void
  /** Home and search: the project's name over a filed card's picture (B.5). Not on the project's own page. */
  overlay?: boolean
}) {
  return (
    <View>
      <View style={[styles.picture, { height }]}>
        <IdeaPicture card={card} trio={trio} pinned={pinned} overlay={overlay} />
      </View>
      <IdeaCaption card={card} onCredit={onCredit} />
    </View>
  )
}

/** What fills an idea's picture box: the picture, its form on it, the pin. The box (size, corners) is the caller's. */
export function IdeaPicture({ card, trio, pinned, badged, overlay }: {
  card: CardItem
  trio?: Picture[]
  pinned?: boolean
  badged?: boolean
  /** A tile in a feed: the project's name over the picture when it's filed (B.5). */
  overlay?: boolean
}) {
  const p = card.picture
  const project = overlay && card.filed && card.projectName ? card.projectName : null
  const quote = card.shape === 'quote' && card.quote && p.source !== 'hue'
  const board = card.shape === 'board' && p.source !== 'hue'
  const three = board ? distinct([p, ...(trio ?? [])]) : []
  return (
    <>
      {p.source === 'hue' ? (
        <View style={[StyleSheet.absoluteFill, styles.hue, { backgroundColor: hueOf(card.hue) }]}>
          <Text style={[styles.hueTitle, badged && styles.underBadge]} numberOfLines={4}>
            {card.title}
          </Text>
        </View>
      ) : three.length >= 3 ? (
        <ThreeUp pictures={three} recyclingKey={card.id} />
      ) : (
        <Layer picture={p} recyclingKey={card.id} />
      )}
      {quote && (
        <>
          <LinearGradient colors={SCRIM} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Text style={[styles.quote, project && styles.quoteOverProject]} numberOfLines={4}>
            “{card.quote!.text}”
          </Text>
        </>
      )}
      {project && <ProjectOverlay name={project} projectId={card.projectId} />}
      {pinned && (
        <View style={styles.pin} pointerEvents="none" accessibilityLabel="Pinned">
          <SymbolView name="pin.fill" tintColor={p.source === 'hue' ? colour.Ink : colour.Surface} size={PIN} />
        </View>
      )}
    </>
  )
}

/** The project over a filed card's picture (B.5): its own tap opens the project, inside the tile's tap for the card. */
export function ProjectOverlay({ name, projectId }: { name: string; projectId: string }) {
  return (
    <>
      <LinearGradient colors={PROJECT_SCRIM} style={styles.projectScrim} pointerEvents="none" testID="project-overlay" />
      <Pressable
        onPress={() => router.push(`/project/${projectId}`)}
        hitSlop={OVERLAY_SLOP}
        style={styles.project}
        accessibilityRole="link"
        accessibilityLabel={`Open ${name}`}
        testID="project-overlay-name"
      >
        <Text style={styles.projectName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.projectChevron}>›</Text>
      </Pressable>
    </>
  )
}

/** Under the picture: the title (unless the picture carries it), the meta, and the credit once tapped. */
export function IdeaCaption({ card, onCredit }: { card: CardItem; onCredit?: (p: Picture) => void }) {
  const [credit, setCredit] = useState(false)
  const p = card.picture
  const lines = titleLines(card)
  return (
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
  )
}

/** One picture filling its box: an image, or a take's still. */
function Layer({ picture, recyclingKey }: { picture: Picture; recyclingKey: string }) {
  if (picture.kind === 'video' && picture.uri) return <TakeStill uri={picture.uri} />
  if (!picture.uri) return null
  return <Image source={{ uri: picture.uri }} recyclingKey={recyclingKey} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
}

/** Pictures with a uri, each once. */
export const distinct = (pictures: Picture[]) => pictures.filter((x, i) => x.uri && pictures.findIndex((y) => y.uri === x.uri) === i)

/** A board: its picture on the left, two more stacked on the right, 2 apart. The idea page draws it full-bleed. */
export function ThreeUp({ pictures, recyclingKey }: { pictures: Picture[]; recyclingKey: string }) {
  const [a, b, c] = pictures
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
// B.5: the project overlay — the lower 40 %, ink #1D1D1F from clear to 35 %; the name Semibold 13 white, 12 in.
const PROJECT_SCRIM = ['rgba(29,29,31,0)', 'rgba(29,29,31,0.35)'] as const
const PROJECT_INSET = 12
const OVERLAY_SLOP = { top: 10, bottom: 10, left: 12, right: 12 }
const TRIO_GAP = 2
const CAPTION_INSET = 4
const PIN = 16

const styles = StyleSheet.create({
  picture: { borderRadius: GRID.corner, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: colour.Shimmer },
  hue: { padding: HUE_PAD },
  hueTitle: { fontSize: 16, lineHeight: 20, fontWeight: '600', color: colour.Ink },
  // A deck's 🔗 badge sits top right; its hue title starts under it.
  underBadge: { marginTop: 22 },
  quote: { position: 'absolute', left: HUE_PAD, right: HUE_PAD, bottom: HUE_PAD, fontSize: 15, lineHeight: 18, fontWeight: '600', color: colour.Surface },
  // With the project under it, the quote sits a line higher.
  quoteOverProject: { bottom: PROJECT_INSET + 16 + 8 },
  projectScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%' },
  project: { position: 'absolute', left: PROJECT_INSET, bottom: PROJECT_INSET, right: PROJECT_INSET, flexDirection: 'row', alignItems: 'center', gap: 4 },
  projectName: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: colour.Surface, flexShrink: 1 },
  projectChevron: { fontSize: 15, lineHeight: 16, fontWeight: '600', color: colour.Surface },
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
