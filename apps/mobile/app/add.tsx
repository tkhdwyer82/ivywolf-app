// apps/mobile/app/add.tsx
// Add to ideas (P2) — Home's + only; the ⊕ never opens a menu. A sheet over a 50 % ink scrim with options that
// scroll sideways: Image · Video · Connect · File.
//   Image / Video — pick from the library, upload, then Record asks what it's for (lib/imports.ts).
//   Connect — the connections list, read-only for now.
//   File — not yet.

import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { useAuth } from '@clerk/clerk-expo'
import { useSupabase } from '@/lib/supabase'
import { pickImport } from '@/lib/imports'
import { hero, text } from '@/lib/theme'

const OPTIONS: { key: 'image' | 'video' | 'connect' | 'file'; label: string; line: string; icon: SFSymbol }[] = [
  { key: 'image', label: 'Image', line: 'a reference, a product shot, a screenshot', icon: 'photo' },
  { key: 'video', label: 'Video', line: 'a saved Reel, a clip from your camera roll', icon: 'video' },
  { key: 'connect', label: 'Connect', line: 'Higgsfield, Canva, ClickUp — as verbs on your ideas', icon: 'link' },
  { key: 'file', label: 'File', line: 'a doc, a brief, a transcript', icon: 'doc' },
]

const TILE = 104
const PITCH = 118 // 104 tile + 14 gap (Figma 24 → 142 → 260 → 378)

export default function AddToIdeas() {
  const insets = useSafeAreaInsets()
  const supabase = useSupabase()
  const { userId } = useAuth()
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  async function choose(key: (typeof OPTIONS)[number]['key']) {
    setNote(null)
    if (key === 'connect') return router.replace('/connections')
    if (key === 'file') return setNote('Files are coming — for now, add an image or a video.')
    if (!userId) return
    setBusy(key)
    try {
      const picked = await pickImport(supabase, userId, key)
      if (!picked) return setBusy(null)
      router.replace({ pathname: '/record', params: { importKind: picked.kind, original: picked.original_path, poster: picked.poster_path } })
    } catch (e) {
      setBusy(null)
      setNote(e instanceof Error ? e.message : 'That didn’t upload.')
    }
  }

  return (
    <View style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
            <SymbolView name="xmark" tintColor={hero.ink} size={18} weight="medium" />
          </Pressable>
          <Text style={text.headingSmall}>Add to ideas</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.options}
          snapToInterval={PITCH}
          decelerationRate="fast"
          scrollEventThrottle={32}
          onScroll={(e) => setPage(e.nativeEvent.contentOffset.x > PITCH ? 1 : 0)}
        >
          {OPTIONS.map((o) => (
            <Pressable key={o.key} onPress={() => choose(o.key)} disabled={!!busy} accessibilityRole="button" accessibilityLabel={o.label} style={styles.option}>
              <View style={styles.tile}>
                {busy === o.key ? <ActivityIndicator color={hero.ink} /> : <SymbolView name={o.icon} tintColor={hero.ink} size={30} />}
              </View>
              <Text style={styles.label}>{o.label}</Text>
              <Text style={styles.line}>{o.line}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {note ? (
          <Text style={[text.caption, styles.note]}>{note}</Text>
        ) : (
          <View style={styles.dots}>
            <View style={[styles.dot, page === 0 && styles.dotOn]} />
            <View style={[styles.dot, page === 1 && styles.dotOn]} />
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(29,29,31,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: hero.room, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 28 },
  header: { height: 22, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', left: 22 },
  options: { paddingHorizontal: 24, paddingTop: 30, gap: PITCH - TILE },
  option: { width: TILE, alignItems: 'center' },
  tile: { width: TILE, height: TILE, borderRadius: 24, backgroundColor: hero.fill, alignItems: 'center', justifyContent: 'center' },
  // Figma: Semibold 14 label; Regular 10.5 secondary line, 120 wide.
  label: { fontSize: 14, fontWeight: '600', color: hero.ink, marginTop: 10 },
  line: { fontSize: 10.5, lineHeight: 13, color: hero.secondary, textAlign: 'center', width: 120, marginTop: 4 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: hero.hairline },
  dotOn: { backgroundColor: hero.ink },
  note: { color: hero.secondary, textAlign: 'center', marginTop: 12, paddingHorizontal: 24 },
})
