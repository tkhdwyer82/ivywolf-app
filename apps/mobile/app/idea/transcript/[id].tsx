// apps/mobile/app/idea/transcript/[id].tsx
// Transcript sheet (P7), from the idea's ••• menu: "Every word, with what Ivy did with it." The summary is the
// heading on the idea page; this is the evidence behind it (handover §4 rule 5).

import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useUser } from '@clerk/clerk-expo'
import { useSupabase } from '@/lib/supabase'
import { loadTranscript, type SpanKind, type Turn } from '@/lib/transcript'
import { hero } from '@/lib/theme'

// Figma 83:317: body #4D4D52; idea bold ink; loose end #7A8A29; my things #C2400D; wake word #6E6E73.
const TONE: Record<SpanKind, object> = {
  plain: { color: '#4D4D52' },
  idea: { color: hero.ink, fontWeight: '600' },
  loose_end: { color: '#7A8A29' },
  action: { color: '#C2400D' },
  filler: { color: hero.secondary },
  retracted: { color: hero.secondary, textDecorationLine: 'line-through' },
}
const LEGEND: { kind: SpanKind; label: string; dot: string }[] = [
  { kind: 'idea', label: 'idea', dot: hero.ink },
  { kind: 'loose_end', label: 'loose end', dot: '#7A8A29' },
  { kind: 'action', label: 'my things', dot: '#C2400D' },
  { kind: 'filler', label: 'wake word', dot: hero.secondary },
]

export default function TranscriptSheet() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const { user } = useUser()
  const [data, setData] = useState<{ turns: Turn[]; plain: string } | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTranscript(supabase, id)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [supabase, id])

  // Diarised speakers are "0", "1", …; the first is her.
  const speakers = [...new Set((data?.turns ?? []).map((t) => t.speaker))]
  const nameOf = (s: string) => (speakers.indexOf(s) === 0 ? user?.firstName ?? 'You' : `Speaker ${speakers.indexOf(s) + 1}`)

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Transcript</Text>
          <Text style={styles.subtitle}>Every word, with what Ivy did with it.</Text>
        </View>
        <Round icon="square.and.arrow.up" label="Share transcript" onPress={() => data && Share.share({ message: data.plain })} />
        <Round icon="xmark" label="Close" onPress={() => router.back()} />
      </View>

      {data === undefined ? (
        error ? <Text style={styles.subtitle}>{error}</Text> : <ActivityIndicator color={hero.ink} style={{ marginTop: 40 }} />
      ) : !data || data.turns.length === 0 ? (
        <Text style={[styles.subtitle, { marginTop: 24 }]}>No words were heard in this recording.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
          {data.turns.map((t, i) => (
            <View key={i} style={styles.turn}>
              <View style={[styles.avatar, speakers.indexOf(t.speaker) > 0 && { backgroundColor: hero.fill }]}>
                <Text style={styles.initial}>{nameOf(t.speaker).charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{nameOf(t.speaker)}</Text>
                <Text style={styles.words}>
                  {t.spans.map((s, j) => (
                    <Text key={j} style={TONE[s.kind]}>
                      {s.text}
                    </Text>
                  ))}
                </Text>
              </View>
            </View>
          ))}
          <View style={styles.legend}>
            {LEGEND.map((l) => (
              <View key={l.kind} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: l.dot }]} />
                <Text style={styles.legendLabel}>{l.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

function Round({ icon, label, onPress }: { icon: SFSymbol; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.round}>
      <SymbolView name={icon} tintColor={hero.ink} size={18} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#FAFAF7', paddingHorizontal: 20, paddingTop: 36 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 22 },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6, color: hero.ink },
  subtitle: { fontSize: 14, color: hero.secondary, marginTop: 4, width: 240 },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: hero.room,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  turn: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: hero.lime, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 16, fontWeight: '600', color: hero.ink },
  name: { fontSize: 17, fontWeight: '600', color: hero.ink, marginBottom: 4 },
  words: { fontSize: 16, lineHeight: 25, color: '#4D4D52' },
  legend: { flexDirection: 'row', gap: 14, marginLeft: 56 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: hero.secondary },
})
