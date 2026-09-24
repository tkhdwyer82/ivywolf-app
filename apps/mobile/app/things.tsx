// apps/mobile/app/things.tsx
// My things (P4) — the default project, and the one room Ivy speaks in. From Ivy: "Ivy thinks these might be one
// idea" (Merge) and "You keep coming back to this" (Open); To do, with the circle to tick and Undo for a stray tap.
// Done to-dos stay a few days, greyed, and a tap on the tick takes it back. No Loose ends section.
// Reached from the My things chip on Home. Supersedes the old Life inbox.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useSupabase } from '@/lib/supabase'
import { acceptMerge, doneLabel, dueLabel, keepSeparate, loadThings, type FromIvy, type Things, type Todo } from '@/lib/things'
import { setTodoDone } from '@/lib/todo'
import { FloatingTrio } from '@/components/HomeChrome'
import { hero, text } from '@/lib/theme'

const UNDO_MS = 5000
const FROM_IVY_SHOWN = 2

export default function MyThings() {
  const supabase = useSupabase()
  const insets = useSafeAreaInsets()
  const [things, setThings] = useState<Things | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [allFromIvy, setAllFromIvy] = useState(false)
  const [undoable, setUndoable] = useState<Todo | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
  }, [])

  const load = useCallback(
    () =>
      loadThings(supabase)
        .then((t) => {
          setThings(t)
          setError(null)
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load My things')),
    [supabase]
  )
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  async function tick(todo: Todo) {
    const done = !todo.done
    // Show it straight away; the reload brings the real done_at.
    setThings((t) => t && { ...t, todo: t.todo.map((x) => (x.id === todo.id ? { ...x, done, doneAt: done ? new Date().toISOString() : null } : x)) })
    try {
      await setTodoDone(supabase, todo.id, done)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save')
    }
    load()
    if (undoTimer.current) clearTimeout(undoTimer.current)
    // Only a tick is undoable (the latest one); un-ticking is its own undo.
    if (done) {
      setUndoable(todo)
      undoTimer.current = setTimeout(() => setUndoable(null), UNDO_MS)
    } else setUndoable(null)
  }

  async function undo() {
    if (!undoable) return
    if (undoTimer.current) clearTimeout(undoTimer.current)
    const todo = undoable
    setUndoable(null)
    try {
      await setTodoDone(supabase, todo.id, false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t undo')
    }
    load()
  }

  function merge(item: Extract<FromIvy, { kind: 'merge' }>) {
    Alert.alert('One idea?', `“${item.a}” and “${item.b}” become one thread.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Keep separate',
        onPress: () => keepSeparate(supabase, item.id).then(load, (e) => setError(e.message)),
      },
      {
        text: 'Merge',
        style: 'default',
        onPress: () => acceptMerge(supabase, item.id).then(load, (e) => setError(e.message)),
      },
    ])
  }

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  if (!things) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {error ? <Text style={[text.body, styles.secondary]}>{error}</Text> : <ActivityIndicator color={hero.ink} />}
      </View>
    )
  }

  const fromIvy = allFromIvy ? things.fromIvy : things.fromIvy.slice(0, FROM_IVY_SHOWN)
  const nothing = things.fromIvy.length === 0 && things.todo.length === 0

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <SymbolView name="chevron.left" tintColor={hero.ink} size={20} weight="medium" />
        </Pressable>
        <Text style={text.headingSmall}>My things</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {error && <Text style={[text.caption, styles.secondary, { marginTop: 8 }]}>{error}</Text>}

        {things.fromIvy.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.section}>From Ivy</Text>
              {things.fromIvy.length > FROM_IVY_SHOWN && (
                <Pressable onPress={() => setAllFromIvy((v) => !v)} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.seeAll}>{allFromIvy ? 'Show less' : 'See all ›'}</Text>
                </Pressable>
              )}
            </View>
            {fromIvy.map((item) =>
              item.kind === 'merge' ? (
                <IvyRow
                  key={item.id}
                  title="Ivy thinks these might be one idea"
                  sub={`“${item.a}” ↔ “${item.b}”`}
                  button="Merge"
                  onPress={() => merge(item)}
                />
              ) : (
                <IvyRow
                  key={item.id}
                  title={`${item.cards} ${item.cards === 1 ? 'card' : 'cards'} now in ${item.place}`}
                  sub="You keep coming back to this"
                  button="Open"
                  onPress={() =>
                    item.openProjectId ? router.push(`/project/${item.openProjectId}`) : item.openCardId && router.push(`/idea/${item.openCardId}`)
                  }
                />
              )
            )}
          </>
        )}

        {things.todo.length > 0 && (
          <>
            <Text style={[styles.section, { marginTop: things.fromIvy.length > 0 ? 6 : 12 }]}>To do</Text>
            {things.todo.map((todo) => (
              <View key={todo.id} style={styles.todo}>
                <Pressable
                  onPress={() => tick(todo)}
                  hitSlop={10}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: todo.done }}
                  accessibilityLabel={todo.text}
                  style={[styles.tick, todo.done && styles.ticked]}
                >
                  {todo.done && <SymbolView name="checkmark" tintColor="#FFFFFF" size={12} weight="bold" />}
                </Pressable>
                <Pressable onPress={() => router.push(`/todo/${todo.id}`)} style={styles.todoText} accessibilityRole="button">
                  <Text style={[styles.todoTitle, todo.done && styles.secondary]}>{todo.text}</Text>
                  <Text style={[styles.todoSub, !todo.done && todo.dueDate ? styles.due : styles.secondary]}>
                    {todo.done ? doneLabel(todo.doneAt) : [todo.dueDate && dueLabel(todo.dueDate), todo.scope].filter(Boolean).join(' · ')}
                  </Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {nothing && (
          <Text style={[text.body, styles.secondary, { marginTop: 24 }]}>
            Errands you mention land here, and Ivy leaves a note when she spots something.
          </Text>
        )}
      </ScrollView>

      {undoable && (
        <View style={[styles.toast, { bottom: insets.bottom + 110 }]}>
          <Text style={styles.toastText} numberOfLines={1}>
            Done: {undoable.text}
          </Text>
          <Pressable onPress={undo} hitSlop={10} accessibilityRole="button">
            <Text style={styles.toastUndo}>Undo</Text>
          </Pressable>
        </View>
      )}

      <FloatingTrio onHome={() => router.dismissTo('/')} onRecord={() => router.push('/record')} onExplore={() => router.push('/explore')} />
    </View>
  )
}

/** One line from Ivy: her lime mark, what she noticed, and the one thing to do about it. */
function IvyRow({ title, sub, button, onPress }: { title: string; sub: string; button: string; onPress: () => void }) {
  return (
    <View style={styles.ivy}>
      <View style={styles.ivyMark} />
      <View style={styles.ivyText}>
        <Text style={styles.ivyTitle}>{title}</Text>
        <Text style={styles.ivySub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.5 }]} accessibilityRole="button">
        <Text style={styles.pillText}>{button}</Text>
      </Pressable>
    </View>
  )
}

// Figma 83:433 — title row; section heads Semibold 17; From Ivy rows every 68 (lime mark 44, title Semibold 14,
// line Regular 12 secondary, grey pill 26 high radius 13); To do rows every 54 (24 circle, text Medium 15, due line
// Regular 12 in orange, done filled ink with a white tick, text greyed).
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  secondary: { color: hero.secondary },
  bar: { height: 48, alignItems: 'center', justifyContent: 'center', marginHorizontal: 20 },
  back: { position: 'absolute', left: 0, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  section: { fontSize: 17, fontWeight: '600', color: hero.ink, marginBottom: 12 },
  seeAll: { fontSize: 13, color: hero.ink, marginBottom: 12 },
  ivy: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, marginBottom: 12 },
  ivyMark: { width: 44, height: 44, borderRadius: 22, backgroundColor: hero.lime },
  ivyText: { flex: 1 },
  ivyTitle: { fontSize: 14, fontWeight: '600', lineHeight: 17, color: hero.ink },
  ivySub: { fontSize: 12, color: hero.secondary, marginTop: 3 },
  pill: { height: 26, borderRadius: 13, paddingHorizontal: 12, backgroundColor: hero.fill, justifyContent: 'center' },
  pillText: { fontSize: 12, fontWeight: '600', color: hero.ink },
  todo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 54 },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#8E8E93',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  ticked: { backgroundColor: hero.ink, borderColor: hero.ink },
  todoText: { flex: 1 },
  todoTitle: { fontSize: 15, fontWeight: '500', lineHeight: 20, color: hero.ink },
  todoSub: { fontSize: 12, marginTop: 2 },
  due: { color: '#D2461E' },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#333330',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  toastText: { flex: 1, fontSize: 14, color: '#FFFFFF' },
  toastUndo: { fontSize: 14, fontWeight: '600', color: hero.lime },
})
