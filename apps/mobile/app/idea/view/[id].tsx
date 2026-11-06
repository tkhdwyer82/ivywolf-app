// apps/mobile/app/idea/view/[id].tsx
// View idea (B.8a, Figma v5.0 I3 2151:106): one scrolling page — her full words, chaptered as the transcript is
// (lib/transcript.ts: a chapter per turn, coloured by what Ivy did with each span), then the Ivy thread below it: the
// other ideas in her thread, the directions that cite this idea, and Ivy's notes on its recording. From the idea
// page's ◯ and its "View idea", as a bottom sheet (85 %, drag down to close — app/_layout.tsx) with the picture behind
// it. Reads only; nothing new on the backend.
// Pinterest's comments sheet shape: under the grabber a 56 header — × (18 in), "Her words" Semibold 16 centred, ↑ share
// — over a hairline; then, 20 from the sides, the idea's title Bold 22 (20 above, 16 below), her transcript Regular
// 17/25 ink with the idea's own words bold, and, 32 below, "Ivy" (Regular 15 grey, 12 above the rows): each thread item
// a 56 row — a 42 r8 thumbnail, Semibold 16 title, › — with hairlines between.

import { useCallback, useState } from 'react'
import { ActivityIndicator, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useUser } from '@clerk/clerk-expo'
import { colour } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import { loadIdea, type Idea } from '@/lib/idea'
import { loadTranscript, type SpanKind, type Turn } from '@/lib/transcript'
import { loadIvyThread, threadEmpty, type IvyThread } from '@/lib/viewIdea'

const GREY = '#6E6E73'
const SOFT = '#F2F2F7'
const HAIRLINE = 'rgba(29,29,31,0.12)'
const PAD = 20
// As the transcript (Figma 83:317): idea spans bold ink, loose ends olive, my things rust, wake word and filler grey.
const TONE: Record<SpanKind, object> = {
  plain: { color: colour.Ink },
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

  const share = () => {
    const said = (words ?? []).map((t) => t.spans.map((s) => s.text).join('')).join('\n\n') || idea.said || idea.gist || ''
    Share.share({ message: said ? `${idea.title}\n\n${said}` : idea.title }).catch(() => {})
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.headerIcon, styles.headerLeft]} accessibilityRole="button" accessibilityLabel="Close" testID="view-close">
          <SymbolView name="xmark" tintColor={colour.Ink} size={24} weight="regular" />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Her words
        </Text>
        <Pressable onPress={share} hitSlop={12} style={[styles.headerIcon, styles.headerRight]} accessibilityRole="button" accessibilityLabel="Share" testID="view-share">
          <SymbolView name="square.and.arrow.up" tintColor={colour.Ink} size={24} weight="regular" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: PAD }}>
        <Text style={styles.title}>{idea.title}</Text>

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
            <Text style={styles.section}>Ivy</Text>
            {[
              ...thread.notes.map((n) => ({ key: n.id, title: n.text, icon: 'quote.bubble' as SFSymbol, thumbUrl: null, open: () => router.push(`/idea/transcript/${id}`) })),
              ...thread.directions.map((d) => ({ key: d.id, title: d.title, icon: 'sparkles' as SFSymbol, thumbUrl: null, open: () => router.push(`/suggestion/${d.id}`) })),
              ...thread.ideas.map((t) => ({ key: t.id, title: t.title, icon: 'lightbulb' as SFSymbol, thumbUrl: t.thumbUrl, open: () => router.push(`/idea/${t.id}`) })),
            ].map((r, i) => (
              <Pressable key={r.key} onPress={r.open} style={[styles.row, i > 0 && styles.rowRule]} accessibilityRole="button" testID="ivy-row">
                {r.thumbUrl ? (
                  <Image source={{ uri: r.thumbUrl }} style={styles.thumb} testID="ivy-row-thumb" />
                ) : (
                  <View style={[styles.thumb, styles.thumbSoft]} testID="ivy-row-thumb">
                    <SymbolView name={r.icon} tintColor={colour.Ink} size={18} weight="medium" />
                  </View>
                )}
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {r.title}
                </Text>
                <SymbolView name="chevron.right" tintColor={GREY} size={14} weight="semibold" />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center' },
  grey: { fontSize: 15, color: GREY },
  loading: { marginVertical: 20 },
  // Under the sheet's grabber.
  header: { height: 56, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  headerIcon: { position: 'absolute', width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  headerLeft: { left: 18 },
  headerRight: { right: 18 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colour.Ink },
  title: { fontSize: 22, fontWeight: '700', color: colour.Ink, marginTop: 20, marginBottom: 16 },
  section: { fontSize: 15, color: GREY, marginTop: 32, marginBottom: 12 },
  chapter: { marginBottom: 18 },
  speaker: { fontSize: 13, fontWeight: '600', color: colour.Ink, marginBottom: 4 },
  words: { fontSize: 17, lineHeight: 25, color: colour.Ink },
  row: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowRule: { borderTopWidth: 1, borderTopColor: HAIRLINE },
  thumb: { width: 42, height: 42, borderRadius: 8 },
  thumbSoft: { backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: colour.Ink },
})
