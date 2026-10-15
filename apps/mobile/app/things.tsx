// apps/mobile/app/things.tsx
// My things (P4, v4.6 — Figma 1797:2: M1 the list, M3 the tick). The default project, and the one room Ivy speaks in.
// From Ivy is the single lime row at the top. Then her to-dos as Pinterest rows — a 64 square picture (its frame, or
// the project's hue), one line of 17pt text, the meta "Today 7:40 · Home" (overdue: the whole line red, with the due
// day in it), the tick where Pinterest puts its × — in Granola's groups: Today, Yesterday, a day each for the past
// week, then by week (lib/things.ts). Tap a row for its page (/todo/[id], M2). Tick: the row fades in place with
// "Done · Undo" for 6 s, then drops into Done at the bottom (lib/ticks.ts). No Loose ends section.
// Reached from the My things chip and row on Home.

import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useSupabase } from '@/lib/supabase'
import { acceptMerge, groupTodos, keepSeparate, loadThings, metaLine, type FromIvy, type Things, type Todo } from '@/lib/things'
import { setTodoDone } from '@/lib/todo'
import { useTicks } from '@/lib/ticks'
import { Nav } from '@/components/Nav'
import { Pill } from '@/components/UndoPill'
import { hero, text } from '@/lib/theme'

const OVERDUE = '#D9442B'

export default function MyThings() {
  const supabase = useSupabase()
  const insets = useSafeAreaInsets()
  const [things, setThings] = useState<Things | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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

  const apply = useCallback(
    ({ id, done }: { id: string; done: boolean }) =>
      setThings((t) => t && { ...t, todo: t.todo.map((x) => (x.id === id ? { ...x, done, doneAt: done ? new Date().toISOString() : null } : x)) }),
    []
  )
  const save = useCallback(({ id, done }: { id: string; done: boolean }) => setTodoDone(supabase, id, done), [supabase])
  const onError = useCallback((e: unknown) => setError(e instanceof Error ? e.message : 'That didn’t save'), [])
  const ticks = useTicks({ apply, save, onError })

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

  const ivy = things.fromIvy[0]
  const groups = groupTodos(things.todo, ticks.settling)
  const now = new Date()

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <SymbolView name="chevron.left" tintColor={hero.ink} size={20} weight="medium" />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          My things
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {error && <Text style={[text.caption, styles.secondary, { marginTop: 8 }]}>{error}</Text>}

        {ivy && (
          <>
            <Text style={[styles.header, styles.firstHeader]}>FROM IVY</Text>
            {ivy.kind === 'merge' ? (
              <IvyRow title="Ivy thinks these might be one idea" sub={`“${ivy.a}” ↔ “${ivy.b}”`} button="Merge" onPress={() => merge(ivy)} />
            ) : (
              <IvyRow
                title={`${ivy.cards} ${ivy.cards === 1 ? 'card' : 'cards'} now in ${ivy.place}`}
                sub="you keep coming back to this"
                button="Open"
                onPress={() => (ivy.openProjectId ? router.push(`/project/${ivy.openProjectId}`) : ivy.openCardId && router.push(`/idea/${ivy.openCardId}`))}
              />
            )}
          </>
        )}

        {groups.map((g, i) => (
          <View key={g.key}>
            <View style={styles.headerRow}>
              <Text style={[styles.header, i === 0 && !ivy && styles.firstHeader]}>{g.title}</Text>
              {g.note && <Text style={styles.note}>{g.note}</Text>}
            </View>
            {g.rows.map((todo) => (
              <TodoRow key={todo.id} todo={todo} now={now} fading={ticks.settling.has(todo.id)} onTick={() => ticks.tick(todo)} />
            ))}
          </View>
        ))}

        {!ivy && groups.length === 0 && (
          <Text style={[text.body, styles.secondary, { marginTop: 24 }]}>
            Errands you mention land here, and Ivy leaves a note when she spots something.
          </Text>
        )}
      </ScrollView>

      {ticks.undoable && <Pill label="Done" action="Undo" onAction={ticks.undo} actionLabel="Undo, not done" testID="undo-done" />}
      <Nav room="home" onHome={() => router.dismissTo('/')} />
    </View>
  )
}

/** One to-do (M1): picture, one line, meta, the tick. Fading: just ticked, still in place (M3). */
export function TodoRow({ todo, now, fading, onTick }: { todo: Todo; now: Date; fading: boolean; onTick: () => void }) {
  const meta = metaLine(todo, now)
  return (
    <View style={[styles.row, fading && styles.fading]} testID={`todo-${todo.id}`}>
      <Pressable onPress={() => router.push(`/todo/${todo.id}`)} style={styles.open} accessibilityRole="button" accessibilityLabel={`${todo.text}. ${meta.text}`}>
        {todo.picture ? (
          <Image source={{ uri: todo.picture }} style={styles.picture} contentFit="cover" />
        ) : (
          <View style={[styles.picture, { backgroundColor: todo.hue }]} />
        )}
        <View style={styles.words}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {todo.text}
          </Text>
          <Text style={[styles.meta, meta.overdue && styles.overdue]} numberOfLines={1}>
            {meta.text}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onTick}
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: todo.done }}
        accessibilityLabel={todo.text}
        testID={`tick-${todo.id}`}
        style={[styles.tick, todo.done && styles.ticked]}
      >
        {todo.done && <SymbolView name="checkmark" tintColor="#FFFFFF" size={12} weight="bold" />}
      </Pressable>
    </View>
  )
}

/** From Ivy (M1): the one lime row — what she noticed, and the one thing to do about it. */
function IvyRow({ title, sub, button, onPress }: { title: string; sub: string; button: string; onPress: () => void }) {
  return (
    <View style={styles.ivy}>
      <View style={styles.ivyText}>
        <Text style={styles.ivyTitle} numberOfLines={1}>
          {title}
        </Text>
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

// Figma 1797:5 (M1): headers Semibold 10 grey, 24 under From Ivy and 30 under a row's picture, 6 above the first
// picture; From Ivy lime 64 high radius 16 (Semibold 15, Regular 12, a white Open chip radius 8); rows every 88: a 64
// picture radius 14, 16 to the words (Semibold 17 one line, 6 to Regular 13 grey meta, overdue #D9442B), the 24 tick
// (stroke #C7C7CC) 16 after them. M3: a ticked row at 40 %.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  secondary: { color: hero.secondary },
  bar: { height: 44, flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, gap: 31 },
  back: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', color: hero.ink },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  header: { fontSize: 10, fontWeight: '600', color: hero.secondary, marginTop: 6, marginBottom: 6, letterSpacing: 0.2 },
  firstHeader: { marginTop: 12 },
  note: { fontSize: 11, color: hero.secondary },
  ivy: { flexDirection: 'row', alignItems: 'center', height: 64, borderRadius: 16, backgroundColor: hero.lime, paddingLeft: 16, paddingRight: 17, marginBottom: 18 },
  ivyText: { flex: 1, gap: 4 },
  ivyTitle: { fontSize: 15, fontWeight: '600', color: hero.ink },
  ivySub: { fontSize: 12, color: hero.ink },
  pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#FFFFFF' },
  pillText: { fontSize: 12, fontWeight: '600', color: hero.ink },
  row: { flexDirection: 'row', alignItems: 'center', height: 64, marginBottom: 24 },
  fading: { opacity: 0.4 },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 },
  picture: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden' },
  words: { flex: 1, gap: 6 },
  rowTitle: { fontSize: 17, fontWeight: '600', color: hero.ink },
  meta: { fontSize: 13, color: hero.secondary },
  overdue: { color: OVERDUE },
  tick: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#C7C7CC', alignItems: 'center', justifyContent: 'center', marginLeft: 16, marginRight: 8 },
  ticked: { backgroundColor: hero.ink, borderColor: hero.ink },
})
