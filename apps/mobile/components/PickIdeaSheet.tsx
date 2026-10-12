// apps/mobile/components/PickIdeaSheet.tsx
// "Try Higgsfield on…" (Explore · pick an idea, Figma 1464:124): tapping a live tool asks which idea to try it on —
// ideas with frames first, ready to go; the rest greyed. The tool page it continues to isn't built yet, so Continue
// says so and closes. Nothing here spends credits.

import { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { SymbolView } from 'expo-symbols'
import { colour, hueOf } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import { loadPickable, pickableLine, type Pickable } from '@/lib/pickIdea'
import type { Tool } from '@/lib/explore'
import { Sheet } from '@/components/Sheet'

export function PickIdeaSheet({ tool, onClose }: { tool: Tool; onClose: () => void }) {
  const supabase = useSupabase()
  const [list, setList] = useState<Pickable[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    loadPickable(supabase)
      .then((l) => {
        setList(l)
        setPicked(l.find((p) => p.frames > 0)?.card.id ?? null)
      })
      .catch(() => setList([]))
  }, [supabase])

  const go = () => {
    const p = list?.find((x) => x.card.id === picked)
    if (!p) return
    Alert.alert(`${tool.name} on “${p.card.title}”`, 'This opens Create once it’s built. Nothing was spent.', [{ text: 'OK', onPress: onClose }])
  }

  return (
    <Sheet onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          Try {tool.via ?? tool.name} on…
        </Text>
        <Text style={styles.subtitle}>Ideas with frames are ready to go</Text>
      </View>
      {!list ? (
        <ActivityIndicator color={colour.Ink} style={styles.loading} />
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
          {list.length === 0 && <Text style={styles.line}>Say an idea first — it lands here.</Text>}
          {list.map((p) => {
            const ready = p.frames > 0
            const on = picked === p.card.id
            const pic = p.card.picture
            return (
              <Pressable
                key={p.card.id}
                onPress={() => setPicked(p.card.id)}
                style={styles.row}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${p.card.title}. ${pickableLine(p)}`}
              >
                <View style={[styles.thumb, { backgroundColor: hueOf(p.card.hue) }]}>
                  {pic.uri && pic.kind === 'image' && <Image source={{ uri: pic.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                </View>
                <View style={styles.words}>
                  <Text style={[styles.name, !ready && styles.grey]} numberOfLines={1}>
                    {p.card.title}
                  </Text>
                  <Text style={styles.line} numberOfLines={1}>
                    {pickableLine(p)}
                  </Text>
                </View>
                {on && (
                  <View style={styles.check}>
                    <SymbolView name="checkmark" tintColor={colour.Ink} size={12} weight="bold" />
                  </View>
                )}
              </Pressable>
            )
          })}
        </ScrollView>
      )}
      <Pressable onPress={go} disabled={!picked} style={[styles.go, !picked && { opacity: 0.4 }]} accessibilityRole="button">
        <Text style={styles.goText}>Continue</Text>
      </Pressable>
    </Sheet>
  )
}

// Figma 1464:124 — measured: title Bold 20 and Regular 13 under it, 24 in; rows 82 apart, a 64 thumb at radius 12,
// the name Semibold 15 (grey when it has no frames) and its line Regular 12, 14 right of the thumb; the check a 24
// lime disc with an ink ring; Continue 345 × 52, lime, radius 26, Semibold 16.
const styles = StyleSheet.create({
  head: { paddingTop: 3, gap: 6 }, // the Sheet pads 24 each side
  title: { fontSize: 20, fontWeight: '700', color: colour.Ink },
  subtitle: { fontSize: 13, color: colour.Grey },
  loading: { marginVertical: 40 },
  list: { maxHeight: 340, marginTop: 18 },
  listInner: { gap: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumb: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden' },
  words: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '600', color: colour.Ink },
  grey: { color: colour.Grey },
  line: { fontSize: 12, color: colour.Grey },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colour.Ink, backgroundColor: colour.Lime, alignItems: 'center', justifyContent: 'center' },
  go: { height: 52, borderRadius: 26, backgroundColor: colour.Lime, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  goText: { fontSize: 16, fontWeight: '600', color: colour.Ink },
})
