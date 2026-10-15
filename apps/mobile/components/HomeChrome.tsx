// apps/mobile/components/HomeChrome.tsx
// Home's project chips (P1). The nav trio is components/Nav.tsx.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colour, size, type } from '@ivywolf/ui'
import { GRID } from '@/lib/home'
import type { Project } from '@/lib/home'
import { CHIP_ROW_H } from '@/components/CollapsingHeader'

// L3b (Figma 209:2) — measured, not tokens: chips 22 apart. B.5: every chip ink, 17 pt; the selected one has a 2-pt ink
// rule, radius 2, as wide as its label, 6 under the text; the rest no rule and no grey. The row is the collapsing
// header's 41 (components/CollapsingHeader.tsx), so each chip's tap target reaches 44 by hit slop.
const CHIP_GAP = 22
const RULE_H = 2
const RULE_R = 2
const RULE_GAP = 6
const SLOP = { top: (size.tap - CHIP_ROW_H) / 2, bottom: (size.tap - CHIP_ROW_H) / 2 }

/**
 * All · her projects — 17 semibold ink (Heading / Card; no +: a new project is the ⊕'s long-press, 227:5). The
 * selected chip has an ink rule under it. No My things chip (B.5): My things is the header's entry.
 */
export function ProjectChips({
  projects,
  selected,
  onSelect,
}: {
  projects: Project[]
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const chips: { id: string | null; name: string }[] = [{ id: null, name: 'All' }, ...projects.filter((p) => p.kind !== 'things')]

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {chips.map((c) => {
        const on = c.id === selected
        return (
          <Pressable key={c.id ?? 'all'} onPress={() => onSelect(c.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={styles.hit} hitSlop={SLOP}>
            <Text style={styles.chip}>{c.name}</Text>
            <View style={[styles.rule, !on && styles.ruleOff]} testID={on ? 'chip-rule' : undefined} />
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: GRID.margin, gap: CHIP_GAP, alignItems: 'center' },
  hit: { height: CHIP_ROW_H, justifyContent: 'center' },
  chip: { ...type['Heading / Card'], color: colour.Ink },
  rule: { alignSelf: 'stretch', height: RULE_H, borderRadius: RULE_R, backgroundColor: colour.Ink, marginTop: RULE_GAP },
  // Kept in the layout so the label doesn't shift when it's selected.
  ruleOff: { opacity: 0 },
})
