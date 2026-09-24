// apps/mobile/app/todo/[id].tsx
// To-do (P17), the pin page's shape for a to-do. The visual (its frame, or the words set in the palette) with the
// "To-do · {project}" pill; the to-do as the heading; what she said, cut to the sentence, and where; heart · mic ·
// share; the calendar button, with its orange dot, only when Ivy heard a date; the dark project button; the due
// line; Mark done. The calendar button opens the Date sheet (P18): the day Ivy heard and Hear it; Change date,
// Remind me (a notification), Add to Reminders. Add to Calendar is for ideas with a time, so not here.
// Reached from a to-do tile on Home, a row in My things, or a reminder's notification.

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useAudioPlayer } from 'expo-audio'
import { useSupabase } from '@/lib/supabase'
import {
  changeDate,
  clock,
  defaultRemindAt,
  deleteTodo,
  dueLine,
  heard,
  isoDay,
  loadTodo,
  longDay,
  remindLine,
  reminderList,
  setRemind,
  setSynced,
  setTodoDone,
  setTodoHeart,
  shortDay,
  type Todo,
} from '@/lib/todo'
import { Glass, Menu } from '@/components/PinChrome'
import { hero, text } from '@/lib/theme'

const DUE = '#D2461E'

export default function TodoPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const insets = useSafeAreaInsets()
  const [todo, setTodo] = useState<Todo | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState(false)

  const load = useCallback(() => {
    loadTodo(supabase, id)
      .then(setTodo)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [supabase, id])
  useFocusEffect(load)

  const fail = (fallback: string) => (e: unknown) => setError(e instanceof Error ? e.message : fallback)

  async function heart() {
    if (!todo) return
    const was = todo
    setTodo({ ...todo, heartedAt: todo.heartedAt ? null : new Date().toISOString() })
    await setTodoHeart(supabase, todo.id, !was.heartedAt).catch((e) => {
      setTodo(was)
      fail('That didn’t save')(e)
    })
  }

  async function markDone() {
    if (!todo) return
    const was = todo
    setTodo({ ...todo, done: !todo.done })
    await setTodoDone(supabase, todo.id, !was.done).catch((e) => {
      setTodo(was)
      fail('That didn’t save')(e)
    })
  }

  function trash() {
    if (!todo) return
    Alert.alert('Move to trash?', 'The to-do is deleted, with its reminder. The recording stays in Voice notes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move to trash',
        style: 'destructive',
        onPress: () => deleteTodo(supabase, todo).then(() => router.back(), fail('That didn’t delete')),
      },
    ])
  }

  if (todo === undefined || todo === null) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {todo === null || error ? (
          <Text style={[text.body, styles.secondary]}>{error ?? 'This to-do has gone.'}</Text>
        ) : (
          <ActivityIndicator color={hero.ink} />
        )}
      </View>
    )
  }

  const drawn = todo.frameStatus === 'done' && !!todo.frameUrl
  const said = todo.said ? heard(todo.said.text) : null
  const where = [todo.said && `said at ${clock(todo.said.startMs)}`, todo.recordingTitle && `in ${todo.recordingTitle}`].filter(Boolean).join(' ')

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 32 }}>
        <View style={styles.visual}>
          {drawn ? (
            <Image source={{ uri: todo.frameUrl! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={styles.typographic}>
              <Text style={[text.titleScreen, { color: hero.ink }]}>{todo.text}</Text>
            </View>
          )}
          <Glass icon="chevron.left" label="Back" onPress={() => router.back()} style={{ left: 12, top: 12 }} />
          <Glass icon="ellipsis" label="More" onPress={() => setMenu(true)} style={{ right: 12, top: 12 }} />
          <View style={styles.pill}>
            <Text style={text.labelPill}>To-do · {todo.project?.name ?? 'My things'}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={[styles.heading, todo.done && styles.secondary]}>{todo.text}</Text>
          {(said || where) && (
            <Text style={styles.said}>{[said && `“${said.quote}”`, where].filter(Boolean).join(' — ')}</Text>
          )}

          <View style={styles.actions}>
            <Pressable onPress={heart} hitSlop={10} accessibilityRole="button" accessibilityLabel={todo.heartedAt ? 'Unheart' : 'Heart'}>
              <SymbolView name={todo.heartedAt ? 'heart.fill' : 'heart'} tintColor={hero.ink} size={24} />
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/record', params: { correctionOf: todo.id, what: 'to-do' } })}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Correct by voice"
            >
              <SymbolView name="mic" tintColor={hero.ink} size={24} />
            </Pressable>
            <Pressable onPress={() => Share.share({ message: todo.text })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Share">
              <SymbolView name="square.and.arrow.up" tintColor={hero.ink} size={24} />
            </Pressable>

            <View style={styles.right}>
              {todo.dueDate && (
                <Pressable onPress={() => setSheet(true)} style={styles.calendar} accessibilityRole="button" accessibilityLabel={`Date: ${longDay(todo.dueDate)}`}>
                  <SymbolView name="calendar" tintColor={hero.ink} size={22} />
                  <View style={styles.dot} />
                </Pressable>
              )}
              <View style={styles.project}>
                <Text style={styles.projectName} numberOfLines={1}>
                  {todo.project?.name ?? 'My things'}
                </Text>
                <View style={styles.projectRule} />
                {/* Save to (P10) moves ideas; a to-do lives in My things. */}
                <View style={styles.chevron}>
                  <SymbolView name="chevron.down" tintColor="rgba(255,255,255,0.4)" size={16} weight="semibold" />
                </View>
              </View>
            </View>
          </View>

          <Text style={[styles.due, (todo.done || !todo.dueDate) && styles.secondary]}>{dueLine(todo)}</Text>
          {error && <Text style={[text.caption, styles.secondary, { marginTop: 8 }]}>{error}</Text>}

          <Pressable onPress={markDone} style={styles.markDone} accessibilityRole="checkbox" accessibilityState={{ checked: todo.done }}>
            <View style={[styles.tick, todo.done && styles.ticked]}>
              {todo.done && <SymbolView name="checkmark" tintColor="#FFFFFF" size={13} weight="bold" />}
            </View>
            <Text style={styles.markDoneLabel}>{todo.done ? 'Done' : 'Mark done'}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {menu && (
        <Menu
          top={insets.top + 10}
          onClose={() => setMenu(false)}
          items={[{ icon: 'trash', label: 'Move to trash', onPress: trash, destructive: true }]}
        />
      )}
      {todo.dueDate && (
        <DateSheet
          visible={sheet}
          todo={{ ...todo, dueDate: todo.dueDate }}
          bottom={insets.bottom}
          onChange={setTodo}
          onClose={() => setSheet(false)}
        />
      )}
    </View>
  )
}

/** The Date sheet (P18). Every switch writes straight away; Done only closes. */
function DateSheet({
  visible,
  todo,
  bottom,
  onChange,
  onClose,
}: {
  visible: boolean
  todo: Todo & { dueDate: string }
  bottom: number
  onChange: (t: Todo) => void
  onClose: () => void
}) {
  const supabase = useSupabase()
  const player = useAudioPlayer(null)
  const [playing, setPlaying] = useState(false)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState<'remind' | 'sync' | 'date' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [list, setList] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) {
      player.pause()
      setPlaying(false)
      setPicking(false)
      setError(null)
    }
  }, [visible, player])
  // Name the list it would sync to, once she's allowed Reminders; don't ask for access just to label a row.
  useEffect(() => {
    if (!visible) return
    import('expo-calendar')
      .then(async (C) => ((await C.getRemindersPermissions()).granted ? reminderList(todo.scope) : null))
      .then((l) => setList(l?.title ?? null))
      .catch(() => setList(null))
  }, [visible, todo.scope])

  async function hear() {
    if (!todo.storagePath || !todo.said) return
    if (playing) {
      player.pause()
      return setPlaying(false)
    }
    const { data } = await supabase.storage.from('recordings').createSignedUrl(todo.storagePath, 3600)
    if (!data) return
    player.replace({ uri: data.signedUrl })
    await player.seekTo(todo.said.startMs / 1000)
    player.play()
    setPlaying(true)
  }

  async function run(what: 'remind' | 'sync' | 'date', f: () => Promise<Todo>) {
    setBusy(what)
    setError(null)
    try {
      onChange(await f())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save')
    } finally {
      setBusy(null)
    }
  }

  const remind = (on: boolean) =>
    run('remind', async () => {
      const at = on ? defaultRemindAt(todo.dueDate) : null
      await setRemind(supabase, todo, at)
      return { ...todo, remindAt: at?.toISOString() ?? null }
    })
  const sync = (on: boolean) =>
    run('sync', async () => {
      await setSynced(supabase, todo, on)
      return (await loadTodo(supabase, todo.id)) ?? todo
    })
  const pick = (iso: string) =>
    run('date', async () => {
      setPicking(false)
      return changeDate(supabase, todo, iso)
    })

  const said = todo.said ? heard(todo.said.text) : null
  const recorded = todo.recordedAt ? `recorded ${shortDay(new Date(todo.recordedAt))}` : null
  const heardLine = todo.said
    ? [`Ivy heard ${said?.phrase ? `“${said.phrase}”` : 'it'} at ${clock(todo.said.startMs)}`, recorded].filter(Boolean).join(' · ')
    : recorded
  const remindAt = todo.remindAt ? new Date(todo.remindAt) : defaultRemindAt(todo.dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 14 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i))

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: bottom + 12 }]}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>{longDay(todo.dueDate)}</Text>
        {heardLine && <Text style={styles.heardLine}>{heardLine}</Text>}
        {todo.said && todo.storagePath && (
          <Pressable onPress={hear} style={styles.hear} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Hear it'}>
            <SymbolView name={playing ? 'pause.fill' : 'play'} tintColor={hero.ink} size={11} />
            <Text style={styles.hearLabel}>Hear it</Text>
          </Pressable>
        )}

        <View style={styles.rows}>
          <Row icon="calendar" title="Change date" sub="Tap to pick another day" onPress={() => setPicking((v) => !v)}>
            {busy === 'date' ? <ActivityIndicator color={hero.ink} /> : <SymbolView name={picking ? 'chevron.down' : 'chevron.right'} tintColor={hero.secondary} size={16} />}
          </Row>
          {picking && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
              {days.map((d, i) => {
                const iso = isoDay(d)
                const on = iso === todo.dueDate
                return (
                  <Pressable key={iso} onPress={() => pick(iso)} style={[styles.dayChip, on && styles.dayChipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                    <Text style={[styles.dayChipTop, on && styles.dayChipTextOn]}>{i === 0 ? 'Today' : i === 1 ? 'Tmrw' : shortDay(d).slice(0, 3)}</Text>
                    <Text style={[styles.dayChipNum, on && styles.dayChipTextOn]}>{d.getDate()}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          )}
          <Row icon="bell" title="Remind me" sub={`${remindLine(remindAt)} · notification`}>
            <Toggle value={!!todo.remindAt} busy={busy === 'remind'} onChange={remind} label="Remind me" />
          </Row>
          <Row icon="checklist" title="Add to Reminders" sub={`Syncs to your phone${list ? ` · ${list.toLowerCase()} list` : ''}`}>
            <Toggle value={!!todo.syncedReminderId} busy={busy === 'sync'} onChange={sync} label="Add to Reminders" />
          </Row>
        </View>
        {error && <Text style={[text.caption, styles.secondary, { marginTop: 10 }]}>{error}</Text>}

        <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

function Row({ icon, title, sub, onPress, children }: { icon: SFSymbol; title: string; sub: string; onPress?: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.row} accessibilityRole={onPress ? 'button' : undefined}>
      <SymbolView name={icon} tintColor={hero.ink} size={22} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      {children}
    </Pressable>
  )
}

function Toggle({ value, busy, onChange, label }: { value: boolean; busy: boolean; onChange: (v: boolean) => void; label: string }) {
  // In a fixed-height box: a bare Switch in a flex row sits at the row's top on iOS.
  return (
    <View style={styles.toggle}>
      <Switch
        value={value}
        disabled={busy}
        onValueChange={onChange}
        trackColor={{ true: hero.lime, false: '#D9D9DE' }}
        ios_backgroundColor="#D9D9DE"
        accessibilityLabel={label}
      />
    </View>
  )
}

// Figma 83:484 (P17) — visual 377 × 300 at 8 pt margins, radius 28, pill lime 25 high at 16/256; heading Bold 22;
// said Regular 14 secondary; icons 26 every 46; calendar 44 × 44 fill radius 14 with a 9-pt orange dot; project
// button 170 × 44; due line Medium 13 orange; Mark done 353 × 56 fill radius 16, circle 26.
// Figma 83:523 (P18) — sheet from y 422, radius 28, grabber 40 × 5; title Bold 22; heard line Regular 12
// secondary; Hear it pill 26 high; rows 353 × 60 fill radius 16 every 68, icon 22, title Semibold 15, sub
// Regular 12; switch lime; Done 353 × 52 ink, radius 26.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  secondary: { color: hero.secondary },
  visual: { marginHorizontal: 8, height: 300, borderRadius: 28, overflow: 'hidden', backgroundColor: hero.fill },
  typographic: { flex: 1, justifyContent: 'center', padding: 24, paddingBottom: 56, borderLeftWidth: 6, borderLeftColor: hero.lime },
  pill: { position: 'absolute', left: 16, bottom: 19, height: 25, borderRadius: 12.5, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: hero.lime },
  body: { paddingHorizontal: 20, paddingTop: 16 },
  heading: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: hero.ink },
  said: { fontSize: 14, lineHeight: 18, color: hero.secondary, marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 18, paddingLeft: 2 },
  right: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3 },
  calendar: { width: 44, height: 44, borderRadius: 14, backgroundColor: hero.fill, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', left: 32, top: 3, width: 9, height: 9, borderRadius: 4.5, backgroundColor: DUE, borderWidth: 1.5, borderColor: hero.fill },
  project: { width: 170, height: 44, borderRadius: 14, backgroundColor: '#333330', flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  projectName: { flex: 1, paddingLeft: 16, fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  projectRule: { width: StyleSheet.hairlineWidth * 2, height: 44, backgroundColor: 'rgba(255,255,255,0.25)' },
  chevron: { width: 43, height: 44, alignItems: 'center', justifyContent: 'center' },
  due: { fontSize: 13, fontWeight: '500', color: DUE, marginTop: 18 },
  markDone: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, borderRadius: 16, backgroundColor: hero.fill, paddingHorizontal: 16, marginTop: 18 },
  tick: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: hero.secondary, alignItems: 'center', justifyContent: 'center' },
  ticked: { backgroundColor: hero.ink, borderColor: hero.ink },
  markDoneLabel: { fontSize: 15, fontWeight: '600', color: hero.ink },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: hero.room, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 2.5, backgroundColor: '#D9D9DE', marginBottom: 19 },
  sheetTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: hero.ink },
  heardLine: { fontSize: 12, color: hero.secondary, marginTop: 6 },
  hear: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 26, borderRadius: 13, paddingHorizontal: 10, backgroundColor: hero.fill, marginTop: 10 },
  hearLabel: { fontSize: 12, fontWeight: '600', color: hero.ink },
  rows: { gap: 8, marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 60, borderRadius: 16, backgroundColor: hero.fill, paddingHorizontal: 16 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: hero.ink },
  rowSub: { fontSize: 12, color: hero.secondary, marginTop: 3 },
  toggle: { height: 60, justifyContent: 'center' },
  days: { gap: 8, paddingVertical: 2 },
  dayChip: { width: 52, height: 56, borderRadius: 14, backgroundColor: hero.fill, alignItems: 'center', justifyContent: 'center' },
  dayChipOn: { backgroundColor: hero.ink },
  dayChipTop: { fontSize: 11, color: hero.secondary },
  dayChipNum: { fontSize: 17, fontWeight: '600', color: hero.ink, marginTop: 2 },
  dayChipTextOn: { color: '#FFFFFF' },
  done: { height: 52, borderRadius: 26, backgroundColor: hero.ink, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  doneLabel: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
})
