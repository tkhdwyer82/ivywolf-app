// apps/mobile/components/RecipeSheet.tsx
// The recipe sheet (W5, Job B.10) — one sheet, two ways in:
//   from an idea   (a) the recipes she extracted, (b) published recipes by fit for the idea's kind, and "Paste a reel
//                  link" → pick one → the price → Apply. TODO(B.8): the Recipe circle ✦ in the Make with row opens
//                  this with `idea`; until B.8 lands, the idea page's ••• → Apply a recipe does.
//   from a recipe  the recipe page's "Apply to an idea" → pick an idea → the price → Apply.
// Price first (W2): the confirm step shows "Apply · {credits}" and the breakdown before anything runs; the server
// charges only that price. Nothing generates on Apply — each step card's Make waits for Generate.

import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@clerk/clerk-expo'
import { Image } from 'expo-image'
import { SymbolView } from 'expo-symbols'
import * as Haptics from 'expo-haptics'
import { colour, hueOf, radius } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import { loadPickable, type Pickable } from '@/lib/pickIdea'
import type { CardItem } from '@/lib/home'
import { apply, applyLabel, creditsLabel, fromLine, ideaKind, isPrivateDraft, loadSheet, priceOf, type Recipe, type SheetList } from '@/lib/recipes'
import { Sheet, SheetSection } from '@/components/Sheet'
import { PasteReelSheet } from '@/components/PasteReelSheet'

export interface Applied {
  applicationId: string
  projectId: string
  count: number
}

type Props = { onClose: () => void; onApplied: (a: Applied) => void } & ({ idea: CardItem; projectId: string | null; recipe?: never } | { recipe: Recipe; idea?: never; projectId?: never })

export function RecipeSheet(props: Props) {
  const { onClose, onApplied } = props
  const supabase = useSupabase()
  const { getToken, userId } = useAuth()
  const [recipe, setRecipe] = useState<Recipe | null>(props.recipe ?? null)
  const [idea, setIdea] = useState<CardItem | null>(props.idea ?? null)
  const [list, setList] = useState<SheetList | null>(null)
  const [ideas, setIdeas] = useState<Pickable[] | null>(null)
  const [pasting, setPasting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (props.idea && userId) loadSheet(supabase, userId, ideaKind(props.idea)).then(setList).catch(() => setList({ drafts: [], published: [] }))
    if (props.recipe) loadPickable(supabase).then(setIdeas).catch(() => setIdeas([]))
  }, [supabase, userId, props.idea, props.recipe])

  async function go() {
    if (!recipe || !idea || busy) return
    setBusy(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Sign in again to do that')
      const r = await apply(token, recipe.id, idea.id, props.projectId ?? null, priceOf(recipe).total)
      if (r.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        onApplied({ applicationId: r.applicationId, projectId: r.projectId, count: r.cardIds.length })
        return
      }
      // TODO(B.8): insufficient credits opens the top-up sheet (it doesn't exist yet).
      setError(r.code === 'insufficient_credits' ? 'Not enough credits for this one. Nothing was charged.' : r.code === 'price_changed' ? 'The price changed — check it and apply again.' : r.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work — nothing was charged')
    } finally {
      setBusy(false)
    }
  }

  if (pasting) return <PasteReelSheet onClose={() => setPasting(false)} />

  // ── The price, before anything runs ──
  if (recipe && idea) {
    const price = priceOf(recipe)
    return (
      <Sheet title={applyLabel(recipe)} onClose={busy ? () => {} : onClose}>
        <Text style={styles.confirm} numberOfLines={3}>
          “{recipe.title}” on “{idea.title}”
        </Text>
        <Text style={styles.meta}>
          {recipe.steps.length} cards, one per step · nothing generates until you tap Generate on a step
        </Text>
        <View style={styles.breakdown}>
          <Line label="Ivy writes the steps for your idea" value={creditsLabel(price.model)} />
          {price.author > 0 && <Line label={`@${recipe.handle}, who made it`} value={creditsLabel(price.author)} />}
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable onPress={go} disabled={busy} style={[styles.apply, busy && styles.applyBusy]} accessibilityRole="button" accessibilityState={{ busy }} testID="recipe-apply">
          {busy ? <ActivityIndicator color={colour.Surface} /> : <Text style={styles.applyText}>{applyLabel(recipe)}</Text>}
        </Pressable>
        {!props.recipe && (
          <Pressable onPress={() => setRecipe(null)} disabled={busy} style={styles.back} accessibilityRole="button">
            <Text style={styles.backText}>Pick another recipe</Text>
          </Pressable>
        )}
      </Sheet>
    )
  }

  // ── From a recipe: which idea ──
  if (recipe) {
    return (
      <Sheet title="Apply to an idea" subtitle={recipe.title} onClose={onClose}>
        {!ideas ? (
          <ActivityIndicator color={colour.Ink} style={styles.loading} />
        ) : (
          <ScrollView style={styles.list}>
            {ideas.length === 0 && <Text style={styles.meta}>Say an idea first — it lands here.</Text>}
            {ideas.map(({ card }) => (
              <Pressable key={card.id} onPress={() => setIdea(card)} style={styles.row} accessibilityRole="button" accessibilityLabel={card.title}>
                <View style={[styles.thumb, { backgroundColor: hueOf(card.hue) }]}>
                  {card.picture.uri && card.picture.kind !== 'video' && <Image source={{ uri: card.picture.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                </View>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {card.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Sheet>
    )
  }

  // ── From an idea: which recipe ──
  return (
    <Sheet title="Recipes" subtitle={idea ? `For “${idea.title}”` : undefined} onClose={onClose}>
      {!list ? (
        <ActivityIndicator color={colour.Ink} style={styles.loading} />
      ) : (
        <ScrollView style={styles.list}>
          <Pressable onPress={() => setPasting(true)} style={styles.row} accessibilityRole="button" testID="recipe-paste">
            <View style={[styles.thumb, styles.plus]}>
              <SymbolView name="plus" tintColor={colour.Ink} size={18} weight="semibold" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Paste a reel link</Text>
              <Text style={styles.meta}>Turn someone’s how-to into steps</Text>
            </View>
          </Pressable>
          {list.drafts.length > 0 && <SheetSection label="YOURS" />}
          {list.drafts.map((r) => (
            <RecipeRow key={r.id} recipe={r} onPress={() => setRecipe(r)} />
          ))}
          {list.published.length > 0 && <SheetSection label="FOR THIS IDEA" />}
          {list.published.map((r) => (
            <RecipeRow key={r.id} recipe={r} onPress={() => setRecipe(r)} />
          ))}
        </ScrollView>
      )}
    </Sheet>
  )
}

function RecipeRow({ recipe, onPress }: { recipe: Recipe; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityLabel={`${recipe.title}. ${fromLine(recipe)}. ${applyLabel(recipe)}`}>
      <View style={[styles.thumb, styles.mark]}>
        <SymbolView name="sparkles" tintColor={colour.Ink} size={18} weight="semibold" />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {recipe.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {recipe.steps.length} steps · {fromLine(recipe)}
        </Text>
      </View>
      <Text style={[styles.price, isPrivateDraft(recipe) && styles.priceSoft]}>{creditsLabel(priceOf(recipe).total)}</Text>
    </Pressable>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  )
}

const THUMB = 44

const styles = StyleSheet.create({
  loading: { marginVertical: 28 },
  list: { maxHeight: 460, marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowText: { flex: 1 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colour.Ink },
  thumb: { width: THUMB, height: THUMB, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  plus: { backgroundColor: colour.Chip },
  mark: { backgroundColor: colour.Lime },
  meta: { fontSize: 13, color: colour.Grey, marginTop: 2 },
  price: { fontSize: 13, fontWeight: '600', color: colour.Ink },
  priceSoft: { color: colour.Grey },
  confirm: { fontSize: 17, fontWeight: '600', color: colour.Ink, textAlign: 'center', marginTop: 14 },
  breakdown: { backgroundColor: colour.Chip, borderRadius: radius.thumb, padding: 14, marginTop: 16, gap: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flex: 1, fontSize: 14, color: colour.Ink },
  lineValue: { fontSize: 14, fontWeight: '600', color: colour.Ink },
  error: { fontSize: 13, color: colour.Grey, textAlign: 'center', marginTop: 12 },
  apply: { height: 44, borderRadius: 12, backgroundColor: colour.Lime, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  applyBusy: { backgroundColor: colour.Ink },
  applyText: { fontSize: 15, fontWeight: '600', color: colour.Ink },
  back: { alignItems: 'center', paddingVertical: 12 },
  backText: { fontSize: 14, color: colour.Grey },
})
