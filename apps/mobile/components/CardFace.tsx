// apps/mobile/components/CardFace.tsx
// The form an idea takes (Job B revised, Figma 227:5 "S1 Home · mixed feed"): Ivy picks it from what was said;
// she can change it from the idea page's •••.
//   photo   — an Unsplash photograph (or her own picture) with a PHOTO pill; under it the title and the credit
//             "Photo by <name> on Unsplash". The credit is on the tile and the idea page (Unsplash guidelines).
//   quote   — the exact line, big; who said it, when it isn't her; a dark ▶ chip that plays from play_from_ms.
//   diagram — OLD VS NEW: rows of from → to, drawn natively (never a generated image).
//   board   — dark card: the hook, a lime dot per beat, and the thread's stage as a lime pill (BOARD · READY).
//   text    — a plain card, title and gist: the low-confidence fallback.
// `size` is 'tile' in a masonry and 'page' at the top of the idea page (bigger type, the same parts).

import { Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { colour, radius, space, type } from '@ivywolf/ui'
import type { CardItem } from '@/lib/home'
import { Shimmer } from '@/components/Shimmer'

/** Where it was said, as the quote chip names it: "Mini · 12:40". */
const SOURCE: Record<string, string> = {
  phone: 'Phone',
  note_taker: 'Note taker',
  mini: 'Mini',
  dji_import: 'DJI',
  file_import: 'File',
  reference_clip: 'Clip',
  interview: 'Interview',
  muse: 'Muse',
}
export const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const playChip = (card: Pick<CardItem, 'recordingSource' | 'playFromMs'>) =>
  [card.recordingSource ? SOURCE[card.recordingSource] ?? null : null, clock(card.playFromMs)].filter(Boolean).join(' · ')

export const SHAPE_NAME: Record<CardItem['shape'], string> = {
  photo: 'Photo',
  quote: 'Quote',
  diagram: 'Comparison',
  board: 'Board',
  text: 'Text',
}
const STAGE: Record<string, string> = { sparked: 'SPARKED', developing: 'DEVELOPING', ready: 'READY', shipped: 'SHIPPED' }

type Size = 'tile' | 'page'

export function CardFace({
  card,
  size = 'tile',
  photoHeight,
  playing,
  onPlay,
  style,
}: {
  card: CardItem
  size?: Size
  /** The photo's height (the masonry's stable jitter on a tile, the frame height on the idea page). */
  photoHeight: number
  /** The ▶ chip is showing pause. */
  playing?: boolean
  /** Play from play_from_ms. Without it the chip is drawn but not a button. */
  onPlay?: () => void
  style?: StyleProp<ViewStyle>
}) {
  const page = size === 'page'
  switch (card.shape) {
    case 'quote':
      if (card.quote)
        return (
          <View style={[styles.box, styles.quoteBox, page && styles.boxPage, style]}>
            <Text style={[styles.quoteMark, page && styles.quoteMarkPage]} accessibilityElementsHidden>
              “
            </Text>
            <Text style={[styles.quoteText, page && styles.quoteTextPage]}>{card.quote.text}</Text>
            {!!card.quote.speaker && <Text style={styles.speaker}>— {card.quote.speaker}</Text>}
            <PlayChip label={playChip(card)} playing={playing} onPress={onPlay} />
          </View>
        )
      break
    case 'diagram':
      if (card.diagram)
        return (
          <View style={[styles.box, styles.diagramBox, page && styles.boxPage, style]}>
            {!!card.diagram.title && <Text style={styles.overline}>{card.diagram.title.toUpperCase()}</Text>}
            {card.diagram.rows.map((r, i) => (
              <View key={i} style={styles.row}>
                <View style={[styles.cell, styles.cellFrom]}>
                  <Text style={[styles.cellText, page && styles.cellTextPage]} numberOfLines={2}>
                    {r.from}
                  </Text>
                </View>
                <Arrow />
                <View style={[styles.cell, styles.cellTo]}>
                  <Text style={[styles.cellText, page && styles.cellTextPage]} numberOfLines={2}>
                    {r.to}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )
      break
    case 'board':
      if (card.board)
        return (
          <View style={[styles.box, styles.boardBox, page && styles.boxPage, style]}>
            <Text style={[styles.boardTitle, page && styles.boardTitlePage]} numberOfLines={2}>
              {card.board.hook || card.title}
            </Text>
            {card.board.beats.map((b, i) => (
              <View key={i} style={styles.beat}>
                <View style={styles.beatDot} />
                <Text style={[styles.beatText, page && styles.beatTextPage]} numberOfLines={1}>
                  {b}
                </Text>
              </View>
            ))}
            <View style={styles.statusPill}>
              <Text style={styles.pillText}>BOARD · {STAGE[card.threadStage ?? 'sparked']}</Text>
            </View>
          </View>
        )
      break
    case 'photo':
      return (
        <View style={style}>
          <View style={[styles.photo, { height: photoHeight }]}>
            <Shimmer style={StyleSheet.absoluteFill} />
            {card.frameStatus === 'done' && !!card.frameUrl && (
              <Image
                source={{ uri: card.frameUrl }}
                recyclingKey={card.id}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
                accessibilityIgnoresInvertColors
              />
            )}
            {!page && (
              <View style={styles.photoPill}>
                <Text style={styles.pillText}>PHOTO</Text>
              </View>
            )}
          </View>
          {!page && (
            <Text style={styles.photoTitle} numberOfLines={2}>
              {card.title}
            </Text>
          )}
          {card.credit && <Credit card={card} linked={page} />}
        </View>
      )
  }
  // text — and any shape whose payload is missing.
  return (
    <View style={[styles.box, styles.textBox, page && styles.boxPage, style]}>
      <Text style={[styles.textTitle, page && styles.textTitlePage]} numberOfLines={page ? undefined : 3}>
        {card.title}
      </Text>
      {!!card.gist && (
        <Text style={[styles.textGist, page && styles.textGistPage]} numberOfLines={page ? undefined : 4}>
          {card.gist}
        </Text>
      )}
    </View>
  )
}

/** "Photo by <name> on Unsplash". On the idea page both names link back (utm already on the stored URLs). */
export function Credit({ card, linked }: { card: CardItem; linked: boolean }) {
  if (!card.credit) return null
  const c = card.credit
  if (!linked)
    return (
      <Text style={styles.credit} numberOfLines={1}>
        Photo by {c.photographer} on Unsplash
      </Text>
    )
  return (
    <Text style={[styles.credit, styles.creditPage]}>
      Photo by{' '}
      <Text style={styles.creditLink} onPress={() => Linking.openURL(c.photographerUrl)} accessibilityRole="link">
        {c.photographer}
      </Text>{' '}
      on{' '}
      <Text style={styles.creditLink} onPress={() => Linking.openURL(c.photoUrl)} accessibilityRole="link">
        Unsplash
      </Text>
    </Text>
  )
}

function PlayChip({ label, playing, onPress }: { label: string; playing?: boolean; onPress?: () => void }) {
  const body = <Text style={styles.chipText}>{`${playing ? '❚❚' : '▶'}  ${label}`}</Text>
  if (!onPress) return <View style={styles.chip}>{body}</View>
  return (
    <Pressable
      onPress={onPress}
      hitSlop={CHIP_SLOP}
      style={styles.chip}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : `Play from ${label}`}
    >
      {body}
    </Pressable>
  )
}

/** Figma 227:34 — the 12 × 12 arrow between a diagram's cells (assets/figma/diagram-arrow.svg, from the frame). */
function Arrow() {
  return <Image source={require('@/assets/figma/diagram-arrow.svg')} style={styles.arrow} accessibilityElementsHidden />
}

// Figma 227:5 — measured, not tokens: card padding 14 (12 on the quote), the quote mark Bold 40, the diagram cells 30
// tall with radius 8 and 10 apart, the board's beat dots 8 with 18 between beats, pills 8 × 4 at radius 20, the photo
// title Semibold 14 and its credit Regular 11 with 8 / 3 above them. The card bed is the Chip paint style and the
// diagram's outline the hairline #E6E6E4; corners are radius/tile like every Home tile (Job G: tokens over the frame).
const PAD = 14
const QUOTE_PAD = 12
const QUOTE_MARK = 40
const ARROW = 12
const CELL_H = 30
const CELL_R = 8
const ROW_GAP = 10
const DOT = 8
const BEAT_GAP = 10
const PILL_PAD_H = 8
const PILL_PAD_V = 4
const PILL_R = 20
const PHOTO_TITLE = 14
const CREDIT = 11
const HAIRLINE = '#E6E6E4'
const CHIP_SLOP = 12

const styles = StyleSheet.create({
  box: { borderRadius: radius.tile, padding: PAD, overflow: 'hidden' },
  boxPage: { padding: space.stack + 4 },
  quoteBox: { backgroundColor: colour.Chip, paddingHorizontal: QUOTE_PAD, paddingTop: 0 },
  quoteMark: { fontSize: QUOTE_MARK, fontWeight: '700', color: colour.Ink, height: QUOTE_MARK + 4, marginLeft: 0 },
  quoteMarkPage: { fontSize: QUOTE_MARK * 1.5, height: QUOTE_MARK * 1.5 + 4 },
  quoteText: { ...type['Heading / Card'], marginTop: -8 },
  quoteTextPage: { ...type['Title / Section'] },
  speaker: { ...type['Caption'], marginTop: 6 },
  chip: {
    alignSelf: 'flex-start',
    marginTop: space.stack,
    borderRadius: PILL_R,
    paddingHorizontal: PILL_PAD_H,
    paddingVertical: PILL_PAD_V,
    backgroundColor: colour.Ink,
  },
  chipText: { ...type['Label / Pill'], fontWeight: '600', color: colour.Surface },
  diagramBox: { backgroundColor: colour.Surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: HAIRLINE, gap: ROW_GAP },
  overline: { ...type['Label / Overline'], color: colour.Grey },
  row: { flexDirection: 'row', alignItems: 'center' },
  arrow: { width: ARROW, height: ARROW },
  cell: { flex: 1, minHeight: CELL_H, borderRadius: CELL_R, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 4 },
  cellFrom: { backgroundColor: colour.Chip },
  cellTo: { backgroundColor: colour.Lime },
  cellText: { ...type['Label / Tab'], textAlign: 'center' },
  cellTextPage: { ...type['Body / Medium'] },
  boardBox: { backgroundColor: colour.Ink, gap: BEAT_GAP },
  boardTitle: { ...type['Body / Small'], fontWeight: '600', color: colour.Surface },
  boardTitlePage: { ...type['Heading / Small'], color: colour.Surface },
  beat: { flexDirection: 'row', alignItems: 'center', gap: PAD - DOT },
  beatDot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colour.Lime },
  beatText: { ...type['Body / Small'], fontWeight: '500', color: colour.Surface, flex: 1 },
  beatTextPage: { ...type['Body / Medium'], color: colour.Surface },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: PILL_R,
    paddingHorizontal: PILL_PAD_H,
    paddingVertical: PILL_PAD_V,
    backgroundColor: colour.Lime,
  },
  pillText: { ...type['Label / Pill'], fontWeight: '600' },
  photo: { borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colour.Shimmer },
  photoPill: {
    position: 'absolute',
    left: 10,
    top: 10,
    borderRadius: PILL_R,
    paddingHorizontal: PILL_PAD_H,
    paddingVertical: PILL_PAD_V,
    backgroundColor: colour.Surface,
  },
  photoTitle: { fontSize: PHOTO_TITLE, fontWeight: '600', color: colour.Ink, marginTop: 8 },
  credit: { fontSize: CREDIT, color: colour.Grey, marginTop: 3 },
  creditPage: { ...type['Body / Small'], color: colour.Grey, marginTop: 8 },
  creditLink: { textDecorationLine: 'underline' },
  textBox: { backgroundColor: colour.Chip, gap: 6 },
  textTitle: type['Heading / Card'],
  textTitlePage: type['Title / Section'],
  textGist: { ...type['Body / Small'], color: colour.Grey },
  textGistPage: { ...type['Body'], color: colour.Grey },
})
