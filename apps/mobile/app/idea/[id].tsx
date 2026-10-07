// apps/mobile/app/idea/[id].tsx
// Idea (P9, the pin page). The visual on top in the form the idea takes (Job B revised, Figma 227:5): a photo — her
// imported picture or an Unsplash photograph, credited under it with links back — or the quote, comparison, board or
// text card drawn large; with back and •••; the summary is the heading (the transcript is behind •••, P6/P7); heart · mic · share; the dark
// project button (its name opens the project, P11 — or My things, P4; ⌄ = save it elsewhere, P10); the byline
// (who · when · where in the recording, tap to hear it); and More in this thread.
// The mic is the voice correction: Record, tagged to this card (a stub in the pipeline for now).
// No verbs here yet: a verb appears only once the idea has earned it (P13, Later row).
// ••• → Change view: every card can be shown as any form it has the words for (photo, quote, comparison, board,
// text); her choice sticks and is a style signal.
// Job C+: the ••• also lists the hold arc's actions — Pin to top (Unpin), Like, Link ideas, Add context, Share — and,
// once the card has a public link, Stop sharing link. Share opens the Share sheet (1459:207).

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
import { loadIdea, metaLine, setHeart, setPinned, setShape, sourceBadge, threadPill, viewsFor, type Idea } from '@/lib/idea'
import { setShared } from '@/lib/share'
import { ShareSheet } from '@/components/ShareSheet'
import { AddContextSheet } from '@/components/AddContextSheet'
import { CardFace, Credit, SHAPE_NAME } from '@/components/CardFace'
import { deleteCard } from '@/lib/deleteRecording'
import { Glass, Menu, MENU_OFFSET } from '@/components/PinChrome'
import { colour, radius, size, space, type } from '@ivywolf/ui'
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
    Alert.alert('Move to trash?', 'The idea and its frame are deleted. The recording stays in Voice notes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move to trash',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCard(supabase, idea.id)
            router.back()
          } catch (e) {
            setError(e instanceof Error ? e.message : 'That didn’t delete')
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

  const drawn = idea.frameStatus === 'done' && !!idea.frameUrl
  const photo = idea.card.shape === 'photo'
  const unsure = idea.confidence < LOW_CONFIDENCE
  const pill = threadPill(idea)
  const badge = sourceBadge(idea)

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: BAR_BOTTOM + size['bar-h'] + space.section }}>
        {photo ? (
          <>
            <View style={styles.visual}>
              {drawn ? (
                <Image source={{ uri: idea.frameUrl! }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />
              ) : (
                <Shimmer style={StyleSheet.absoluteFill} />
              )}
              <Glass icon="chevron.left" label="Back" onPress={() => router.back()} style={{ left: space.margin, top: space.margin }} />
              <Glass icon="ellipsis" label="More" onPress={() => setMenu(true)} style={{ right: space.margin, top: space.margin }} />
              {badge && (
                <View style={styles.badge} pointerEvents="none">
                  <Text style={type['Label / Pill']}>{badge}</Text>
                </View>
              )}
            </View>
            {idea.card.credit && (
              <View style={styles.credit}>
                <Credit card={idea.card} linked />
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.chromeRow}>
              <Glass icon="chevron.left" label="Back" onPress={() => router.back()} style={{ left: space.margin, top: 0, backgroundColor: colour.Chip }} />
              <Glass icon="ellipsis" label="More" onPress={() => setMenu(true)} style={{ right: space.margin, top: 0, backgroundColor: colour.Chip }} />
            </View>
            <CardFace
              card={idea.card}
              size="page"
              photoHeight={FRAME_H}
              playing={playing === idea.id}
              onPlay={idea.storagePath ? () => play(idea.id, idea.storagePath, idea.playFromMs) : undefined}
              style={styles.face}
            />
            {badge && (
              <View style={[styles.badge, styles.badgeInline]} pointerEvents="none">
                <Text style={type['Label / Pill']}>{badge}</Text>
              </View>
            )}
          </>
        )}

        <View style={styles.body}>
          <Text style={styles.heading}>{idea.title}</Text>
          <Pressable
            onPress={() => play(idea.id, idea.storagePath, idea.playFromMs)}
            style={styles.meta}
            accessibilityRole="button"
            accessibilityLabel={playing === idea.id ? 'Pause' : 'Play from here'}
          >
            <Text style={type['Caption']}>{metaLine(idea)}</Text>
            {playing === idea.id && <SymbolView name="speaker.wave.2" tintColor={colour.Grey} size={type['Caption'].fontSize} />}
          </Pressable>
          {unsure && <Text style={type['Caption']}>Ivy isn’t sure about this one.</Text>}

          <View style={styles.actions}>
            <Pressable onPress={heart} hitSlop={TAP_SLOP} accessibilityRole="button" accessibilityLabel={idea.heartedAt ? 'Unheart' : 'Heart'}>
              <SymbolView name={idea.heartedAt ? 'heart.fill' : 'heart'} tintColor={colour.Ink} size={size.icon} />
            </Pressable>
            <Pressable
              onPress={() => setSheet('share')}
              hitSlop={TAP_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Share"
            >
              <SymbolView name="square.and.arrow.up" tintColor={colour.Ink} size={size.icon} />
            </Pressable>

            <View style={styles.project}>
              <Pressable
                onPress={() =>
                  !idea.project || idea.project.kind === 'things' ? router.push('/things') : router.push(`/project/${idea.project.id}`)
                }
                hitSlop={PILL_SLOP}
                accessibilityRole="button"
                accessibilityLabel={`Open ${idea.project?.name ?? 'My things'}`}
              >
                <Text style={styles.projectName} numberOfLines={1}>
                  {idea.project?.name ?? 'My things'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.push({ pathname: '/idea/save/[id]', params: { id: idea.id, projectId: idea.project?.id } })}
                hitSlop={PILL_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Save to another project"
              >
                <SymbolView name="chevron.down" tintColor={colour.Surface} size={type['Body / Medium'].fontSize} weight="semibold" />
              </Pressable>
            </View>
          </View>

          {idea.siblings.length > 0 && (
            <>
              <View style={styles.moreRow}>
                <Text style={type['Title / Section']}>More in this thread</Text>
                {pill && (
                  <View style={styles.count}>
                    <Text style={type['Label / Overline']}>{pill}</Text>
                  </View>
                )}
              </View>
            </>
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
            { icon: 'trash', label: 'Move to trash', onPress: trash, destructive: true },
          ]}
        />
      )}
      {sheet === 'share' && <ShareSheet card={idea.card} onClose={() => setSheet(null)} onShared={load} />}
      {sheet === 'context' && <AddContextSheet card={idea.card} onClose={() => setSheet(null)} />}
    </View>
  )
}

// L4b Idea (Figma 209:36) — measured, not tokens: the frame is 400 tall; the heading starts 20 under it; the meta
// line 18 under the heading, the ♥ · Share row 12 under that; the thread pill has radius 16 (not radius/chip) and
// 10 × 6 padding; the thumbs start 14 under "More in this thread". The project pill is 38 tall, so its targets
// reach size/tap with slop.
const FRAME_H = 400
const HEADING_GAP = 20
const META_GAP = 18
const ROW_GAP = 12
const PILL_PAD_H = 16
const PILL_PAD_V = 10
const PILL_SLOP = (size.tap - (type['Body / Medium'].lineHeight + PILL_PAD_V * 2)) / 2
const COUNT_R = 16
const COUNT_PAD_H = 10
const COUNT_PAD_V = 6
const THUMBS_GAP = 14
const BADGE_PAD_H = 8 // P12d 201:98: 8 × 4
const BADGE_PAD_V = 4
const TAP_SLOP = (size.tap - size.icon) / 2
const GLASS_ROW = 36 + space.gutter // PinChrome's glass disc, and a gutter under it

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space.margin },
  secondary: { color: colour.Grey },
  visual: { marginHorizontal: space.margin, height: FRAME_H, borderRadius: radius.tile, overflow: 'hidden', backgroundColor: colour.Shimmer },
  body: { paddingHorizontal: space.margin, paddingTop: HEADING_GAP },
  heading: type['Title / Screen'],
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.gutter, marginTop: META_GAP },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.stack, marginTop: ROW_GAP },
  project: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gutter,
    maxWidth: '60%',
    paddingHorizontal: PILL_PAD_H,
    paddingVertical: PILL_PAD_V,
    borderRadius: radius.button,
    backgroundColor: colour.Ink,
  },
  projectName: { ...type['Body / Medium'], color: colour.Surface, flexShrink: 1 },
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
  thumbs: { paddingHorizontal: space.margin, paddingTop: THUMBS_GAP, gap: space.gutter },
  credit: { paddingHorizontal: space.margin },
  thumbTitle: { ...type['Body / Small'], fontWeight: '600', padding: space.gutter + 2 },
  // Non-photo forms: the glass buttons sit in a row above the card instead of over a picture.
  chromeRow: { height: GLASS_ROW, marginTop: space.margin },
  face: { marginHorizontal: space.margin },
  badgeInline: { position: 'relative', left: undefined, bottom: undefined, alignSelf: 'flex-start', marginLeft: space.margin, marginTop: space.gutter },
  thumb: { width: size.thumb, height: size.thumb, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colour.Chip },
})
