// apps/mobile/app/todo/[id].tsx
// The card page for a to-do (v4.6 M2, Figma 1797:59). Picture full-bleed at the top — its frame, else its project's
// hue — with back, Share and ••• over it; the to-do in Bold 28 and what she said, as a quote. Nothing else: the date
// and project live in My things' row, and Ivy speaks in the list and on Home, not here. Under it, Done (lime) and a
// white ✦ "Muse" circle that hands the to-do on — a stub for now (the share sheet with its words; Muse's report()
// receipt comes in Job F). ••• keeps Date (the Date sheet, P18, when Ivy heard a day), Correct by voice, Like and Move
// to trash. Reached from a row in My things, a to-do on Home's arc, or a reminder's notification.

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useAudioPlayer } from 'expo-audio'
import { useSupabase } from '@/lib/supabase'
import { TRASH_TODO_LINE } from '@/lib/trash'
import {
  changeDate,
  clock,
  defaultRemindAt,
  deleteTodo,
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
import { Menu } from '@/components/PinChrome'
import { Nav } from '@/components/Nav'
import { hueOf } from '@ivywolf/ui'
import { hero, text } from '@/lib/theme'

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
    try {
      await setTodoDone(supabase, todo.id, !was.done)
      // Done goes back to the list, where it sits in Done; taking it back stays here.
      if (!was.done) router.back()
    } catch (e) {
      setTodo(was)
      fail('That didn’t save')(e)
    }
  }

  /** ✦ Muse (stub): the share sheet with the to-do and her words. Job F replaces it with Muse's report() receipt. */
  function muse() {
    if (!todo) return
    const said = todo.said ? heard(todo.said.text) : null
    Share.share({ message: [todo.text, said && `“${said.quote}”`].filter(Boolean).join('\n\n') })
  }

  function trash() {
    if (!todo) return
    Alert.alert('Move to trash?', TRASH_TODO_LINE, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move to trash',
        style: 'destructive',
        onPress: () => deleteTodo(supabase, todo).then(() => router.back(), fail('That didn’t move to the trash')),
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

  const said = todo.said ? heard(todo.said.text) : null

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: insets.bottom + 140 }} contentInsetAdjustmentBehavior="never">
        <View style={[styles.picture, { backgroundColor: hueOf(todo.project?.hue ?? 'cool-grey') }]}>
          {todo.frameStatus === 'done' && todo.frameUrl && <Image source={{ uri: todo.frameUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />}
        </View>

        <View style={styles.body}>
          <Text style={[styles.heading, todo.done && styles.secondary]}>{todo.text}</Text>
          {said && <Text style={styles.said}>“{said.quote}”</Text>}
          {error && <Text style={[text.caption, styles.secondary, { marginTop: 8 }]}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable
              onPress={markDone}
              style={({ pressed }) => [styles.done, todo.done && styles.undone, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ checked: todo.done }}
              testID="todo-done"
            >
              <Text style={styles.doneLabel}>{todo.done ? 'Not done' : 'Done'}</Text>
            </Pressable>
            <View style={styles.museWrap}>
              <Pressable onPress={muse} style={({ pressed }) => [styles.muse, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Muse">
                <Text style={styles.museMark}>✦</Text>
              </Pressable>
              <Text style={styles.museLabel}>Muse</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.chrome, { top: insets.top + 4 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.circle} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" tintColor={hero.ink} size={18} weight="semibold" />
        </Pressable>
        <View style={styles.chromeRight}>
          <Pressable onPress={() => Share.share({ message: todo.text })} style={styles.share} accessibilityRole="button">
            <Text style={styles.shareLabel}>Share</Text>
          </Pressable>
          <Pressable onPress={() => setMenu(true)} style={styles.circle} accessibilityRole="button" accessibilityLabel="More">
            <SymbolView name="ellipsis" tintColor={hero.ink} size={18} weight="semibold" />
          </Pressable>
        </View>
      </View>

      <Nav room="home" onHome={() => router.dismissTo('/')} />

      {menu && (
        <Menu
          top={insets.top + 10}
          onClose={() => setMenu(false)}
          items={[
            // What left the page (M2) lives here. Date opens the Date sheet, which needs a date heard.
            ...(todo.dueDate ? [{ icon: 'calendar' as const, label: 'Date', onPress: () => setSheet(true) }] : []),
            { icon: todo.heartedAt ? 'heart.fill' : 'heart', label: todo.heartedAt ? 'Unlike' : 'Like', onPress: heart },
            {
              icon: 'mic',
              label: 'Correct by voice',
              onPress: () => router.push({ pathname: '/record', params: { correctionOf: todo.id, what: 'to-do' } }),
            },
            { icon: 'trash', label: 'Move to trash', onPress: trash, destructive: true },
          ]}
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

        <Pressable onPress={onClose} style={styles.sheetDone} accessibilityRole="button">
          <Text style={styles.sheetDoneLabel}>Done</Text>
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
// Figma 1797:59 (M2): picture 393 × 440 from the top; back and ••• white circles 44, Share an ink pill 78 × 44 (Semibold
// 15 white); title Bold 28 at 24 under the picture; her words Regular 17/24, 7 under; Done lime 281 × 52 radius 26
// (Semibold 15) and the ✦ circle 52 (hairline ring) 20 after it, "Muse" Regular 10 grey under it.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  secondary: { color: hero.secondary },
  picture: { height: 440, overflow: 'hidden' },
  chrome: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' },
  chromeRight: { flexDirection: 'row', gap: 7 },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  share: { width: 78, height: 44, borderRadius: 22, backgroundColor: hero.ink, alignItems: 'center', justifyContent: 'center' },
  shareLabel: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  body: { paddingHorizontal: 20, paddingTop: 24 },
  heading: { fontSize: 28, fontWeight: '700', color: hero.ink },
  said: { fontSize: 17, lineHeight: 24, color: hero.ink, marginTop: 7 },
  actions: { flexDirection: 'row', alignItems: 'flex-start', gap: 20, marginTop: 44 },
  done: { flex: 1, height: 52, borderRadius: 26, backgroundColor: hero.lime, alignItems: 'center', justifyContent: 'center' },
  undone: { backgroundColor: hero.fill },
  doneLabel: { fontSize: 15, fontWeight: '600', color: hero.ink },
  pressed: { transform: [{ scale: 0.97 }] },
  museWrap: { alignItems: 'center', gap: 6 },
  muse: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5EA', alignItems: 'center', justifyContent: 'center' },
  museMark: { fontSize: 20, fontWeight: '600', color: hero.ink },
  museLabel: { fontSize: 10, color: hero.secondary },
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
  sheetDone: { height: 52, borderRadius: 26, backgroundColor: hero.ink, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  sheetDoneLabel: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
})
