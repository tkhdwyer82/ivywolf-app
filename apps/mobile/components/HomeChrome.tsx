// apps/mobile/components/HomeChrome.tsx
// Home's fixed parts (P1): project chips and the floating trio Home · ⊕ · Explore.

import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { hero } from '@/lib/theme'
import type { Project } from '@/lib/home'

/** All · My things · … · + — the selected chip is semibold with a short ink rule under it. */
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
          <Pressable key={c.id ?? 'all'} onPress={() => onSelect(c.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[styles.chip, on && styles.chipOn]}>{c.name}</Text>
            <View style={[styles.rule, !on && { opacity: 0 }]} />
          </Pressable>
        )
      })}
      <Pressable onPress={create} accessibilityRole="button" accessibilityLabel="New project" hitSlop={8}>
        <Text style={styles.chip}>+</Text>
        <View style={[styles.rule, { opacity: 0 }]} />
      </Pressable>
    </ScrollView>
  )
}

export function FloatingTrio({ onHome, onRecord, onExplore }: { onHome: () => void; onRecord: () => void; onExplore: () => void }) {
  return (
    <View style={styles.trio} pointerEvents="box-none">
      <Pressable onPress={onHome} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Home">
        <SymbolView name="house" tintColor={hero.ink} size={22} />
      </Pressable>
      <Pressable onPress={onRecord} style={[styles.navButton, styles.record]} accessibilityRole="button" accessibilityLabel="Record">
        <SymbolView name="mic" tintColor={hero.ink} size={22} />
      </Pressable>
      <Pressable onPress={onExplore} style={styles.navButton} accessibilityRole="button" accessibilityLabel="Explore">
        <SymbolView name="magnifyingglass" tintColor={hero.ink} size={22} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  chips: { paddingHorizontal: 20, gap: 22, paddingTop: 4 },
  chip: { fontSize: 17, lineHeight: 22, color: hero.ink },
  chipOn: { fontWeight: '600' },
  rule: { width: 22, height: 2.5, backgroundColor: hero.ink, marginTop: 4 },
  trio: { position: 'absolute', left: 0, right: 0, bottom: 40, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  navButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: hero.room,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
  },
  record: { backgroundColor: hero.lime },
})
