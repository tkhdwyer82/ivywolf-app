// apps/mobile/app/author/[id].tsx
// An author (R4, Figma v4.3 1789:2; Job B.10): their published recipes, how often they've been used, and — to the
// author themself only — the credits earned. Only for an author who has accepted (recipe_authors.accepted_at): for
// anyone else there's no page, never a page under a creator's name they haven't agreed to.

import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useAuth } from '@clerk/clerk-expo'
import { colour, space } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import { creditsLabel, loadAuthor, type AuthorPage } from '@/lib/recipes'
import { AvatarInitials } from '@/components/AvatarInitials'

export default function Author() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const { userId } = useAuth()
  const insets = useSafeAreaInsets()
  const [page, setPage] = useState<AuthorPage | null | undefined>(undefined)

  useFocusEffect(
    useCallback(() => {
      loadAuthor(supabase, id, userId ?? null)
        .then(setPage)
        .catch(() => setPage(null))
    }, [supabase, id, userId])
  )

  if (!page) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {page === null ? <Text style={styles.grey}>This page isn’t here.</Text> : <ActivityIndicator color={colour.Ink} />}
      </View>
    )
  }

  const { author } = page
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: insets.bottom + 40, paddingHorizontal: space.margin }}>
        <AvatarInitials name={author.name ?? author.handle} size={AVATAR} testID="author-avatar" />
        <Text style={styles.title} accessibilityRole="header">
          {author.name ?? `@${author.handle}`}
        </Text>
        {author.name && <Text style={styles.grey}>@{author.handle}</Text>}
        <Text style={styles.stats}>
          {page.recipes.length} recipe{page.recipes.length === 1 ? '' : 's'} · {page.uses} use{page.uses === 1 ? '' : 's'}
          {page.creditsEarned !== null ? ` · ${creditsLabel(page.creditsEarned)} earned` : ''}
        </Text>

        <View style={styles.list}>
          {page.recipes.map((r) => (
            <Pressable key={r.id} onPress={() => router.push(`/recipe/${r.id}`)} style={styles.row} accessibilityRole="button">
              <View style={styles.mark}>
                <SymbolView name="sparkles" tintColor={colour.Ink} size={16} weight="semibold" />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{r.title}</Text>
                <Text style={styles.grey}>
                  {r.steps.length} steps · {r.uses} used
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={[styles.chrome, { top: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} style={styles.circle} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" tintColor={colour.Ink} size={18} weight="semibold" />
        </Pressable>
      </View>
    </View>
  )
}

const AVATAR = 72

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center' },
  grey: { fontSize: 14, color: colour.Grey },
  title: { fontSize: 28, fontWeight: '700', color: colour.Ink, marginTop: 14 },
  stats: { fontSize: 15, color: colour.Ink, marginTop: 10 },
  list: { marginTop: 24, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: colour.Lime, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colour.Ink },
  chrome: { position: 'absolute', left: space.margin },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.Chip, alignItems: 'center', justifyContent: 'center' },
})
