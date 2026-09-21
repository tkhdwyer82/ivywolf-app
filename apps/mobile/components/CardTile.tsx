// apps/mobile/components/CardTile.tsx
// One card. Below LOW_CONFIDENCE it renders greyed with "Ivy isn't sure" (CLAUDE.md pipeline invariants).
// frame_url is the card's visual (rule 3); until frames are generated the tile shows an energy bar in its place.

import { Image, StyleSheet, Text, View } from 'react-native'
import { LOW_CONFIDENCE, type CardRow } from '@ivywolf/schema'
import { color, space, type } from '@/lib/theme'

export function CardTile({ card }: { card: CardRow }) {
  const unsure = card.confidence < LOW_CONFIDENCE
  return (
    <View style={[styles.tile, unsure && styles.unsure]}>
      {card.frame_url ? (
        <Image source={{ uri: card.frame_url }} style={styles.frame} />
      ) : (
        <View style={styles.energyTrack}>
          <View style={[styles.energyFill, { width: `${Math.round((card.energy ?? 0.3) * 100)}%` }]} />
        </View>
      )}
      <Text style={[type.heading, unsure && { color: color.inkSoft }]} numberOfLines={2}>
        {card.title}
      </Text>
      <Text style={[type.body, styles.gist]} numberOfLines={3}>
        {card.gist}
      </Text>
      <Text style={type.meta}>
        {unsure ? "Ivy isn't sure · " : ''}
        {card.is_reference ? 'Reference · ' : ''}
        from {formatMs(card.play_from_ms)}
      </Text>
    </View>
  )
}

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  tile: {
    width: 240,
    backgroundColor: color.card,
    borderRadius: 16,
    padding: space.l,
    gap: space.s,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  unsure: { opacity: 0.6 },
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: color.line },
  energyTrack: { height: 4, borderRadius: 2, backgroundColor: color.accentSoft, overflow: 'hidden' },
  energyFill: { height: 4, backgroundColor: color.accent },
  gist: { color: color.inkSoft },
})
