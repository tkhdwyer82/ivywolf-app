// apps/mobile/app/idea/view/[id].tsx
// View idea (B.8a, Figma v5.0 I3 2151:106): one scrolling page — her full words, chaptered as the transcript is
// (lib/transcript.ts: a chapter per turn, coloured by what Ivy did with each span), then the Ivy thread below it: the
// other ideas in her thread, the directions that cite this idea, and Ivy's notes on its recording. From the idea
// page's ◯ and its "View idea". Reads only; nothing new on the backend.

import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useUser } from '@clerk/clerk-expo'
import { colour, space } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import { loadIdea, type Idea } from '@/lib/idea'
import { loadTranscript, type SpanKind, type Turn } from '@/lib/transcript'
import { loadIvyThread, threadEmpty, type IvyThread } from '@/lib/viewIdea'

const GREY = '#6E6E73'
const SOFT = '#F2F2F7'
// As the transcript (Figma 83:317): idea spans bold ink, loose ends olive, my things rust, wake word and filler grey.
const TONE: Record<SpanKind, object> = {
  plain: { color: '#4D4D52' },
  idea: { color: colour.Ink, fontWeight: '600' },
  loose_end: { color: '#7A8A29' },
  action: { color: '#C2400D' },
  filler: { color: GREY },
  retracted: { color: GREY, textDecorationLine: 'line-through' },
}

export default function ViewIdea() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const { user } = useUser()
  const insets = useSafeAreaInsets()
  const [idea, setIdea] = useState<Idea | null | undefined>(undefined)
  const [words, setWords] = useState<Turn[] | null>(null)
  const [thread, setThread] = useState<IvyThread | null>(null)

  useFocusEffect(
    useCallback(() => {
      loadIdea(supabase, id)
        .then((i) => {
          setIdea(i)
          if (!i) return
          if (i.recordingId) loadTranscript(supabase, id).then((t) => setWords(t?.turns ?? [])).catch(() => setWords([]))
          else setWords([])
          loadIvyThread(supabase, id, i.recordingId).then(setThread).catch(() => setThread(null))
        })
        .catch(() => setIdea(null))
    }, [supabase, id])
  )

  if (!idea) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {idea === null ? <Text style={styles.grey}>This idea has gone.</Text> : <ActivityIndicator color={colour.Ink} />}
      </View>
    )
  }

  const speakers = [...new Set((words ?? []).map((t) => t.speaker))]
  const nameOf = (s: string) => (speakers.indexOf(s) === 0 ? user?.firstName ?? 'You' : `Speaker ${speakers.indexOf(s) + 1}`)

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40, paddingHorizontal: space.margin }}>
        <Text style={styles.title} accessibilityRole="header">
          {idea.title}
        </Text>

        <Text style={styles.section}>Her words</Text>
        {words === null ? (
          <ActivityIndicator color={colour.Ink} style={styles.loading} />
        ) : words.length === 0 ? (
          // No recording (a pinned or imported idea): the words it has.
          <Text style={styles.words}>{idea.said ?? idea.gist}</Text>
        ) : (
          words.map((t, i) => (
            <View key={i} style={styles.chapter} testID="chapter">
              <Text style={styles.speaker}>{nameOf(t.speaker)}</Text>
              <Text style={styles.words}>
                {t.spans.map((s, j) => (
                  <Text key={j} style={TONE[s.kind]}>
                    {s.text}
                  </Text>
                ))}
              </Text>
            </View>
          ))
        )}

        {thread && !threadEmpty(thread) && (
          <View testID="ivy-thread">
            <Text style={styles.section}>{thread.title ? `Ivy · ${thread.title}` : 'Ivy'}</Text>
            {thread.notes.map((n) => (
              <View key={n.id} style={styles.note}>
                <View style={styles.dot} />
                <Text style={styles.noteText}>{n.text}</Text>
              </View>
            ))}
            {thread.directions.map((d) => (
              <Pressable key={d.id} onPress={() => router.push(`/suggestion/${d.id}`)} style={styles.card} accessibilityRole="button">
                <Text style={styles.overline}>DIRECTION</Text>
                <Text style={styles.cardTitle}>{d.title}</Text>
                {!!d.gist && <Text style={styles.cardBody}>{d.gist}</Text>}
              </Pressable>
            ))}
            {thread.ideas.map((t) => (
              <Pressable key={t.id} onPress={() => router.push(`/idea/${t.id}`)} style={styles.row} accessibilityRole="button">
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {t.title}
                </Text>
                <SymbolView name="chevron.right" tintColor={GREY} size={13} weight="semibold" />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.chrome, { top: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} style={styles.square} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" tintColor={colour.Ink} size={17} weight="semibold" />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center' },
  grey: { fontSize: 15, color: GREY },
  loading: { marginVertical: 20 },
  title: { fontSize: 28, fontWeight: '700', color: colour.Ink },
  section: { fontSize: 13, fontWeight: '600', color: GREY, marginTop: 28, marginBottom: 12 },
  chapter: { marginBottom: 18 },
  speaker: { fontSize: 13, fontWeight: '600', color: colour.Ink, marginBottom: 4 },
  words: { fontSize: 17, lineHeight: 25, color: '#4D4D52' },
  note: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colour.Lime, marginTop: 7 },
  noteText: { flex: 1, fontSize: 15, lineHeight: 21, color: colour.Ink },
  card: { backgroundColor: SOFT, borderRadius: 16, padding: 14, marginBottom: 10 },
  overline: { fontSize: 10, fontWeight: '700', color: GREY, letterSpacing: 0.4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colour.Ink, marginTop: 4 },
  cardBody: { fontSize: 14, lineHeight: 20, color: GREY, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E6E6E6' },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colour.Ink },
  chrome: { position: 'absolute', left: space.margin },
  square: { width: 40, height: 40, borderRadius: 12, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' },
})
