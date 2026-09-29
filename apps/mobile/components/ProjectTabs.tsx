// apps/mobile/components/ProjectTabs.tsx
// A project's tabs (P12b, Figma 202:11–13): All ideas · More ideas, Heading / Small, the selected one ink with a
// 3-pt rule. More ideas exists only when the gate is open (a thread in the project with ≥ 3 returns,
// lib/suggestions.ts) — otherwise there's nothing to choose between, and the row isn't drawn at all. Never greyed.

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colour, size, space, type } from '@ivywolf/ui'

export type ProjectTab = 'all' | 'more'

// P12b (Figma 202:11–13) — measured, not tokens: tabs start 26 under the chip, 24 apart; the rule is 3 tall,
// radius 2, 6 under the label.
const TABS_GAP = 26
const TAB_GAP = 24
const RULE_H = 3
const RULE_R = 2
const RULE_GAP = 6

export function ProjectTabs({ tab, moreIdeas, onChange }: { tab: ProjectTab; moreIdeas: boolean; onChange: (t: ProjectTab) => void }) {
  if (!moreIdeas) return null
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      <Tab label="All ideas" on={tab === 'all'} onPress={() => onChange('all')} />
      <Tab label="More ideas" on={tab === 'more'} onPress={() => onChange('more')} />
    </View>
  )
}

function Tab({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} style={styles.hit}>
      <Text style={[styles.tab, on && styles.tabOn]}>{label}</Text>
      <View style={[styles.rule, !on && { opacity: 0 }]} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: TAB_GAP, marginTop: TABS_GAP, marginBottom: space.stack },
  hit: { minHeight: size.tap, justifyContent: 'center' },
  tab: { ...type['Heading / Small'], color: colour.Grey },
  tabOn: { color: colour.Ink },
  rule: { height: RULE_H, borderRadius: RULE_R, backgroundColor: colour.Ink, marginTop: RULE_GAP },
})
