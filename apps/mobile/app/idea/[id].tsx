// apps/mobile/app/idea/[id].tsx
// Idea (P9, the pin page). The visual on top — her frame, her imported picture, or the title set in the palette —
// with back and •••; the summary is the heading (the transcript is behind •••, P6/P7); heart · mic · share; the dark
// project button (its name opens the project, P11 — or My things, P4; ⌄ = save it elsewhere, P10); the byline
// (who · when · where in the recording, tap to hear it); and More in this thread.
// The mic is the voice correction: Record, tagged to this card (a stub in the pipeline for now).
// No verbs here yet: a verb appears only once the idea has earned it (P13, Later row).

import { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView } from 'expo-symbols'
import { useAudioPlayer } from 'expo-audio'
import { LOW_CONFIDENCE } from '@ivywolf/schema'
import { useSupabase } from '@/lib/supabase'
import { loadIdea, metaLine, setHeart, threadPill, type Idea } from '@/lib/idea'
import { deleteCard } from '@/lib/deleteRecording'
import { Glass, Menu, MENU_OFFSET } from '@/components/PinChrome'
import { colour, radius, size, space, type } from '@ivywolf/ui'
import { Shimmer } from '@/components/Shimmer'
import { ActionBar, BAR_BOTTOM } from '@/components/ActionBar'

export default function IdeaPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const insets = useSafeAreaInsets()
  const [idea, setIdea] = useState<Idea | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
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
  const unsure = idea.confidence < LOW_CONFIDENCE
  const pill = threadPill(idea)

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: BAR_BOTTOM + size['bar-h'] + space.section }}>
        <View style={styles.visual}>
          {drawn ? (
            <Image source={{ uri: idea.frameUrl! }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : (
            <Shimmer style={StyleSheet.absoluteFill} />
          )}
          <Glass icon="chevron.left" label="Back" onPress={() => router.back()} style={{ left: space.margin, top: space.margin }} />
          <Glass icon="ellipsis" label="More" onPress={() => setMenu(true)} style={{ right: space.margin, top: space.margin }} />
        </View>

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
              onPress={() => Share.share({ message: idea.gist ? `${idea.title}\n\n${idea.gist}` : idea.title })}
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
                  <Image source={{ uri: s.frameUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
                ) : (
                  <Shimmer style={StyleSheet.absoluteFill} />
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
            { icon: 'pencil', label: 'Edit idea', onPress: () => router.push(`/idea/edit/${idea.id}`) },
            { icon: 'text.alignleft', label: 'View transcript', onPress: () => router.push(`/idea/transcript/${idea.id}`) },
            { icon: 'square.on.square', label: 'Copy', onPress: copy },
            { icon: 'trash', label: 'Move to trash', onPress: trash, destructive: true },
          ]}
        />
      )}
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
const TAP_SLOP = (size.tap - size.icon) / 2

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
  thumbs: { paddingHorizontal: space.margin, paddingTop: THUMBS_GAP, gap: space.gutter },
  thumb: { width: size.thumb, height: size.thumb, borderRadius: radius.thumb, overflow: 'hidden', backgroundColor: colour.Shimmer },
})
