// apps/mobile/app/idea/[id].tsx
// Idea (B.8a, Figma v5.0 I1 2151:5, scrolled I1b 2151:42), Pinterest-clean. Top to bottom, and nothing else:
//   1. The picture, as a card: below the status bar (which sits on the page, never on the photo), 8 in from each side,
//      r32, at the image's own aspect ratio (capped at 75 % of the screen, at least 300). A photo card's picture (her
//      own, its Unsplash photo or its reference — lib/picture.ts — else its project's hue; a video idea's poster); a
//      board's 3-up once its thread has three pictures; any other form drawn large on its hue (CardFace, as B.5). Over
//      it only two frosted 48 squares: back, and ••• (where Change view, Move to project, Photo credit and the rest
//      live). An Unsplash photo's attribution is ••• → Photo credit for now; a visible line under the picture is
//      deferred (B.8a, 21 Oct).
//   2. One action row, as Pinterest's: ♥ (outline; filled only once liked) · ◯ (a plain round speech bubble — View
//      idea, I3, a bottom sheet over the page) · ↑ (Share) left, 28 pt outline icons, regular weight, 20 apart, with a
//      count 6 after ◯ when there's one (♥ gets one once other people can like an idea); Save right — lime 84 × 44
//      r12, or, once it's filed in one of her projects, Pinterest's split ink pill: the project's name, up to 180 and
//      scrolling when longer (opens it) | ˅ in 44 (Save to, I2, to move or remove it).
//   3. Who: her avatar 32, her name, "{day} {time} · {project}" grey ("Mon 7:40 · Lisa"); no duration on this page.
//   4. The snippet: her words in quotes, two lines, 15 — tap to hear them — then "View idea" (I3).
//   5. Make with: Video · Stills · Cut · ✦ Recipe (the header says "Make", so the squares don't). The first three are
//      placeholders until B.8b ("Soon"; a tap says it's coming, nothing runs or spends). Recipe is live: the B.10 recipe sheet, her private
//      drafts as its badge. On a card a recipe made, the step's square is lime and opens its prompt (TODO(B.8b): the
//      Make page), and the step's tag shows under the snippet.
//   6. More to explore: a 2-column masonry of her ideas most like this one (GET /api/cards/{id}/related). Each tile opens
//      its own idea page; nothing links.
// Gone since B.5: More in this thread (in I3 now), the thread pill, the source badge and the bottom Talk bar — the mic
// lives in the nav.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionSheetIOS, ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import type { MakeKind } from '@ivywolf/schema'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useAudioPlayer } from 'expo-audio'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { BlurView } from 'expo-blur'
import { useAuth, useUser } from '@clerk/clerk-expo'
import { LOW_CONFIDENCE } from '@ivywolf/schema'
import { useSupabase } from '@/lib/supabase'
import { loadIdea, savedTo, setHeart, setPinned, setShape, snippet, viewsFor, whoLine, type Idea } from '@/lib/idea'
import { setShared } from '@/lib/share'
import { masonry, type CardItem } from '@/lib/home'
import { loadRelated } from '@/lib/related'
import { loadIvyThread } from '@/lib/viewIdea'
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
import { Pill } from '@/components/UndoPill'
import { AvatarInitials } from '@/components/AvatarInitials'
import { Marquee } from '@/components/Marquee'
import { colour, hueOf, space, type } from '@ivywolf/ui'

const GREY = '#6E6E73'
const SOFT = '#F2F2F7'

export default function IdeaPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const { getToken, userId } = useAuth()
  const { user } = useUser()
  const insets = useSafeAreaInsets()
  const screenSize = useWindowDimensions()
  const [idea, setIdea] = useState<Idea | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [menu, setMenu] = useState(false)
  const [sheet, setSheet] = useState<'share' | 'context' | 'recipe' | null>(null)
  // A card a recipe made (B.10): its "Step n of … · @handle" tag and its Make square.
  const [step, setStep] = useState<StepCard | null>(null)
  const [drafts, setDrafts] = useState(0)
  const [related, setRelated] = useState<CardItem[] | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // The picture's own height ÷ width, once it has loaded (a drawn form has none: RATIO).
  const [ratio, setRatio] = useState<number | null>(null)
  // ◯'s count: what View idea's Ivy thread lists (its other ideas, directions, Ivy's notes).
  const [comments, setComments] = useState(0)
  const player = useAudioPlayer(null)

  // Clerk hands out a new getToken every render, so nothing below depends on it directly: a callback keyed on it was
  // new each render, and useFocusEffect re-ran it every render — the idea page reloaded itself in a loop (B.8a build
  // 26: More to explore flickered and never filled, and the flood of requests starved Save to's). Read it from a ref.
  const tokenRef = useRef(getToken)
  tokenRef.current = getToken

  const load = useCallback(() => {
    loadIdea(supabase, id)
      .then((i) => {
        setIdea(i)
        if (i) countComments(supabase, i.id, i.recordingId).then(setComments)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
    loadStepCard(supabase, id)
      .then(setStep)
      .catch(() => setStep(null))
    if (userId) draftCount(supabase, userId).then(setDrafts).catch(() => setDrafts(0))
  }, [supabase, id, userId])
  useFocusEffect(load)

  // More to explore: one fetch per idea, never per render or per focus. A reply for an idea she's left is dropped.
  useEffect(() => {
    let live = true
    setRelated(null)
    tokenRef
      .current()
      .then((token) => (token ? loadRelated(supabase, token, id) : []))
      .then((r) => live && setRelated(r))
      .catch(() => live && setRelated([]))
    return () => {
      live = false
    }
  }, [supabase, id])

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

  /** A Make square before B.8b: says it's coming, for 2 s. Nothing runs, nothing is spent. */
  function soon(label: string) {
    setToast(`${label} is coming in the next build`)
    setTimeout(() => setToast((t) => (t?.startsWith(label) ? null : t)), TOAST_MS)
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
  // A step that writes has no B.8b square of its own, so it keeps a lime Make words square at the front.
  const stepWrites = stepMake?.makeKind === 'write'
  const [left, right] = masonry(related ?? [])
  const cardW = screenSize.width - 2 * CARD_INSET
  const pictureH = Math.round(Math.min(Math.max(cardW * (ratio ?? RATIO), PICTURE_MIN), screenSize.height * PICTURE_MAX))
  const openSaveTo = () => router.push({ pathname: '/idea/save/[id]', params: { id: idea.id, projectId: idea.project?.id } })

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: insets.top + CARD_TOP, paddingBottom: insets.bottom + space.section }}
      >
        {/* 1. The picture */}
        {grid.length >= 3 ? (
          <View style={[styles.picture, { width: cardW, height: pictureH }]} testID="idea-grid">
            <ThreeUp pictures={grid.slice(0, 3)} recyclingKey={idea.id} />
          </View>
        ) : drawnForm ? (
          <View style={[styles.picture, { width: cardW, height: pictureH }]} testID="idea-form">
            <CardFace
              card={idea.card}
              size="page"
              photoHeight={pictureH}
              playing={playing}
              onPlay={idea.storagePath ? play : undefined}
              footer={false}
              style={[styles.form, { height: pictureH }]}
            />
          </View>
        ) : (
          <View style={[styles.picture, { width: cardW, height: pictureH, backgroundColor: hueOf(idea.card.hue) }]} testID={picture.kind === 'video' ? 'idea-video' : 'idea-picture'}>
            {/* A video idea shows its poster — the take's first frame, paused; it never plays here. */}
            {picture.uri &&
              (picture.kind === 'video' ? (
                <Poster uri={picture.uri} onRatio={setRatio} />
              ) : (
                <Image
                  source={{ uri: picture.uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  onLoad={(e) => e.source.width > 0 && setRatio(e.source.height / e.source.width)}
                  accessibilityIgnoresInvertColors
                />
              ))}
          </View>
        )}

        {/* 2. The action row */}
        <View style={styles.actions}>
          <View style={styles.icons}>
            {/* ♥ has no count until other people can like an idea: hers alone would always read 1. */}
            <Icon name={idea.heartedAt ? 'heart.fill' : 'heart'} label={idea.heartedAt ? 'Unlike' : 'Like'} onPress={heart} testID="idea-like" />
            <Icon name="message" label="View idea" count={comments} onPress={() => router.push(`/idea/view/${idea.id}`)} testID="idea-thread" />
            <Icon name="square.and.arrow.up" label="Share" onPress={() => setSheet('share')} testID="idea-share" />
          </View>
          {saved && idea.project ? (
            // Pinterest's split pill: the project's name opens it; ˅ opens Save to, to move or remove it.
            <View style={[styles.save, styles.saved]} testID="idea-save">
              <Pressable
                onPress={() => router.push({ pathname: '/project/[id]', params: { id: idea.project!.id } })}
                style={({ pressed }) => [styles.splitName, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Saved to ${saved}. Open it`}
                testID="idea-saved-project"
              >
                <Marquee text={saved} maxWidth={SPLIT_NAME - 2 * SPLIT_PAD} style={[styles.saveText, styles.savedText]} testID="idea-saved-name" />
              </Pressable>
              <View style={styles.divider} />
              <Pressable
                onPress={openSaveTo}
                style={({ pressed }) => [styles.splitChevron, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Move or remove"
                testID="idea-save-change"
              >
                <SymbolView name="chevron.down" tintColor={colour.Surface} size={14} weight="semibold" />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={openSaveTo} style={[styles.save, styles.unsaved]} accessibilityRole="button" accessibilityLabel="Save to a project" testID="idea-save">
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.body}>
          {/* 3. Who */}
          <View style={styles.who}>
            {/* Her photo only if she has one (Clerk's imageUrl is a generated purple placeholder otherwise). */}
            <AvatarInitials name={name} uri={user?.hasImage ? user.imageUrl : null} size={AVATAR} testID="idea-avatar" />
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
          <Text style={styles.header} accessibilityRole="header">
            Make with
          </Text>
          <View style={styles.tools}>
            {stepWrites && <ToolSquare icon="text.quote" label="Words" onPress={make} lime testID="step-make" />}
            {MAKES.map((m) =>
              stepMake?.makeKind === m.kind ? (
                <ToolSquare key={m.kind} icon={m.icon} label={m.label} spoken={m.name} onPress={make} lime testID="step-make" />
              ) : (
                <ToolSquare key={m.kind} icon={m.icon} label={m.label} spoken={m.name} sub="Soon" onPress={() => soon(m.name)} testID={`make-${m.kind}`} />
              )
            )}
            {showRecipe && <ToolSquare icon="sparkles" label="Recipe" badge={drafts} onPress={() => setSheet('recipe')} testID="make-recipe" />}
          </View>
        </View>

        {/* 6. More to explore */}
        {related && related.length > 0 && (
          <View testID="more-to-explore">
            <Text style={[styles.header, styles.exploreHeader]} accessibilityRole="header">
              More to explore
            </Text>
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

      {/* The status bar sits on the page: the picture scrolls under this band, never under the clock. */}
      <View style={[styles.statusBand, { height: insets.top }]} pointerEvents="none" />

      {/* Over the picture: back and •••, nothing else. */}
      <View style={[styles.chrome, { top: insets.top + CARD_TOP + CHROME_INSET }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.square} accessibilityRole="button" accessibilityLabel="Back" testID="idea-back">
          <Frost />
          <SymbolView name="chevron.left" tintColor={colour.Ink} size={SQUARE_SYMBOL} weight={SQUARE_WEIGHT} />
        </Pressable>
        <Pressable onPress={() => setMenu(true)} style={styles.square} accessibilityRole="button" accessibilityLabel="More" testID="idea-more">
          <Frost />
          <SymbolView name="ellipsis" tintColor={colour.Ink} size={SQUARE_SYMBOL} weight={SQUARE_WEIGHT} />
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
      {toast && <Pill label={toast} tone="grey" testID="make-toast" />}
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

/** ◯'s count, or 0 when the thread can't be read — a count never stops the page. */
async function countComments(supabase: ReturnType<typeof useSupabase>, cardId: string, recordingId: string | null): Promise<number> {
  try {
    const t = await loadIvyThread(supabase, cardId, recordingId)
    return t.ideas.length + t.directions.length + t.notes.length
  } catch {
    return 0
  }
}

/** Behind back and •••: the photo, blurred, under white at 0.78 — Pinterest's and Instagram's frosted squares. */
function Frost() {
  return (
    <>
      <BlurView intensity={BLUR} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.frost]} />
    </>
  )
}

/** A video idea's poster: its first frame, muted and paused (as Home's TakeStill, without the ▶ chip). Reports its
 *  height ÷ width once the take loads, so the card keeps the take's shape. */
function Poster({ uri, onRatio }: { uri: string; onRatio: (r: number) => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true
    p.loop = false
  })
  useEffect(() => {
    const sub = player.addListener?.('sourceLoad', ({ availableVideoTracks }) => {
      const size = availableVideoTracks[0]?.size
      if (size?.width) onRatio(size.height / size.width)
    })
    return () => sub?.remove()
  }, [player, onRatio])
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} pointerEvents="none" />
}

/** An action-row icon, with its count after it in small grey when there's one. */
function Icon({ name, label, count = 0, onPress, testID }: { name: SFSymbol; label: string; count?: number; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={count > 0 ? `${label}, ${count}` : label} testID={testID} style={styles.iconRow}>
      <View style={styles.icon}>
        <SymbolView name={name} tintColor={colour.Ink} size={ICON_SYMBOL} weight={ICON_WEIGHT} />
      </View>
      {count > 0 && (
        <Text style={styles.count} testID={testID ? `${testID}-count` : undefined} allowFontScaling={false}>
          {count}
        </Text>
      )}
    </Pressable>
  )
}

/** W1's tool square: 52, r14, its label under it; a count badge top-right when there's one. */
function ToolSquare({ icon, label, spoken, onPress, badge = 0, lime, sub, testID }: {
  icon: SFSymbol
  label: string
  /** What VoiceOver says, when the label leans on the header ("Video" under "Make with" → "Make video"). */
  spoken?: string
  onPress: () => void
  badge?: number
  lime?: boolean
  sub?: string
  testID?: string
}) {
  return (
    <Pressable onPress={onPress} style={styles.tool} accessibilityRole="button" accessibilityLabel={[spoken ?? label, sub, badge ? `${badge} yours` : null].filter(Boolean).join(', ')} testID={testID}>
      <View style={[styles.toolSquare, lime && styles.toolLime]}>
        <SymbolView name={icon} tintColor={colour.Ink} size={22} weight="semibold" />
        {badge > 0 && (
          <View style={styles.badge} testID={testID ? `${testID}-badge` : undefined}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.toolLabel} numberOfLines={2}>
        {label}
      </Text>
      {sub && <Text style={styles.toolSub}>{sub}</Text>}
    </Pressable>
  )
}

// Figma v5.0 I1 (2151:5), matched to Pinterest's idea page: the picture a card 8 from the sides and the status bar, r32,
// at its own ratio; back and ••• each a 48 frosted square (blur 40 under white 0.78), r14, 16 inside the card's top
// corners, 24 pt icons at stroke 2; the action row 16 under the picture, 28 pt outline icons at stroke 1.8, 20 apart,
// counts Regular 14 ink 6 after their icon, Save 84 × 44 r12 (saved: name up to 180 | ˅ 44, a 1 pt divider); who 32 avatar, name Semibold 15, meta Regular 13 grey; snippet
// Regular 15/21 two lines, "View idea" Semibold 13; "Make with" and "More to explore" Semibold 20 ink, 28 above and 12
// below; squares 52 r14 with Regular 13 ink labels ("Soon" 11 grey under); More to explore the Home masonry.
const CARD_INSET = 8
const CARD_TOP = 8
const CARD_RADIUS = 32
/** Height ÷ width when the picture has no ratio of its own (a drawn form, a grid, or before it loads): 4:5. */
const RATIO = 1.25
const PICTURE_MIN = 300
const PICTURE_MAX = 0.75
const BLUR = 40
/** The saved pill: the name's part at most 180 (padding included), ˅'s 44. */
const SPLIT_NAME = 180
const SPLIT_PAD = 14
const SPLIT_CHEVRON = 44
// Icons are SF Symbols (the Home hold menu's set). A symbol's glyph draws at about 0.8 of its size (HoldArc: size 30
// is a 24 pt glyph), so a 28 pt glyph is size 35 and a 24 pt one size 30. Stroke is the symbol's weight: regular is
// about 1.8, medium about 2.
const ICON = 28
const ICON_SYMBOL = 35
const ICON_WEIGHT = 'regular' as const
const SQUARE = 48
const SQUARE_SYMBOL = 30
const SQUARE_WEIGHT = 'medium' as const
const CHROME_INSET = 16
// A drawn form starts under the squares.
const CHROME_H = CHROME_INSET + SQUARE + 12
const TOOL = 52
const AVATAR = 32
const TOAST_MS = 2000
/** The Make squares, in W1's order, before Recipe. Placeholders until B.8b. */
const MAKES: { kind: Exclude<MakeKind, 'write' | 'none'>; label: string; name: string; icon: SFSymbol }[] = [
  { kind: 'video', label: 'Video', name: 'Make video', icon: 'video' },
  { kind: 'still', label: 'Stills', name: 'Make stills', icon: 'photo.on.rectangle' },
  { kind: 'cut', label: 'Cut', name: 'Make a cut', icon: 'scissors' },
]

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colour.Surface },
  centered: { alignItems: 'center', justifyContent: 'center', padding: space.margin },
  grey: { color: GREY },
  // Its width is set (screen − 2 × 8) and centred, so nothing inside it — a poster, a drawn form — can widen it.
  picture: { alignSelf: 'center', borderRadius: CARD_RADIUS, overflow: 'hidden' },
  form: { borderRadius: 0, justifyContent: 'flex-end', paddingTop: CHROME_H },
  statusBand: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colour.Surface },
  chrome: { position: 'absolute', left: CARD_INSET + CHROME_INSET, right: CARD_INSET + CHROME_INSET, flexDirection: 'row', justifyContent: 'space-between' },
  square: { width: SQUARE, height: SQUARE, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  frost: { backgroundColor: 'rgba(255,255,255,0.78)' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.margin, paddingTop: 16 },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 14, color: colour.Ink },
  save: { minWidth: 84, height: 44, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  unsaved: { backgroundColor: colour.Lime },
  saved: { backgroundColor: colour.Ink, flexDirection: 'row', paddingHorizontal: 0, overflow: 'hidden' },
  splitName: { maxWidth: SPLIT_NAME, height: 44, justifyContent: 'center', paddingHorizontal: SPLIT_PAD },
  divider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.3)' },
  splitChevron: { width: SPLIT_CHEVRON, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  saveText: { fontSize: 15, fontWeight: '600', color: colour.Ink },
  savedText: { color: colour.Surface },
  body: { paddingHorizontal: space.margin, paddingTop: 18 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  whoText: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colour.Ink },
  meta: { fontSize: 13, color: GREY, marginTop: 1 },
  snippet: { fontSize: 15, lineHeight: 21, color: colour.Ink, marginTop: 14 },
  viewIdea: { fontSize: 13, fontWeight: '600', color: colour.Ink, marginTop: 6 },
  stepTag: { fontSize: 13, color: GREY, marginTop: 10 },
  small: { fontSize: 13, color: GREY, marginTop: 8 },
  // Pinterest's section header ("More to explore"): Semibold 20 ink, 28 above, 12 below.
  header: { fontSize: 20, fontWeight: '600', color: colour.Ink, marginTop: 28, marginBottom: 12 },
  tools: { flexDirection: 'row', gap: 4, marginHorizontal: -9 },
  tool: { width: TOOL + 18, alignItems: 'center' },
  toolSquare: { width: TOOL, height: TOOL, borderRadius: 14, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' },
  toolLime: { backgroundColor: colour.Lime },
  toolLabel: { fontSize: 13, color: colour.Ink, marginTop: 6, textAlign: 'center' },
  toolSub: { fontSize: 11, color: GREY, marginTop: 1 },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colour.Ink, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '700', color: colour.Surface },
  exploreHeader: { paddingHorizontal: space.margin },
  grid: { flexDirection: 'row', gap: space.gutter, paddingHorizontal: space.margin },
  column: { flex: 1 },
  cell: { marginBottom: space.gutter },
})
