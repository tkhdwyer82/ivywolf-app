// apps/mobile/app/life.tsx
// Life (top-right inbox): open actions and unresolved loose ends. Tapping an action marks it done.

import { useCallback, useState } from 'react'
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import type { ActionRow, LooseEndRow } from '@ivywolf/schema'
import { useSupabase } from '@/lib/supabase'
import { color, space, type } from '@/lib/theme'

type Item = { kind: 'action'; row: ActionRow } | { kind: 'loose_end'; row: LooseEndRow }
type Section = { title: string; data: Item[] }

const NEEDS_LABEL: Record<string, string> = { link: 'needs a link', answer: 'needs an answer', lookup: 'needs a lookup' }

export default function Life() {
  const supabase = useSupabase()
  const [sections, setSections] = useState<Section[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const [actions, looseEnds] = await Promise.all([
      supabase
        .from('actions')
        .select('id, recording_id, text, scope, priority, done, created_at')
        .eq('done', false)
        .order('created_at', { ascending: false }),
      supabase
        .from('loose_ends')
        .select('id, recording_id, text, needs, resolved_url, created_at')
        .is('resolved_url', null)
        .order('created_at', { ascending: false }),
    ])
    if (actions.error || looseEnds.error) {
      setError((actions.error ?? looseEnds.error)!.message)
      return
    }
    setError(null)
    setSections([
      { title: 'To do', data: (actions.data as ActionRow[]).map((row) => ({ kind: 'action' as const, row })) },
      { title: 'Loose ends', data: (looseEnds.data as LooseEndRow[]).map((row) => ({ kind: 'loose_end' as const, row })) },
    ])
  }, [supabase])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  async function markDone(id: string) {
    const { error } = await supabase.from('actions').update({ done: true }).eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(i) => `${i.kind}:${i.row.id}`}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      renderSectionHeader={({ section }) => (
        <Text style={[type.meta, styles.header]}>
          {section.title}
          {section.data.length === 0 ? ' · all clear' : ''}
        </Text>
      )}
      renderItem={({ item }) =>
        item.kind === 'action' ? (
          <Pressable
            style={styles.row}
            onPress={() => markDone(item.row.id)}
            accessibilityRole="button"
            accessibilityLabel={`Mark done: ${item.row.text}`}
          >
            <SymbolView name="circle" tintColor={color.inkSoft} size={22} />
            <View style={styles.text}>
              <Text style={type.body}>{item.row.text}</Text>
              <Text style={type.meta}>
                {item.row.scope}
                {item.row.priority !== 'low' ? ` · ${item.row.priority}` : ''}
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.row}>
            <SymbolView name="link" tintColor={color.inkSoft} size={20} />
            <View style={styles.text}>
              <Text style={type.body}>{item.row.text}</Text>
              {item.row.needs ? <Text style={type.meta}>{NEEDS_LABEL[item.row.needs]}</Text> : null}
            </View>
          </View>
        )
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { padding: space.l, gap: space.s },
  header: { textTransform: 'uppercase', letterSpacing: 0.6, marginTop: space.l, marginBottom: space.xs },
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
  text: { flex: 1, gap: 2 },
  error: { color: color.accent },
})
