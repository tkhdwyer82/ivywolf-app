// apps/mobile/components/HomeChrome.tsx
// Home's project chips (P1). The nav trio is components/Nav.tsx.

import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colour, space, size, type } from '@ivywolf/ui'
import type { Project } from '@/lib/home'

// L3b (Figma 209:2) — measured, not tokens: chips 22 apart; the selected one has a 3-pt ink rule, radius 2, as wide
// as its label, 6 under the text.
const CHIP_GAP = 22
const RULE_H = 3
const RULE_R = 2
const RULE_GAP = 6

/** All · My things · … · + — Heading / Small; the selected chip is ink with a rule under it, the rest grey. */
export function ProjectChips({
  projects,
  selected,
  onSelect,
  onCreate,
}: {
  projects: Project[]
  selected: string | null
  onSelect: (id: string | null) => void
  onCreate: (name: string) => void
}) {
  const chips: { id: string | null; name: string }[] = [{ id: null, name: 'All' }, ...projects]
  const create = () =>
    Alert.prompt('New project', undefined, (name) => name?.trim() && onCreate(name.trim()), 'plain-text', '', 'default')

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {chips.map((c) => {
        const on = c.id === selected
        return (
          <Pressable key={c.id ?? 'all'} onPress={() => onSelect(c.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={styles.hit}>
            <Text style={[styles.chip, on && styles.chipOn]}>{c.name}</Text>
            <View style={[styles.rule, !on && { opacity: 0 }]} />
          </Pressable>
        )
      })}
      <Pressable onPress={create} accessibilityRole="button" accessibilityLabel="New project" style={styles.hit}>
        <Text style={styles.chip}>+</Text>
        <View style={[styles.rule, { opacity: 0 }]} />
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: space.margin, gap: CHIP_GAP },
  hit: { minHeight: size.tap, justifyContent: 'center' },
  chip: { ...type['Heading / Small'], color: colour.Grey },
  chipOn: { color: colour.Ink },
  rule: { alignSelf: 'stretch', height: RULE_H, borderRadius: RULE_R, backgroundColor: colour.Ink, marginTop: RULE_GAP },
})
