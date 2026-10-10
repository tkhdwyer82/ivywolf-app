// apps/mobile/components/HomeChrome.tsx
// Home's project chips (P1). The nav trio is components/Nav.tsx.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colour, space, size, type } from '@ivywolf/ui'
import type { Project } from '@/lib/home'
import { CHIP_ROW_H } from '@/components/CollapsingHeader'

// L3b (Figma 209:2) — measured, not tokens: chips 22 apart; the selected one has a 3-pt ink rule, radius 2, as wide
// as its label, 6 under the text. The row is the collapsing header's 41 (components/CollapsingHeader.tsx), so each
// chip's tap target reaches 44 by hit slop.
const CHIP_GAP = 22
const RULE_H = 3
const RULE_R = 2
const RULE_GAP = 6
const SLOP = { top: (size.tap - CHIP_ROW_H) / 2, bottom: (size.tap - CHIP_ROW_H) / 2 }

/** All · My things · … — 17 semibold (Heading / Card; no +: a new project is the ⊕'s long-press, 227:5); the selected chip is ink with a rule under it, the rest grey. */
export function ProjectChips({
  projects,
  selected,
  onSelect,
}: {
  projects: Project[]
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const chips: { id: string | null; name: string }[] = [{ id: null, name: 'All' }, ...projects]

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {chips.map((c) => {
        const on = c.id === selected
        return (
          <Pressable key={c.id ?? 'all'} onPress={() => onSelect(c.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={styles.hit} hitSlop={SLOP}>
            <Text style={[styles.chip, on && styles.chipOn]}>{c.name}</Text>
            <View style={[styles.rule, !on && { opacity: 0 }]} />
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: space.margin, gap: CHIP_GAP, alignItems: 'center' },
  hit: { height: CHIP_ROW_H, justifyContent: 'center' },
  chip: { ...type['Heading / Card'], color: colour.Grey },
  chipOn: { color: colour.Ink },
  rule: { alignSelf: 'stretch', height: RULE_H, borderRadius: RULE_R, backgroundColor: colour.Ink, marginTop: RULE_GAP },
})
