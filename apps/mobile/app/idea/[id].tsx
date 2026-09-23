// apps/mobile/app/idea/[id].tsx
// Idea (P9, the pin page). The visual on top — her frame, her imported picture, or the title set in the palette —
// with back and •••; the summary is the heading (the transcript is behind •••, P6/P7); heart · mic · share; the dark
// project button (⌄ = save it elsewhere, P10); the byline (who · when · where in the recording, tap to hear it);
// and More in this thread.
// The mic is the voice correction: Record, tagged to this card (a stub in the pipeline for now).
// No verbs here yet: a verb appears only once the idea has earned it (P13, Later row).

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useAudioPlayer } from 'expo-audio'
import { useUser } from '@clerk/clerk-expo'
import { LOW_CONFIDENCE } from '@ivywolf/schema'
import { useSupabase } from '@/lib/supabase'
import { byline, loadIdea, setHeart, type Idea } from '@/lib/idea'
import { deleteCard } from '@/lib/deleteRecording'
import { hero, text } from '@/lib/theme'

export default function IdeaPage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const { user } = useUser()
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
  useEffect(() => () => player.pause(), [player])

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
          <Text style={[text.body, styles.secondary]}>{error ?? 'This idea has gone.'}</Text>
        ) : (
          <ActivityIndicator color={hero.ink} />
        )}
      </View>
    )
  }

  const drawn = idea.frameStatus === 'done' && !!idea.frameUrl
  const unsure = idea.confidence < LOW_CONFIDENCE

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 32 }}>
        <View style={styles.visual}>
          {drawn ? (
            <Image source={{ uri: idea.frameUrl! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={styles.typographic}>
              <Text style={[text.titleScreen, { color: hero.ink }]}>{idea.title}</Text>
            </View>
          )}
          <Glass icon="chevron.left" label="Back" onPress={() => router.back()} style={{ left: 12, top: 12 }} />
          <Glass icon="ellipsis" label="More" onPress={() => setMenu(true)} style={{ right: 12, top: 12 }} />
        </View>

        <View style={styles.body}>
          <Text style={styles.heading}>{idea.title}</Text>
          {!!idea.gist && <Text style={styles.gist}>{idea.gist}</Text>}
          {unsure && <Text style={[text.caption, styles.secondary, { marginTop: 6 }]}>Ivy isn’t sure about this one.</Text>}

          <View style={styles.actions}>
            <Pressable onPress={heart} hitSlop={10} accessibilityRole="button" accessibilityLabel={idea.heartedAt ? 'Unheart' : 'Heart'}>
              <SymbolView name={idea.heartedAt ? 'heart.fill' : 'heart'} tintColor={hero.ink} size={24} />
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/record', params: { correctionOf: idea.id } })}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Correct by voice"
            >
              <SymbolView name="mic" tintColor={hero.ink} size={24} />
            </Pressable>
            <Pressable
              onPress={() => Share.share({ message: idea.gist ? `${idea.title}\n\n${idea.gist}` : idea.title })}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Share"
            >
              <SymbolView name="square.and.arrow.up" tintColor={hero.ink} size={24} />
            </Pressable>

            <View style={styles.project}>
              <Text style={styles.projectName} numberOfLines={1}>
                {idea.project?.name ?? 'My things'}
              </Text>
              <View style={styles.projectRule} />
              <Pressable onPress={() => {}} hitSlop={8} accessibilityRole="button" accessibilityLabel="Save to another project" style={styles.chevron}>
                <SymbolView name="chevron.down" tintColor="#FFFFFF" size={16} weight="semibold" />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={() => play(idea.id, idea.storagePath, idea.playFromMs)}
            style={styles.byline}
            accessibilityRole="button"
            accessibilityLabel={playing === idea.id ? 'Pause' : 'Play from here'}
          >
            <View style={styles.avatar} />
            <Text style={text.bodySmall}>{byline(user?.firstName ?? null, idea)}</Text>
            {playing === idea.id && <SymbolView name="speaker.wave.2" tintColor={hero.secondary} size={14} />}
          </Pressable>

          {idea.siblings.length > 0 && (
            <>
              <Text style={styles.more}>More in this thread</Text>
              <View style={styles.siblings}>
                {idea.siblings.map((s) => (
                  <Pressable key={s.id} onPress={() => router.push(`/idea/${s.id}`)} style={styles.sibling} accessibilityRole="button" accessibilityLabel={s.title}>
                    {s.frameStatus === 'done' && s.frameUrl ? (
                      <Image source={{ uri: s.frameUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : null}
                    <Text style={[styles.siblingTitle, s.frameUrl && styles.siblingTitleOnImage]} numberOfLines={2}>
                      {s.title}
                    </Text>
                    {s.storagePath && (
                      <Pressable onPress={() => play(s.id, s.storagePath, s.playFromMs)} hitSlop={8} style={styles.siblingPlay} accessibilityLabel="Play from here">
                        <SymbolView name={playing === s.id ? 'pause.fill' : 'play.fill'} tintColor={hero.ink} size={13} />
                      </Pressable>
                    )}
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
      {menu && (
        <Menu
          top={insets.top + 10}
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

/** The ••• menu (P6): a 240-pt card at the top right over a light scrim. */
function Menu({
  top,
  items,
  onClose,
}: {
  top: number
  items: { icon: SFSymbol; label: string; onPress: () => void; destructive?: boolean }[]
  onClose: () => void
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, styles.menuScrim]} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.menu, { top }]}>
        {items.map((it) => (
          <View key={it.label}>
            {it.destructive && <View style={styles.menuRule} />}
            <Pressable
              onPress={() => {
                onClose()
                it.onPress()
              }}
              style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.5 }]}
              accessibilityRole="menuitem"
            >
              <SymbolView name={it.icon} tintColor={it.destructive ? DESTRUCTIVE : hero.ink} size={20} />
              <Text style={[styles.menuLabel, it.destructive && { color: DESTRUCTIVE }]}>{it.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  )
}

const DESTRUCTIVE = '#E54033'

function Glass({ icon, label, onPress, style }: { icon: SFSymbol; label: string; onPress: () => void; style: object }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.glass, style]}>
      <SymbolView name={icon} tintColor={hero.ink} size={18} weight="semibold" />
    </Pressable>
  )
}

// Figma 83:201 — visual 377 × 470 at 8 pt margins, radius 28; heading Bold 22; gist Regular 14 secondary; project
// button #333330, 190 × 44, radius 14.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  secondary: { color: hero.secondary },
  visual: { marginHorizontal: 8, height: 470, borderRadius: 28, overflow: 'hidden', backgroundColor: hero.fill },
  typographic: { flex: 1, justifyContent: 'flex-end', padding: 24, borderLeftWidth: 6, borderLeftColor: hero.lime },
  glass: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: 20, paddingTop: 16 },
  heading: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: hero.ink },
  gist: { fontSize: 14, lineHeight: 19, color: hero.secondary, marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 20, paddingLeft: 2 },
  project: {
    marginLeft: 'auto',
    width: 190,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#333330',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  projectName: { flex: 1, paddingLeft: 16, fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  projectRule: { width: StyleSheet.hairlineWidth * 2, height: 44, backgroundColor: 'rgba(255,255,255,0.25)' },
  chevron: { width: 43, height: 44, alignItems: 'center', justifyContent: 'center' },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: hero.lime },
  more: { fontSize: 18, fontWeight: '700', color: hero.ink, marginTop: 28, marginBottom: 12 },
  siblings: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 13 },
  sibling: { width: 170, height: 150, borderRadius: 16, overflow: 'hidden', backgroundColor: hero.fill, justifyContent: 'flex-end', padding: 14 },
  siblingTitle: { fontSize: 13, fontWeight: '600', color: hero.ink },
  siblingTitleOnImage: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  menuScrim: { backgroundColor: 'rgba(250,250,247,0.55)' },
  menu: {
    position: 'absolute',
    right: 20,
    width: 240,
    borderRadius: 24,
    backgroundColor: hero.room,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48, paddingHorizontal: 22 },
  menuLabel: { fontSize: 17, color: hero.ink },
  menuRule: { height: StyleSheet.hairlineWidth, backgroundColor: '#E6E6E6', marginHorizontal: 20, marginVertical: 8 },
  siblingPlay: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
