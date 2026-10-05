// apps/mobile/app/search.tsx
// Search, from the magnifier in the Home header (launch UI 170:5 — search lives in the header, never in the bar).
// The field is focused on open; results land in Home's masonry as she types. What Explore (P22) had besides search —
// Ideas for you, Rising — is retired with it.

import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useSupabase } from '@/lib/supabase'
import { masonry, type CardItem } from '@/lib/home'
import { searchIdeas } from '@/lib/search'
import { Tile, useTileWidth } from '@/components/Tile'
import { space } from '@ivywolf/ui'
import { hero, text } from '@/lib/theme'

const SEARCH_WAIT_MS = 250

type Found = { q: string; ideas: CardItem[]; failed: boolean }

export default function Search() {
  const supabase = useSupabase()
  const insets = useSafeAreaInsets()
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Found | null>(null)

  // Search as she types, once she pauses; a slower earlier answer never replaces a newer one.
  useEffect(() => {
    const term = q.trim()
    if (!term) return
    let stale = false
    const t = setTimeout(() => {
      searchIdeas(supabase, term)
        .then((ideas) => {
          if (stale) return
          setResults({ q: term, ideas, failed: false })
          setError(null)
        })
        .catch((e) => {
          if (stale) return
          setResults({ q: term, ideas: [], failed: true })
          setError(e instanceof Error ? e.message : 'Search didn’t work')
        })
    }, SEARCH_WAIT_MS)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, supabase])

  const searching = q.trim().length > 0

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
      >
        <View style={styles.bar}>
          <View style={styles.search}>
            <SymbolView name="magnifyingglass" tintColor={hero.ink} size={18} />
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder="Search your ideas"
              placeholderTextColor={hero.secondary}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search your ideas"
            />
            {searching && (
              <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <SymbolView name="xmark.circle.fill" tintColor={hero.secondary} size={18} />
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
            <Text style={text.body}>Cancel</Text>
          </Pressable>
        </View>
        {error && <Text style={[text.caption, styles.secondary, styles.error]}>{error}</Text>}
        {searching && <Results results={results} q={q.trim()} />}
      </ScrollView>
    </View>
  )
}

function Results({
  results,
  q,
}: {
  results: Found | null
  q: string
}) {
  const tileWidth = useTileWidth()
  if (!results || results.q !== q) return <ActivityIndicator color={hero.ink} style={{ marginTop: 40 }} />
  if (results.failed) return null // the error line above says why
  if (results.ideas.length === 0) {
    return <Text style={[text.body, styles.secondary, styles.none]}>None of your ideas mention “{q}”.</Text>
  }
  const [left, right] = masonry(results.ideas)
  return (
    <View style={[styles.columns, { marginTop: 20 }]}>
      {[left, right].map((col, c) => (
        <View key={c} style={{ width: tileWidth }}>
          {col.map((item) => (
            <View key={item.id} style={{ paddingBottom: space.gutter }}>
              <Tile item={item} width={tileWidth} onOpen={(i) => router.push(`/idea/${i.id}`)} />
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

// Field as Figma 90:2: 44 high, 1-pt ink outline, radius 22, Regular 15.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  secondary: { color: hero.secondary },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 14 },
  search: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: hero.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  searchInput: { flex: 1, fontSize: 15, color: hero.ink, paddingVertical: 0 },
  error: { marginHorizontal: 20, marginTop: 8 },
  columns: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  none: { textAlign: 'center', marginTop: 40, paddingHorizontal: 32 },
})
