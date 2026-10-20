// apps/mobile/app/recipe/[id].tsx
// A recipe (R2, Figma v4.3 1789:2; Job B.10): its title, "From @handle · private to you" (or "· {uses} used" once
// published), the steps in order — what each makes, and why, in the author's words paraphrased — and Apply to an idea
// (the recipe sheet: pick an idea, then the price, then Apply). On her own private draft, "Invite @handle?" records an
// invite for Tim to send by hand; nothing is sent from here. A published recipe's handle opens its author's page.

import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useAuth } from '@clerk/clerk-expo'
import type { MakeKind } from '@ivywolf/schema'
import { colour, radius, space } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import { applyLabel, fromLine, invite, isPrivateDraft, loadRecipe, type Recipe } from '@/lib/recipes'
import { RecipeSheet } from '@/components/RecipeSheet'

const KIND_ICON: Record<MakeKind, SFSymbol> = { write: 'text.quote', still: 'photo', video: 'video', cut: 'scissors', none: 'hand.raised' }

export default function RecipePage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const { getToken, userId } = useAuth()
  const insets = useSafeAreaInsets()
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined)
  const [applying, setApplying] = useState(false)
  const [invited, setInvited] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle')

  const load = useCallback(() => {
    loadRecipe(supabase, id)
      .then(setRecipe)
      .catch(() => setRecipe(null))
  }, [supabase, id])
  useFocusEffect(load)

  async function inviteAuthor() {
    if (!recipe) return
    setInvited('sending')
    try {
      const token = await getToken()
      if (!token) throw new Error('signed out')
      await invite(token, recipe.id)
      setInvited('done')
      load()
    } catch {
      setInvited('failed')
    }
  }

  if (!recipe) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {recipe === null ? <Text style={styles.grey}>This recipe isn’t here.</Text> : <ActivityIndicator color={colour.Ink} />}
      </View>
    )
  }

  const mine = recipe.createdBy === userId
  const canInvite = mine && recipe.status === 'draft_private' && invited !== 'done'
  const authorPage = recipe.status === 'published' && recipe.author?.acceptedAt ? recipe.author.id : null

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: insets.bottom + 120, paddingHorizontal: space.margin }}>
        <Text style={styles.title} accessibilityRole="header">
          {recipe.title}
        </Text>
        <Pressable
          onPress={authorPage ? () => router.push(`/author/${authorPage}`) : undefined}
          disabled={!authorPage}
          style={[styles.pill, isPrivateDraft(recipe) && styles.pillPrivate]}
          accessibilityRole={authorPage ? 'link' : undefined}
        >
          {isPrivateDraft(recipe) && <SymbolView name="lock.fill" tintColor={colour.Grey} size={11} weight="semibold" />}
          <Text style={styles.pillText}>{fromLine(recipe)}</Text>
        </Pressable>

        <View style={styles.steps}>
          {recipe.steps.map((s) => (
            <View key={s.id} style={styles.step} accessibilityLabel={`Step ${s.ordinal}. ${s.title}. ${s.verb}. ${s.why}`}>
              <View style={styles.num}>
                <Text style={styles.numText}>{s.ordinal}</Text>
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <View style={styles.verbRow}>
                  <SymbolView name={KIND_ICON[s.makeKind]} tintColor={colour.Ink} size={13} weight="semibold" />
                  <Text style={styles.verb}>{s.verb}</Text>
                </View>
                <Text style={styles.why}>{s.why}</Text>
              </View>
            </View>
          ))}
        </View>

        {canInvite && (
          <Pressable onPress={inviteAuthor} disabled={invited === 'sending'} style={styles.invite} accessibilityRole="button" testID="recipe-invite">
            <Text style={styles.inviteText}>{invited === 'failed' ? 'That didn’t save — tap to try again' : `Invite @${recipe.handle}?`}</Text>
          </Pressable>
        )}
        {mine && (recipe.status === 'invited' || invited === 'done') && (
          <Text style={styles.small}>Invite noted. It stays private to you until @{recipe.handle} accepts.</Text>
        )}
      </ScrollView>

      <View style={[styles.chrome, { top: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} style={styles.circle} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" tintColor={colour.Ink} size={18} weight="semibold" />
        </Pressable>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable onPress={() => setApplying(true)} style={styles.apply} accessibilityRole="button" accessibilityHint={applyLabel(recipe)} testID="recipe-apply-to-idea">
          <Text style={styles.applyText}>Apply to an idea</Text>
        </Pressable>
      </View>

      {applying && (
        <RecipeSheet
          recipe={recipe}
          onClose={() => setApplying(false)}
          onApplied={(a) => {
            setApplying(false)
            router.push({ pathname: '/project/[id]', params: { id: a.projectId, applied: a.applicationId, appliedCount: String(a.count) } })
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center' },
  grey: { fontSize: 15, color: colour.Grey },
  title: { fontSize: 28, fontWeight: '700', color: colour.Ink },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colour.Lime, marginTop: 10 },
  pillPrivate: { backgroundColor: colour.Chip },
  pillText: { fontSize: 13, fontWeight: '600', color: colour.Ink },
  steps: { marginTop: 24, gap: 18 },
  step: { flexDirection: 'row', gap: 12 },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: colour.Ink, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 13, fontWeight: '700', color: colour.Surface },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 17, fontWeight: '600', color: colour.Ink },
  verbRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  verb: { fontSize: 15, color: colour.Ink },
  why: { fontSize: 14, lineHeight: 20, color: colour.Grey, marginTop: 4 },
  invite: { marginTop: 28, alignSelf: 'flex-start' },
  inviteText: { fontSize: 15, fontWeight: '600', color: colour.Ink, textDecorationLine: 'underline' },
  small: { fontSize: 13, color: colour.Grey, marginTop: 12 },
  chrome: { position: 'absolute', left: space.margin },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.Chip, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.margin, paddingTop: 12, backgroundColor: colour.Surface },
  apply: { height: 44, borderRadius: radius.thumb - 6, backgroundColor: colour.Lime, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontSize: 15, fontWeight: '600', color: colour.Ink },
})
