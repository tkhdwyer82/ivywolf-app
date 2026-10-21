// apps/mobile/app/idea/save/[id].tsx
// Save to (P10), from the ⌄ on the Idea page's project button. Pinterest's picker: search, where it lives now
// ("Psst!"), Top choices, Your projects, and a lime Create new project. Tap a project and the idea moves there.
// Create turns the search field into the name field (what she'd typed carries over), makes it, and moves the idea.
// Only the card moves — its thread and the rest of the thread stay where they are.
// B.8a (I2 2151:82): from the idea page's Save button too, with a squarer "New project" at the top (44, soft fill); the
// lime button at the foot is only there while she names it ("Create and save here").
// From the saved pill's ˅: a sheet (app/_layout.tsx), where it lives first under Top choices, the rest under Your
// projects, and "Remove from {project}" — back to My things, unsaved.

import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useAuth } from '@clerk/clerk-expo'
import { useSupabase } from '@/lib/supabase'
import { blockColour, createProject, loadPicker, moveCard, subtitle, type Picker, type PickerProject } from '@/lib/saveTo'
import { hero, text } from '@/lib/theme'

export default function SaveTo() {
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId?: string }>()
  const supabase = useSupabase()
  const { userId } = useAuth()
  const insets = useSafeAreaInsets()
  const [picker, setPicker] = useState<Picker | null>(null)
  const [query, setQuery] = useState('')
  const [naming, setNaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      loadPicker(supabase, projectId ?? null)
        .then(setPicker)
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your projects'))
    }, [supabase, projectId])
  )

  const match = useCallback((p: PickerProject) => p.name.toLowerCase().includes(query.trim().toLowerCase()), [query])
  const top = useMemo(() => (picker ? picker.top.filter(match) : []), [picker, match])
  const yours = useMemo(() => (picker ? picker.yours.filter(match) : []), [picker, match])

  const things = picker ? [...picker.top, ...picker.yours].find((p) => p.kind === 'things') ?? null : null
  // Only a project of hers can be left; My things and Ivy Mini are where unsaved ideas live.
  const removable = picker?.current?.kind === 'user' && things ? picker.current : null

  async function saveTo(target: string) {
    if (busy) return
    if (target === picker?.current?.id) return router.back()
    setBusy(true)
    try {
      await moveCard(supabase, id, target)
      router.back()
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : 'That didn’t save')
    }
  }

  async function create() {
    if (!naming) {
      setNaming(true)
      return
    }
    const name = query.trim()
    if (!name) return setError('Give it a name first.')
    if (!userId || busy) return
    setBusy(true)
    try {
      const made = await createProject(supabase, userId, name)
      await moveCard(supabase, id, made)
      router.back()
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : 'That didn’t save')
    }
  }

  const row = (p: PickerProject) => {
    const here = p.id === picker?.current?.id
    return (
      <Pressable
        key={p.id}
        onPress={() => saveTo(p.id)}
        disabled={busy}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.5 }]}
        accessibilityRole="button"
        accessibilityLabel={here ? `${p.name}, saved here` : `Save to ${p.name}`}
      >
        {p.thumbUrl ? (
          <Image source={{ uri: p.thumbUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: blockColour(p) }]} />
        )}
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={styles.sub}>{subtitle(p, here)}</Text>
        </View>
      </Pressable>
    )
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <View style={styles.bar}>
        <Pressable
          onPress={() => (naming ? setNaming(false) : router.back())}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={naming ? 'Back to projects' : 'Close'}
          style={styles.close}
        >
          <SymbolView name={naming ? 'chevron.left' : 'xmark'} tintColor={hero.ink} size={20} weight="medium" />
        </Pressable>
        <Text style={text.headingSmall}>{naming ? 'New project' : 'Save to'}</Text>
      </View>

      {!naming && (
        <Pressable
          onPress={create}
          disabled={busy || !picker}
          style={({ pressed }) => [styles.newProject, (pressed || busy) && { opacity: 0.6 }]}
          accessibilityRole="button"
          testID="save-new-project"
        >
          <SymbolView name="plus" tintColor={hero.ink} size={16} weight="semibold" />
          <Text style={styles.newProjectText}>New project</Text>
        </Pressable>
      )}

      <View style={styles.search}>
        <SymbolView name={naming ? 'folder.badge.plus' : 'magnifyingglass'} tintColor={hero.secondary} size={18} />
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t)
            setError(null)
          }}
          placeholder={naming ? 'Name your project' : 'Search projects'}
          placeholderTextColor={hero.secondary}
          style={styles.searchInput}
          autoFocus={naming}
          autoCorrect={naming}
          returnKeyType={naming ? 'done' : 'search'}
          onSubmitEditing={naming ? create : undefined}
          accessibilityLabel={naming ? 'Project name' : 'Search projects'}
        />
      </View>

      {!picker ? (
        <View style={styles.centered}>{error ? <Text style={[text.body, styles.secondary]}>{error}</Text> : <ActivityIndicator color={hero.ink} />}</View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {picker.current && !naming && (
            <View style={styles.psst}>
              <Text style={styles.psstText}>Psst! This idea already lives in {picker.current.name}</Text>
            </View>
          )}
          {removable && things && !naming && (
            <Pressable
              onPress={() => saveTo(things.id)}
              disabled={busy}
              style={({ pressed }) => [styles.remove, pressed && { opacity: 0.5 }]}
              accessibilityRole="button"
              testID="save-remove"
            >
              <SymbolView name="minus.circle" tintColor={hero.ink} size={18} />
              <Text style={styles.removeText}>Remove from {removable.name}</Text>
            </Pressable>
          )}
          {!naming && top.length > 0 && (
            <>
              <Text style={styles.section}>Top choices</Text>
              {top.map(row)}
            </>
          )}
          {!naming && yours.length > 0 && (
            <>
              <Text style={styles.section}>Your projects</Text>
              {yours.map(row)}
            </>
          )}
          {!naming && query.trim() !== '' && top.length === 0 && yours.length === 0 && (
            <Text style={[text.bodySmall, styles.secondary, styles.none]}>No project called “{query.trim()}” yet.</Text>
          )}
          {error && <Text style={[text.caption, styles.secondary, styles.none]}>{error}</Text>}
        </ScrollView>
      )}

      {naming && (
        <Pressable
          onPress={create}
          disabled={busy || !picker}
          style={({ pressed }) => [styles.create, { marginBottom: insets.bottom + 6 }, (pressed || busy) && { opacity: 0.6 }]}
          accessibilityRole="button"
        >
          <Text style={styles.createText}>{busy ? 'Saving…' : 'Create and save here'}</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  )
}

// Figma 83:397 — close + title row, search 353 × 44 (radius 22), Psst 230 wide in #333330 (radius 16), section
// labels Regular 14, rows every 60 (thumb 44 radius 10, name Semibold 17, count Regular 12 secondary), lime
// Create new project 353 × 56 (radius 28) at the foot.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room, paddingHorizontal: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  secondary: { color: hero.secondary },
  bar: { height: 56, marginTop: 8, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', left: 0, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  search: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#8E8E93',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  searchInput: { flex: 1, fontSize: 15, color: hero.ink, paddingVertical: 0 },
  psst: { alignSelf: 'flex-start', maxWidth: 230, backgroundColor: '#333330', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginTop: 18 },
  psstText: { fontSize: 13, lineHeight: 17, color: '#FFFFFF' },
  section: { fontSize: 14, color: hero.ink, marginTop: 20, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', height: 60, gap: 16 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: hero.fill },
  rowText: { flex: 1 },
  name: { fontSize: 17, fontWeight: '600', color: hero.ink, lineHeight: 22 },
  sub: { fontSize: 12, color: hero.secondary, marginTop: 1 },
  none: { marginTop: 20 },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  removeText: { fontSize: 15, fontWeight: '600', color: hero.ink },
  // B.8a I2: New project, squarer — 44 tall, r12, soft #F2F2F7.
  newProject: { height: 44, borderRadius: 12, backgroundColor: '#F2F2F7', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, marginBottom: 12 },
  newProjectText: { fontSize: 15, fontWeight: '600', color: hero.ink },
  create: { height: 56, borderRadius: 28, backgroundColor: hero.lime, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  createText: { fontSize: 17, fontWeight: '600', color: hero.ink },
})
