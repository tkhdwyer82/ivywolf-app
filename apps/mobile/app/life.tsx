// apps/mobile/app/life.tsx
// Life (top-right inbox): open actions and unresolved loose ends. Tapping an action marks it done; an Undo toast
// stays for a few seconds so a stray tap is recoverable.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SymbolView } from 'expo-symbols'
import type { ActionRow, LooseEndRow } from '@ivywolf/schema'
import { useSupabase } from '@/lib/supabase'
import { color, space, type } from '@/lib/theme'

type Item = { kind: 'action'; row: ActionRow } | { kind: 'loose_end'; row: LooseEndRow }
type Section = { title: string; data: Item[] }

const UNDO_MS = 5000

const NEEDS_LABEL: Record<string, string> = { link: 'needs a link', answer: 'needs an answer', lookup: 'needs a lookup' }

export default function Life() {
  const supabase = useSupabase()
  const [sections, setSections] = useState<Section[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [undoable, setUndoable] = useState<{ id: string; text: string } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
  }, [])

  const load = useCallback(async () => {
    const [actions, looseEnds] = await Promise.all([
      supabase
        .from('actions')
        .select('id, recording_id, text, scope, priority, due_date, done, created_at')
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

  async function markDone(row: ActionRow) {
    const { error } = await supabase.from('actions').update({ done: true }).eq('id', row.id)
    if (error) return setError(error.message)
    load()
    // Only the latest tap is undoable; an earlier one stays done.
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoable({ id: row.id, text: row.text })
    undoTimer.current = setTimeout(() => setUndoable(null), UNDO_MS)
  }

  async function undo() {
    if (!undoable) return
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoable(null)
    const { error } = await supabase.from('actions').update({ done: false }).eq('id', undoable.id)
    if (error) setError(error.message)
    else load()
  }

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <View style={styles.screen}>
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
              onPress={() => markDone(item.row)}
              accessibilityRole="button"
              accessibilityLabel={`Mark done: ${item.row.text}`}
            >
              <SymbolView name="circle" tintColor={color.inkSoft} size={22} />
              <View style={styles.text}>
                <Text style={type.body}>{item.row.text}</Text>
                <Text style={type.meta}>
                  {item.row.due_date ? <Text style={isOverdue(item.row.due_date) && styles.overdue}>{dueLabel(item.row.due_date)} · </Text> : null}
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
      {undoable ? (
        <View style={styles.toast} accessibilityLiveRegion="polite">
          <Text style={styles.toastText} numberOfLines={1}>
            Done: {undoable.text}
          </Text>
          <Pressable onPress={undo} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Undo: ${undoable.text}`}>
            <Text style={styles.toastUndo}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

/** due_date is a calendar day (YYYY-MM-DD) — compare and format it as a local date, never as a UTC instant. */
function localDay(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function daysFromToday(d: string) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((localDay(d).getTime() - today.getTime()) / 86_400_000)
}

const isOverdue = (d: string) => daysFromToday(d) < 0

function dueLabel(d: string) {
  const n = daysFromToday(d)
  if (n === 0) return 'due today'
  if (n === 1) return 'due tomorrow'
  const day = localDay(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return n < 0 ? `overdue · ${day}` : `due ${day}`
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  overdue: { color: color.accent },
  toast: {
    position: 'absolute',
    left: space.l,
    right: space.l,
    bottom: space.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    backgroundColor: color.ink,
    borderRadius: 12,
    paddingVertical: space.m,
    paddingHorizontal: space.l,
  },
  toastText: { flex: 1, color: color.paper, fontSize: 15 },
  toastUndo: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
