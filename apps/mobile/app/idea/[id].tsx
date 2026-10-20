// apps/mobile/app/idea/[id].tsx
// Idea (B.8a, Figma v5.0 I1 2151:5, scrolled I1b 2151:42), Pinterest-clean. Top to bottom, and nothing else:
//   1. The picture, full-bleed in a 440 slot: a photo card's picture (her own, its Unsplash photo or its reference —
//      lib/picture.ts — else its project's hue; a video idea's poster); a board's 3-up once its thread has three
//      pictures; any other form drawn large on its hue (CardFace, as B.5). Over it only two translucent 40 squares:
//      back, and ••• (where Change view, Move to project, Photo credit and the rest live).
//   2. One action row: ♥ (like) · ◯ (View idea, I3) · ↑ (Share) left, 26 outline icons; Save right — lime 84 × 44
//      r12, or ink "Saved · {project}" once it's filed in one of her projects. Save opens Save to (I2).
//   3. Who: her avatar 32, her name, "{duration} · {project}" grey.
//   4. The snippet: her words in quotes, two lines, 15 — tap to hear them — then "View idea" (I3).
//   5. Make with: ✦ Recipe (the B.10 recipe sheet, her private drafts as its badge). On a card a recipe made, its step's
//      Make square too (TODO(B.8b): the Make page) and the step's tag. Make video / stills / cut join in B.8b.
//   6. More to explore: a 2-column masonry of her ideas most like this one (GET /api/cards/{id}/related). Each tile opens
//      its own idea page; nothing links.
// Gone since B.5: More in this thread (in I3 now), the thread pill, the credit line under the picture (••• → Photo
// credit), the source badge and the bottom Talk bar — the mic lives in the nav.

import { useCallback, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useAudioPlayer } from 'expo-audio'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useAuth, useUser } from '@clerk/clerk-expo'
import { LOW_CONFIDENCE } from '@ivywolf/schema'
import { useSupabase } from '@/lib/supabase'
import { loadIdea, savedTo, setHeart, setPinned, setShape, snippet, viewsFor, whoLine, type Idea } from '@/lib/idea'
import { setShared } from '@/lib/share'
import { masonry, type CardItem } from '@/lib/home'
import { loadRelated } from '@/lib/related'
import { draftCount, loadStepCard, MAKE_LABEL, type StepCard } from '@/lib/recipes'
import { ShareSheet } from '@/components/ShareSheet'
import { AddContextSheet } from '@/components/AddContextSheet'
import { RecipeSheet } from '@/components/RecipeSheet'
import { CardFace, SHAPE_NAME } from '@/components/CardFace'
import { distinct, ThreeUp } from '@/components/IdeaTile'
import { Tile } from '@/components/Tile'
import type { Picture } from '@/lib/picture'
import { trashCard, TRASH_IDEA_LINE } from '@/lib/trash'
import { Menu, MENU_OFFSET } from '@/components/PinChrome'
import { colour, hueOf, space, type } from '@ivywolf/ui'

const GREY = '#6E6E73'
const SOFT = '#F2F2F7'

export default function IdeaPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const { getToken, userId } = useAuth()
  const { user } = useUser()
  const insets = useSafeAreaInsets()
  const [idea, setIdea] = useState<Idea | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState<'share' | 'context' | 'recipe' | null>(null)
  // A card a recipe made (B.10): its "Step n of … · @handle" tag and its Make square.
  const [step, setStep] = useState<StepCard | null>(null)
  const [drafts, setDrafts] = useState(0)
  const [related, setRelated] = useState<CardItem[] | null>(null)
  const player = useAudioPlayer(null)

  const load = useCallback(() => {
    loadIdea(supabase, id)
      .then(setIdea)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
    loadStepCard(supabase, id)
      .then(setStep)
      .catch(() => setStep(null))
    if (userId) draftCount(supabase, userId).then(setDrafts).catch(() => setDrafts(0))
    getToken()
      .then((token) => (token ? loadRelated(supabase, token, id) : []))
      .then(setRelated)
      .catch(() => setRelated([]))
  }, [supabase, id, userId, getToken])
  useFocusEffect(load)

  async function play() {
    if (!idea?.storagePath) return
    if (playing) {
      player.pause()
      return setPlaying(false)
    }
    const { data } = await supabase.storage.from('recordings').createSignedUrl(idea.storagePath, 3600)
    if (!data) return
    player.replace({ uri: data.signedUrl })
    await player.seekTo(idea.playFromMs / 1000)
    player.play()
    setPlaying(true)
  }

  async function heart() {
    if (!idea) return
    const on = !idea.heartedAt
    setIdea({ ...idea, heartedAt: on ? new Date().toISOString() : null })
    try {
      await setHeart(supabase, idea.id, on)
    } catch (e) {
      setIdea({ ...idea })
      setError(e instanceof Error ? e.message : 'That didn’t save')
    }
  }

  async function copy() {
    if (!idea) return
    const words = idea.gist ? `${idea.title}\n\n${idea.gist}` : idea.title
    try {
      // Loaded on use: builds made before expo-clipboard was added don't have its native module.
      const Clipboard = await import('expo-clipboard')
      await Clipboard.setStringAsync(words)
    } catch {
      await Share.share({ message: words })
    }
  }

  function changeView() {
    if (!idea) return
    const views = viewsFor(idea)
    const labels = views.map((v) => (v === idea.card.shape ? `${SHAPE_NAME[v]} ✓` : SHAPE_NAME[v]))
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'Change view', options: [...labels, 'Cancel'], cancelButtonIndex: labels.length },
      async (i) => {
        const shape = views[i]
        if (!shape || shape === idea.card.shape) return
        setIdea({ ...idea, card: { ...idea.card, shape }, shapeSetBy: 'creator' })
        try {
          const found = await setShape(supabase, idea, shape, await getToken())
          if (!found) setError('No photo for this one yet — it shows its title for now.')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'That didn’t change')
        }
        load()
      }
    )
  }

  async function pin() {
    if (!idea) return
    try {
      await setPinned(supabase, idea.id, !idea.card.pinnedAt)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t pin')
    }
    load()
  }

  async function stopSharing() {
    if (!idea) return
    try {
      await setShared(supabase, idea.id, false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t change')
    }
    load()
  }

  /** Link ideas: link mode in this idea's project (only its ideas), or on Home for My things and Ivy Mini. */
  function linkIdeas() {
    if (!idea) return
    if (idea.project && idea.project.kind === 'user') router.push({ pathname: '/project/[id]', params: { id: idea.project.id, linkFrom: idea.id } })
    else router.navigate({ pathname: '/', params: { linkFrom: idea.id } })
  }

  /** ••• → Photo credit: the Unsplash credit that used to sit under the picture. */
  function photoCredit() {
    const c = idea?.card.credit
    if (!c) return
    Alert.alert('Photo credit', `Photo by ${c.photographer} on Unsplash`, [
      { text: c.photographer, onPress: () => Linking.openURL(c.photographerUrl) },
      { text: 'View on Unsplash', onPress: () => Linking.openURL(c.photoUrl) },
      { text: 'OK', style: 'cancel' },
    ])
  }

  /**
   * A step card's Make: pre-filled with the step's make_prompt; nothing generates until Generate.
   * TODO(B.8b): open the Make page — router.push({ pathname: '/make/[id]', params: { id: idea.id, prompt: step.makePrompt, kind: step.makeKind } }).
   */
  function make() {
    if (!step?.makePrompt) return
    Alert.alert(MAKE_LABEL[step.makeKind as keyof typeof MAKE_LABEL] ?? 'Make', `${step.makePrompt}\n\nThis opens the Make page once it’s built. Nothing was spent.`)
  }

  function trash() {
    if (!idea) return
    Alert.alert('Move to trash?', TRASH_IDEA_LINE, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move to trash',
        style: 'destructive',
        onPress: async () => {
          try {
            await trashCard(supabase, idea.id)
            router.back()
          } catch (e) {
            setError(e instanceof Error ? e.message : 'That didn’t move to the trash')
          }
        },
      },
    ])
  }

  if (idea === undefined || idea === null) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {idea === null || error ? <Text style={[type['Body'], styles.grey]}>{error ?? 'This idea has gone.'}</Text> : <ActivityIndicator color={colour.Ink} />}
      </View>
    )
  }

  const picture = idea.card.picture
  // Every form but photo is drawn in the slot (CardFace falls back to text when a form's payload is missing).
  const drawnForm = idea.card.shape !== 'photo'
  // A board's grid: the same 3-up as its tile, from its own picture and its thread's.
  const grid =
    idea.card.shape === 'board'
      ? distinct([picture, ...idea.siblings.filter((s) => s.frameUrl).map((s): Picture => ({ source: 'reference', uri: s.frameUrl, kind: 'image', credit: null, linkUrl: null, trackUrl: null }))])
      : []
  const saved = savedTo(idea)
  const words = snippet(idea)
  const unsure = idea.confidence < LOW_CONFIDENCE
  const name = user?.fullName ?? user?.firstName ?? 'You'
  const showRecipe = idea.source !== 'recipe'
  const stepMake = step?.makePrompt && step.makeKind !== 'none' ? step : null
  const [left, right] = masonry(related ?? [])

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: insets.bottom + space.section }}>
        {/* 1. The picture */}
        {grid.length >= 3 ? (
          <View style={styles.picture} testID="idea-grid">
            <ThreeUp pictures={grid.slice(0, 3)} recyclingKey={idea.id} />
          </View>
        ) : drawnForm ? (
          <View style={styles.picture} testID="idea-form">
            <CardFace
              card={idea.card}
              size="page"
              photoHeight={PICTURE_H}
              playing={playing}
              onPlay={idea.storagePath ? play : undefined}
              footer={false}
              style={[styles.form, { paddingTop: insets.top + CHROME_H }]}
            />
          </View>
        ) : (
          <View style={[styles.picture, { backgroundColor: hueOf(idea.card.hue) }]} testID={picture.kind === 'video' ? 'idea-video' : 'idea-picture'}>
            {/* A video idea shows its poster — the take's first frame, paused; it never plays here. */}
            {picture.uri &&
              (picture.kind === 'video' ? (
                <Poster uri={picture.uri} />
              ) : (
                <Image source={{ uri: picture.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
              ))}
          </View>
        )}

        {/* 2. The action row */}
        <View style={styles.actions}>
          <View style={styles.icons}>
            <Icon name={idea.heartedAt ? 'heart.fill' : 'heart'} label={idea.heartedAt ? 'Unlike' : 'Like'} onPress={heart} testID="idea-like" />
            <Icon name="bubble.left" label="View idea" onPress={() => router.push(`/idea/view/${idea.id}`)} testID="idea-thread" />
            <Icon name="square.and.arrow.up" label="Share" onPress={() => setSheet('share')} testID="idea-share" />
          </View>
          <Pressable
            onPress={() => router.push({ pathname: '/idea/save/[id]', params: { id: idea.id, projectId: idea.project?.id } })}
            style={[styles.save, saved ? styles.saved : styles.unsaved]}
            accessibilityRole="button"
            accessibilityLabel={saved ? `Saved to ${saved}. Change` : 'Save to a project'}
            testID="idea-save"
          >
            <Text style={[styles.saveText, saved && styles.savedText]} numberOfLines={1}>
              {saved ? `Saved · ${saved}` : 'Save'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          {/* 3. Who */}
          <View style={styles.who}>
            {user?.imageUrl ? (
              <Image source={{ uri: user.imageUrl }} style={styles.avatar} accessibilityIgnoresInvertColors />
            ) : (
              <View style={[styles.avatar, styles.avatarBlank]}>
                <Text style={styles.initial}>{name.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.whoText}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.meta} numberOfLines={1} testID="idea-who">
                {whoLine(idea)}
              </Text>
            </View>
          </View>

          {/* 4. The snippet */}
          {!!words && (
            <Pressable onPress={idea.storagePath ? play : undefined} disabled={!idea.storagePath} accessibilityRole={idea.storagePath ? 'button' : undefined} accessibilityHint={idea.storagePath ? 'Plays her words.' : undefined}>
              <Text style={styles.snippet} numberOfLines={2} testID="idea-snippet">
                {words}
              </Text>
            </Pressable>
          )}
          <Pressable onPress={() => router.push(`/idea/view/${idea.id}`)} hitSlop={8} accessibilityRole="link" testID="idea-view">
            <Text style={styles.viewIdea}>View idea</Text>
          </Pressable>
          {step && <Text style={styles.stepTag} testID="step-tag">{step.tag}</Text>}
          {unsure && <Text style={styles.small}>Ivy isn’t sure about this one.</Text>}
          {error && <Text style={styles.small}>{error}</Text>}

          {/* 5. Make with */}
          {(showRecipe || stepMake) && (
            <>
              <Text style={styles.rowLabel}>Make with</Text>
              <View style={styles.tools}>
                {stepMake && <ToolSquare icon="sparkles" label={MAKE_LABEL[stepMake.makeKind as keyof typeof MAKE_LABEL]} onPress={make} lime testID="step-make" />}
                {showRecipe && <ToolSquare icon="sparkles" label="Recipe" badge={drafts} onPress={() => setSheet('recipe')} testID="make-recipe" />}
              </View>
            </>
          )}
        </View>

        {/* 6. More to explore */}
        {related && related.length > 0 && (
          <View testID="more-to-explore">
            <Text style={[styles.rowLabel, styles.exploreLabel]}>More to explore</Text>
            <View style={styles.grid}>
              {[left, right].map((col, i) => (
                <View key={i} style={styles.column}>
                  {col.map((item) => (
                    <View key={item.id} style={styles.cell}>
                      <Tile item={item} onOpen={(it) => router.push(`/idea/${it.id}`)} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Over the picture: back and •••, nothing else. */}
      <View style={[styles.chrome, { top: insets.top + 4 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.square} accessibilityRole="button" accessibilityLabel="Back" testID="idea-back">
          <SymbolView name="chevron.left" tintColor={colour.Ink} size={17} weight="semibold" />
        </Pressable>
        <Pressable onPress={() => setMenu(true)} style={styles.square} accessibilityRole="button" accessibilityLabel="More" testID="idea-more">
          <SymbolView name="ellipsis" tintColor={colour.Ink} size={17} weight="semibold" />
        </Pressable>
      </View>

      {menu && (
        <Menu
          top={insets.top + MENU_OFFSET}
          onClose={() => setMenu(false)}
          items={[
            { icon: idea.card.pinnedAt ? 'pin.slash' : 'pin', label: idea.card.pinnedAt ? 'Unpin' : 'Pin to top', onPress: pin },
            { icon: 'link', label: 'Link ideas', onPress: linkIdeas },
            { icon: 'paperclip', label: 'Add context', onPress: () => setSheet('context') },
            ...(idea.card.sharedAt ? [{ icon: 'eye.slash' as const, label: 'Stop sharing link', onPress: stopSharing }] : []),
            { icon: 'pencil', label: 'Edit idea', onPress: () => router.push(`/idea/edit/${idea.id}`) },
            ...(idea.recordingId ? [{ icon: 'text.alignleft' as const, label: 'View transcript', onPress: () => router.push(`/idea/transcript/${idea.id}`) }] : []),
            { icon: 'rectangle.3.group', label: 'Change view', onPress: changeView },
            { icon: 'square.on.square', label: 'Copy', onPress: copy },
            ...(idea.card.credit && picture.source === 'unsplash' ? [{ icon: 'camera' as const, label: 'Photo credit', onPress: photoCredit }] : []),
            { icon: 'folder', label: 'Move to project', onPress: () => router.push({ pathname: '/idea/save/[id]', params: { id: idea.id, projectId: idea.project?.id } }) },
            { icon: 'trash', label: 'Move to trash', onPress: trash, destructive: true },
          ]}
        />
      )}
      {sheet === 'share' && <ShareSheet card={idea.card} onClose={() => setSheet(null)} onShared={load} />}
      {sheet === 'context' && <AddContextSheet card={idea.card} onClose={() => setSheet(null)} />}
      {sheet === 'recipe' && (
        <RecipeSheet
          idea={idea.card}
          projectId={idea.project?.id ?? null}
          onClose={() => setSheet(null)}
          onApplied={(a) => {
            setSheet(null)
            router.push({ pathname: '/project/[id]', params: { id: a.projectId, applied: a.applicationId, appliedCount: String(a.count) } })
          }}
        />
      )}
    </View>
  )
}

/** A video idea's poster: its first frame, muted and paused (as Home's TakeStill, without the ▶ chip). */
function Poster({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true
    p.loop = false
  })
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} pointerEvents="none" />
}

function Icon({ name, label, onPress, testID }: { name: SFSymbol; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={styles.icon}>
      <SymbolView name={name} tintColor={colour.Ink} size={ICON} weight="regular" />
    </Pressable>
  )
}

/** W1's tool square: 52, r14, its label under it; a count badge top-right when there's one. */
function ToolSquare({ icon, label, onPress, badge = 0, lime, testID }: { icon: SFSymbol; label: string; onPress: () => void; badge?: number; lime?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.tool} accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge} yours` : label} testID={testID}>
      <View style={[styles.toolSquare, lime && styles.toolLime]}>
        <SymbolView name={icon} tintColor={colour.Ink} size={22} weight="semibold" />
        {badge > 0 && (
          <View style={styles.badge} testID={testID ? `${testID}-badge` : undefined}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.toolLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

// Figma v5.0 I1 (2151:5) — measured: picture 393 × 440 full-bleed; back and ••• translucent white squares 40, r12, 16
// in; the action row 16 under the picture, 26 icons 22 apart, Save 84 × 44 r12; who 32 avatar, name Semibold 15, meta
// Regular 13 grey; snippet Regular 15/21 two lines, "View idea" Semibold 13; "Make with" Regular 13 grey, squares 52
// r14 14 apart with Regular 11 labels; More to explore the Home masonry.
const PICTURE_H = 440
const CHROME_H = 4 + 40 + 12
const ICON = 26
const SQUARE = 40
const TOOL = 52

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space.margin },
  grey: { color: GREY },
  picture: { height: PICTURE_H, overflow: 'hidden' },
  form: { height: PICTURE_H, borderRadius: 0, justifyContent: 'flex-end' },
  chrome: { position: 'absolute', left: space.margin, right: space.margin, flexDirection: 'row', justifyContent: 'space-between' },
  square: { width: SQUARE, height: SQUARE, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.72)', alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.margin, paddingTop: 16 },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  icon: { width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
  save: { minWidth: 84, height: 44, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', maxWidth: 220 },
  unsaved: { backgroundColor: colour.Lime },
  saved: { backgroundColor: colour.Ink },
  saveText: { fontSize: 15, fontWeight: '600', color: colour.Ink },
  savedText: { color: colour.Surface },
  body: { paddingHorizontal: space.margin, paddingTop: 18 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarBlank: { backgroundColor: colour.Lime, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 14, fontWeight: '700', color: colour.Ink },
  whoText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colour.Ink },
  meta: { fontSize: 13, color: GREY, marginTop: 1 },
  snippet: { fontSize: 15, lineHeight: 21, color: colour.Ink, marginTop: 14 },
  viewIdea: { fontSize: 13, fontWeight: '600', color: colour.Ink, marginTop: 6 },
  stepTag: { fontSize: 13, color: GREY, marginTop: 10 },
  small: { fontSize: 13, color: GREY, marginTop: 8 },
  rowLabel: { fontSize: 13, color: GREY, marginTop: 24, marginBottom: 10 },
  tools: { flexDirection: 'row', gap: 14 },
  tool: { width: TOOL, alignItems: 'center' },
  toolSquare: { width: TOOL, height: TOOL, borderRadius: 14, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' },
  toolLime: { backgroundColor: colour.Lime },
  toolLabel: { fontSize: 11, color: colour.Ink, marginTop: 6 },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colour.Ink, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '700', color: colour.Surface },
  exploreLabel: { paddingHorizontal: space.margin, marginTop: 32 },
  grid: { flexDirection: 'row', gap: space.gutter, paddingHorizontal: space.margin },
  column: { flex: 1 },
  cell: { marginBottom: space.gutter },
})
