// apps/mobile/app/idea/[id].tsx
// Idea (P9), laid out like the to-do page since B.4 (Figma 1797:59; B.5). The full-bleed slot at the top, 393 × 440,
// holds the card's form: a photo card's picture — her own, its Unsplash photo or its reference (lib/picture.ts), else
// its project's hue — credited under it; a board's grid, as its tile draws it (its picture and two more from its
// thread, once the thread has three different ones; until then the board itself, hook and beats); a quote, text or
// comparison card drawn large on its hue (CardFace). Change view moves the page and the tile together. Back, ♥, Share and ••• sit over it. Then the title in Bold 28 and her words, 17/24 — the span of
// the recording it came from (tap to hear it), or the gist when there's no recording; "Ivy isn't sure" under 0.6;
// and More in this thread. No summary block and no project pill: Move to project is under •••, beside Move to trash.
// The mic in the bar is the voice correction: Record, tagged to this card (a stub in the pipeline for now).
// ••• → Change view: her choice of form sticks and is a style signal; the form shows on Home's tile. The ••• also
// lists the hold arc's actions — Pin to top (Unpin), Like, Link ideas, Add context, Share — and, once the card has a
// public link, Stop sharing link. Share opens the Share sheet (1459:207).

import { useCallback, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useAudioPlayer } from 'expo-audio'
import { Image } from 'expo-image'
import { useAuth } from '@clerk/clerk-expo'
import { LOW_CONFIDENCE } from '@ivywolf/schema'
import { useSupabase } from '@/lib/supabase'
import { loadIdea, setHeart, setPinned, setShape, sourceBadge, threadPill, viewsFor, type Idea } from '@/lib/idea'
import { heard } from '@/lib/todo'
import { setShared } from '@/lib/share'
import { ShareSheet } from '@/components/ShareSheet'
import { AddContextSheet } from '@/components/AddContextSheet'
import { CardFace, Credit, SHAPE_NAME } from '@/components/CardFace'
import { distinct, ThreeUp } from '@/components/IdeaTile'
import type { Picture } from '@/lib/picture'
import { trashCard, TRASH_IDEA_LINE } from '@/lib/trash'
import { Menu, MENU_OFFSET } from '@/components/PinChrome'
import { colour, hueOf, radius, size, space, type } from '@ivywolf/ui'
import { Shimmer } from '@/components/Shimmer'
import { ActionBar, BAR_BOTTOM } from '@/components/ActionBar'

export default function IdeaPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const { getToken } = useAuth()
  const insets = useSafeAreaInsets()
  const [idea, setIdea] = useState<Idea | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState<'share' | 'context' | null>(null)
  const player = useAudioPlayer(null)

  const load = useCallback(() => {
    loadIdea(supabase, id)
      .then(setIdea)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [supabase, id])
  useFocusEffect(load)

  async function play(cardId: string, storagePath: string | null, ms: number) {
    if (!storagePath) return
    if (playing === cardId) {
      player.pause()
      return setPlaying(null)
    }
    const { data } = await supabase.storage.from('recordings').createSignedUrl(storagePath, 3600)
    if (!data) return
    player.replace({ uri: data.signedUrl })
    await player.seekTo(ms / 1000)
    player.play()
    setPlaying(cardId)
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
    const on = !idea.card.pinnedAt
    try {
      await setPinned(supabase, idea.id, on)
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
        {idea === null || error ? (
          <Text style={[type['Body'], styles.secondary]}>{error ?? 'This idea has gone.'}</Text>
        ) : (
          <ActivityIndicator color={colour.Ink} />
        )}
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
  const unsure = idea.confidence < LOW_CONFIDENCE
  const pill = threadPill(idea)
  const badge = sourceBadge(idea)
  const words = idea.said ? `“${heard(idea.said).quote}”` : idea.gist

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: BAR_BOTTOM + size['bar-h'] + space.section }}
      >
        {grid.length >= 3 ? (
          <View style={styles.picture} testID="idea-grid">
            <ThreeUp pictures={grid.slice(0, 3)} recyclingKey={idea.id} />
          </View>
        ) : drawnForm ? (
          // The form, large, filling the slot; the chrome's row is kept clear above it.
          <View style={styles.picture} testID="idea-form">
            <CardFace
              card={idea.card}
              size="page"
              photoHeight={PICTURE_H}
              playing={playing === idea.id}
              onPlay={idea.storagePath ? () => play(idea.id, idea.storagePath, idea.playFromMs) : undefined}
              footer={false}
              style={[styles.form, { paddingTop: insets.top + CHROME_H }]}
            />
            {badge && (
              <View style={[styles.badge, styles.badgeOnForm]} pointerEvents="none">
                <Text style={type['Label / Pill']}>{badge}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.picture, { backgroundColor: hueOf(idea.card.hue) }]} testID="idea-picture">
            {picture.uri && picture.kind !== 'video' && (
              <Image source={{ uri: picture.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
            )}
            {badge && (
              <View style={styles.badge} pointerEvents="none">
                <Text style={type['Label / Pill']}>{badge}</Text>
              </View>
            )}
          </View>
        )}
        {!drawnForm && idea.card.credit && picture.source === 'unsplash' && (
          <View style={styles.credit}>
            <Credit card={idea.card} linked />
          </View>
        )}

        <View style={styles.body}>
          <Text style={styles.heading}>{idea.title}</Text>
          {!!words && (
            <Pressable
              onPress={idea.storagePath ? () => play(idea.id, idea.storagePath, idea.playFromMs) : undefined}
              disabled={!idea.storagePath}
              accessibilityRole={idea.storagePath ? 'button' : undefined}
              accessibilityHint={idea.storagePath ? 'Plays her words.' : undefined}
            >
              <Text style={styles.said}>
                {words}
                {playing === idea.id && <Text style={styles.secondary}>{'  ▶'}</Text>}
              </Text>
            </Pressable>
          )}
          {unsure && <Text style={[type['Caption'], styles.unsure]}>Ivy isn’t sure about this one.</Text>}
          {error && <Text style={[type['Caption'], styles.unsure]}>{error}</Text>}

          {idea.siblings.length > 0 && (
            <View style={styles.moreRow}>
              <Text style={type['Title / Section']}>More in this thread</Text>
              {pill && (
                <View style={styles.count}>
                  <Text style={type['Label / Overline']}>{pill}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {idea.siblings.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
            {idea.siblings.map((s) => (
              <Pressable key={s.id} onPress={() => router.push(`/idea/${s.id}`)} style={styles.thumb} accessibilityRole="button" accessibilityLabel={s.title}>
                {s.frameStatus === 'done' && s.frameUrl ? (
                  <Image source={{ uri: s.frameUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
                ) : s.frameStatus === 'none' || s.frameStatus === 'queued' ? (
                  <Shimmer style={StyleSheet.absoluteFill} />
                ) : (
                  // A quote, comparison, board or text card has no picture: its title stands in.
                  <Text style={styles.thumbTitle} numberOfLines={4}>
                    {s.title}
                  </Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </ScrollView>

      <View style={[styles.chrome, { top: insets.top + 4 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.circle} accessibilityRole="button" accessibilityLabel="Back">
          <SymbolView name="chevron.left" tintColor={colour.Ink} size={18} weight="semibold" />
        </Pressable>
        <View style={styles.chromeRight}>
          <Pressable onPress={heart} style={styles.circle} accessibilityRole="button" accessibilityLabel={idea.heartedAt ? 'Unheart' : 'Heart'}>
            <SymbolView name={idea.heartedAt ? 'heart.fill' : 'heart'} tintColor={colour.Ink} size={18} weight="semibold" />
          </Pressable>
          <Pressable onPress={() => setSheet('share')} style={styles.share} accessibilityRole="button">
            <Text style={styles.shareLabel}>Share</Text>
          </Pressable>
          <Pressable onPress={() => setMenu(true)} style={styles.circle} accessibilityRole="button" accessibilityLabel="More">
            <SymbolView name="ellipsis" tintColor={colour.Ink} size={18} weight="semibold" />
          </Pressable>
        </View>
      </View>
      <ActionBar
        verbs={[
          {
            key: 'talk',
            label: 'Talk',
            icon: 'mic.fill',
            lime: true,
            accessibilityLabel: 'Correct by voice',
            onPress: () => router.push({ pathname: '/record', params: { correctionOf: idea.id } }),
          },
        ]}
      />
      {menu && (
        <Menu
          top={insets.top + MENU_OFFSET}
          onClose={() => setMenu(false)}
          items={[
            { icon: idea.card.pinnedAt ? 'pin.slash' : 'pin', label: idea.card.pinnedAt ? 'Unpin' : 'Pin to top', onPress: pin },
            { icon: idea.heartedAt ? 'heart.fill' : 'heart', label: idea.heartedAt ? 'Unlike' : 'Like', onPress: heart },
            { icon: 'link', label: 'Link ideas', onPress: linkIdeas },
            { icon: 'paperclip', label: 'Add context', onPress: () => setSheet('context') },
            { icon: 'square.and.arrow.up', label: 'Share', onPress: () => setSheet('share') },
            ...(idea.card.sharedAt ? [{ icon: 'eye.slash' as const, label: 'Stop sharing link', onPress: stopSharing }] : []),
            { icon: 'pencil', label: 'Edit idea', onPress: () => router.push(`/idea/edit/${idea.id}`) },
            ...(idea.recordingId
              ? [{ icon: 'text.alignleft' as const, label: 'View transcript', onPress: () => router.push(`/idea/transcript/${idea.id}`) }]
              : []),
            { icon: 'rectangle.3.group', label: 'Change view', onPress: changeView },
            { icon: 'square.on.square', label: 'Copy', onPress: copy },
            {
              icon: 'folder',
              label: 'Move to project',
              onPress: () => router.push({ pathname: '/idea/save/[id]', params: { id: idea.id, projectId: idea.project?.id } }),
            },
            { icon: 'trash', label: 'Move to trash', onPress: trash, destructive: true },
          ]}
        />
      )}
      {sheet === 'share' && <ShareSheet card={idea.card} onClose={() => setSheet(null)} onShared={load} />}
      {sheet === 'context' && <AddContextSheet card={idea.card} onClose={() => setSheet(null)} />}
    </View>
  )
}

// B.5 (Figma 1797:59, the to-do page's layout): picture 393 × 440 from the top; back, ♥ and ••• white circles 44, Share
// an ink pill 78 × 44 (Semibold 15 white), 7 apart; the title Bold 28 at 24 under the picture; her words Regular 17/24,
// 7 under; More in this thread a section under that, its thumbs 14 under the heading. The source badge (P12d) sits on
// the picture, 8 × 4.
const PICTURE_H = 440
const CHROME_H = 4 + 44 + 12 // the chrome row over the slot, and 12 under it
const COUNT_R = 16
const COUNT_PAD_H = 10
const COUNT_PAD_V = 6
const THUMBS_GAP = 14
const BADGE_PAD_H = 8
const BADGE_PAD_V = 4

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space.margin },
  secondary: { color: colour.Grey },
  picture: { height: PICTURE_H, overflow: 'hidden' },
  // CardFace's page box made full-bleed: square corners, the slot's height, the form at the bottom of it.
  form: { height: PICTURE_H, borderRadius: 0, justifyContent: 'flex-end' },
  chrome: { position: 'absolute', left: space.margin, right: space.margin, flexDirection: 'row', justifyContent: 'space-between' },
  chromeRight: { flexDirection: 'row', gap: 7 },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.Surface, alignItems: 'center', justifyContent: 'center' },
  share: { width: 78, height: 44, borderRadius: 22, backgroundColor: colour.Ink, alignItems: 'center', justifyContent: 'center' },
  shareLabel: { fontSize: 15, fontWeight: '600', color: colour.Surface },
  body: { paddingHorizontal: space.margin, paddingTop: 24 },
  heading: { fontSize: 28, fontWeight: '700', color: colour.Ink },
  said: { fontSize: 17, lineHeight: 24, color: colour.Ink, marginTop: 7 },
  unsure: { marginTop: 8 },
  moreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.section },
  count: { borderRadius: COUNT_R, paddingHorizontal: COUNT_PAD_H, paddingVertical: COUNT_PAD_V, backgroundColor: colour.Chip },
  // P12d's "via YouTube · pinned just now" — here, never on the tile.
  badge: {
    position: 'absolute',
    left: space.margin,
    bottom: space.margin,
    borderRadius: radius.chip,
    paddingHorizontal: BADGE_PAD_H,
    paddingVertical: BADGE_PAD_V,
    backgroundColor: colour.Lime,
  },
  // On a drawn form the badge sits top-left, under the chrome, clear of the form's words.
  badgeOnForm: { bottom: undefined, top: 112 },
  thumbs: { paddingHorizontal: space.margin, paddingTop: THUMBS_GAP, gap: space.gutter },
  credit: { paddingHorizontal: space.margin },
  thumbTitle: { ...type['Body / Small'], fontWeight: '600', padding: space.gutter + 2 },
  thumb: { width: size.thumb, height: size.thumb, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colour.Chip },
})
