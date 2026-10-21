// apps/mobile/app/idea/save/[id].tsx
// Save to (P10, B.8a I2 2151:82), Pinterest's board picker: a full-height sheet (app/_layout.tsx) from the idea page's
// Save and its saved pill's ˅. A 56 header (× left, "Save to" centred), search, Top choices — where it lives now first
// with a ✓, then My things — and Your projects: rows of a thumbnail and a name, nothing under it. While it lives in a
// project, Pinterest's dark "Psst!" bubble sits 12 under the search field — never over it — its tail down at Top
// choices, for 4 s; then it folds away and Top choices moves up. "+ New project" is the lime button at the
// foot, where Pinterest's Create new board is: it turns the search field into the name field (what she'd typed carries
// over), then reads "Create and save here", makes it, and moves the idea. Remove from a project is on the idea page's
// •••, not here. Only the card moves — its thread and the rest of the thread stay where they are.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Image, KeyboardAvoidingView, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useAuth } from '@clerk/clerk-expo'
import { useSupabase } from '@/lib/supabase'
import { blockColour, createProject, loadPicker, moveCard, type Picker, type PickerProject } from '@/lib/saveTo'
import { hero } from '@/lib/theme'

/** How long the Psst! bubble stays. */
export const PSST_MS = 4000

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
  const [psstGone, setPsstGone] = useState(false)

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
  // Where it lives now, said once over Top choices.
  const psst = !!picker?.current && !naming && top.length > 0 && !psstGone

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
        testID={`save-row-${p.id}`}
      >
        {p.thumbUrl ? <Image source={{ uri: p.thumbUrl }} style={styles.thumb} /> : <View style={[styles.thumb, { backgroundColor: blockColour(p) }]} />}
        <Text style={styles.name} numberOfLines={1}>
          {p.name}
        </Text>
        {here && (
          <View testID="save-here">
            <SymbolView name="checkmark" tintColor={hero.ink} size={18} weight="semibold" />
          </View>
        )}
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
          {/* A symbol's glyph draws at about 0.8 of its size: 30 is a 24 pt icon. */}
          <SymbolView name={naming ? 'chevron.left' : 'xmark'} tintColor={hero.ink} size={30} weight="regular" />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {naming ? 'New project' : 'Save to'}
        </Text>
      </View>

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

      <View style={styles.list}>
        {!picker ? (
          <View style={styles.centered}>{error ? <Text style={styles.note}>{error}</Text> : <ActivityIndicator color={hero.ink} />}</View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            {psst && (
              <Psst
                name={picker.current!.name}
                onGone={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
                  setPsstGone(true)
                }}
              />
            )}
            {!naming && top.length > 0 && (
              <>
                <Text style={[styles.section, psst && styles.underPsst]}>Top choices</Text>
                {top.map(row)}
              </>
            )}
            {!naming && yours.length > 0 && (
              <>
                <Text style={styles.section}>Your projects</Text>
                {yours.map(row)}
              </>
            )}
            {!naming && query.trim() !== '' && top.length === 0 && yours.length === 0 && <Text style={styles.note}>No project called “{query.trim()}” yet.</Text>}
            {error && <Text style={styles.note}>{error}</Text>}
          </ScrollView>
        )}
      </View>

      <Pressable
        onPress={create}
        disabled={busy || !picker}
        style={({ pressed }) => [styles.create, { marginBottom: insets.bottom + 8 }, (pressed || busy) && { opacity: 0.6 }]}
        accessibilityRole="button"
        testID="save-new-project"
      >
        {!naming && <SymbolView name="plus" tintColor={hero.ink} size={18} weight="semibold" />}
        <Text style={styles.createText}>{busy ? 'Saving…' : naming ? 'Create and save here' : 'New project'}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  )
}

/** Pinterest's dark tooltip, in the list's flow under the search field: 14 white, two lines at most, a tail down to
 *  Top choices. Fades after PSST_MS, then tells the list to close the gap. */
function Psst({ name, onGone }: { name: string; onGone: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current
  const gone = useRef(onGone)
  gone.current = onGone
  useEffect(() => {
    const t = setTimeout(() => Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => gone.current()), PSST_MS)
    return () => clearTimeout(t)
  }, [opacity])
  return (
    <View style={styles.psstAnchor} pointerEvents="none">
      <Animated.View style={[styles.psst, { opacity }]} testID="save-psst" accessibilityLiveRegion="polite">
        <Text style={styles.psstText} numberOfLines={2}>
          Psst! This idea already lives in {name}
        </Text>
        <View style={styles.tail} />
      </Animated.View>
    </View>
  )
}

// Pinterest's Save to: header 56 (× 18 in, 24 pt; "Save to" Semibold 16 centred); search 18 from the sides, 44 high,
// r22, a 1 pt hairline, 12 under the header; section labels Regular 15 ink, 28 above and 12 below; rows 50 high —
// thumbnail 42 r8, name Semibold 18 ink 20 after it, ✓ right where it lives; New project at the foot, 18 from the
// sides, 52 high, r26, lime, Semibold 16 ink.
const SIDE = 18
const SECTION_TOP = 28
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 13, color: hero.secondary, marginTop: 20, marginHorizontal: SIDE },
  bar: { height: 56, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', left: SIDE, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600', color: hero.ink },
  search: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(29,29,31,0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
    marginHorizontal: SIDE,
  },
  searchInput: { flex: 1, fontSize: 15, color: hero.ink, paddingVertical: 0 },
  list: { flex: 1 },
  section: { fontSize: 15, color: hero.ink, marginTop: SECTION_TOP, marginBottom: 12, marginHorizontal: SIDE },
  row: { flexDirection: 'row', alignItems: 'center', height: 50, gap: 20, paddingHorizontal: SIDE },
  thumb: { width: 42, height: 42, borderRadius: 8, backgroundColor: hero.fill },
  name: { flex: 1, fontSize: 18, fontWeight: '600', color: hero.ink },
  // 12 under the search field, in the flow — it never covers the field; Top choices sits 12 under it, the tail between.
  psstAnchor: { marginTop: 12, marginHorizontal: SIDE },
  underPsst: { marginTop: 12 },
  psst: { alignSelf: 'flex-start', maxWidth: 260, backgroundColor: '#1D1D1F', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  psstText: { fontSize: 14, lineHeight: 19, color: '#FFFFFF' },
  tail: { position: 'absolute', bottom: -5, left: 22, width: 12, height: 12, backgroundColor: '#1D1D1F', transform: [{ rotate: '45deg' }] },
  create: { height: 52, borderRadius: 26, backgroundColor: hero.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: SIDE, marginTop: 8 },
  createText: { fontSize: 16, fontWeight: '600', color: hero.ink },
})
