// apps/mobile/app/(tabs)/index.tsx
// Home = Threads: cards grouped by thread, most recently touched first. Cards the pipeline hasn't clustered yet
// (thread identity, CA2, isn't built) sit in a "New sparks" row at the top so nothing recorded is hidden.
// No threads and no cards → a record prompt, never an empty list.

import { useCallback, useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Link, useFocusEffect } from 'expo-router'
import type { CardRow, ThreadRow } from '@ivywolf/schema'
import { useSupabase } from '@/lib/supabase'
import { CardTile } from '@/components/CardTile'
import { color, space, type } from '@/lib/theme'

type Group = { key: string; title: string; subtitle: string; cards: CardRow[] }

const CARD_COLUMNS =
  'id, recording_id, title, gist, play_from_ms, confidence, energy, is_reference, frame_url, created_at'

export default function Threads() {
  const supabase = useSupabase()
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const [threads, cards] = await Promise.all([
      supabase
        .from('threads')
        .select(`id, title, stage, last_seen, thread_cards(cards(${CARD_COLUMNS}))`)
        .order('last_seen', { ascending: false }),
      supabase.from('cards').select(`${CARD_COLUMNS}, thread_cards(thread_id)`).order('created_at', { ascending: false }),
    ])
    if (threads.error || cards.error) {
      setError((threads.error ?? cards.error)!.message)
      return
    }
    setError(null)

    type ThreadWithCards = ThreadRow & { thread_cards: { cards: CardRow | null }[] }
    const threaded: Group[] = (threads.data as unknown as ThreadWithCards[]).map((t) => ({
      key: t.id,
      title: t.title,
      subtitle: t.stage,
      cards: t.thread_cards.flatMap((tc) => (tc.cards ? [tc.cards] : [])),
    }))
    const loose = (cards.data as unknown as (CardRow & { thread_cards: unknown[] })[]).filter(
      (c) => c.thread_cards.length === 0
    )
    setGroups(
      loose.length ? [{ key: 'sparks', title: 'New sparks', subtitle: 'not in a thread yet', cards: loose }, ...threaded] : threaded
    )
  }, [supabase])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (groups !== null && groups.length === 0 && !error) {
    return (
      <View style={styles.empty}>
        <Text style={type.title}>Say the first idea out loud.</Text>
        <Text style={[type.body, styles.emptyBody]}>
          Ramble — errands, tangents and all. Ivy pulls out the ideas and they show up here as cards.
        </Text>
        <Link href="/record" asChild>
          <Pressable style={styles.recordButton} accessibilityRole="button">
            <Text style={styles.recordText}>Record</Text>
          </Pressable>
        </Link>
      </View>
    )
  }

  return (
    <FlatList
      data={groups ?? []}
      keyExtractor={(g) => g.key}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      renderItem={({ item }) => (
        <View style={styles.group}>
          <View style={styles.groupHeader}>
            <Text style={type.heading}>{item.title}</Text>
            <Text style={type.meta}>
              {item.subtitle} · {item.cards.length} {item.cards.length === 1 ? 'card' : 'cards'}
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {item.cards.map((c) => (
              <CardTile key={c.id} card={c} />
            ))}
          </ScrollView>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: { paddingVertical: space.l, gap: space.xl },
  group: { gap: space.m },
  groupHeader: { paddingHorizontal: space.l, gap: 2 },
  row: { paddingHorizontal: space.l, gap: space.m },
  error: { color: color.accent, paddingHorizontal: space.l },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl, gap: space.l },
  emptyBody: { color: color.inkSoft },
  recordButton: {
    alignSelf: 'flex-start',
    backgroundColor: color.accent,
    borderRadius: 999,
    paddingHorizontal: space.xl,
    paddingVertical: 14,
  },
  recordText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
