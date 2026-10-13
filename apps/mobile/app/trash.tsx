// apps/mobile/app/trash.tsx
// Trash (Job B.3, 0040; from Voice notes): ideas and to-dos moved to the trash, newest first, each with the day it's
// deleted for good. Restore puts one back where it was — an idea with its links, thread and the to-dos it carried.

import { useCallback, useState } from 'react'
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useSupabase } from '@/lib/supabase'
import { loadTrash, purgeLine, restore, TRASH_DAYS, type TrashItem } from '@/lib/trash'
import { color, space, type } from '@/lib/theme'

export default function Trash() {
  const supabase = useSupabase()
  const [items, setItems] = useState<TrashItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await loadTrash(supabase))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The trash didn’t load')
    }
  }, [supabase])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  async function put(item: TrashItem) {
    try {
      await restore(supabase, item)
      await load()
    } catch (e) {
      Alert.alert('That didn’t restore', e instanceof Error ? e.message : undefined)
    }
  }

  const now = new Date()
  return (
    <FlatList
      data={items ?? []}
      keyExtractor={(i) => `${i.kind}:${i.id}`}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true)
            await load()
            setRefreshing(false)
          }}
        />
      }
      ListHeaderComponent={
        <Text style={[type.meta, styles.note]}>
          {error ?? `Ideas and to-dos stay here for ${TRASH_DAYS} days, then they’re deleted for good.`}
        </Text>
      }
      ListEmptyComponent={items !== null ? <Text style={[type.body, styles.empty]}>The trash is empty.</Text> : null}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.words}>
            <Text style={type.heading} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={type.meta}>
              {item.kind === 'idea' ? 'Idea' : 'To-do'} · {purgeLine(item.purgeAt, now)}
            </Text>
          </View>
          <Pressable onPress={() => put(item)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Restore ${item.title}`}>
            <Text style={styles.restore}>Restore</Text>
          </Pressable>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: { padding: space.l, gap: space.s },
  note: { marginBottom: space.s },
  empty: { paddingTop: space.xxl, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    backgroundColor: color.card,
    borderRadius: 12,
    padding: space.l,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  words: { flex: 1, gap: 2 },
  restore: { color: color.accent, fontSize: 15, fontWeight: '600' },
})
