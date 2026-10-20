// apps/mobile/components/PasteReelSheet.tsx
// "Paste a reel link" (Job B.10): door 1 until the share extension routes here (B.7 §4). An Instagram reel, a TikTok
// or a YouTube Short, plus — optional — its caption, the way the share sheet would hand it over. Turn into a recipe →
// POST /api/recipes/extract with the lens's rainbow sweep while it runs; a draft lands on its recipe page, private to
// her. Fewer than 3 steps → it says so and the link is saved as an idea instead. Free: nothing here spends credits.
// An Instagram link carries no handle, so the sheet asks for "Their @handle" — the credit — before anything runs; for
// any other link it asks only if the server couldn't find one (need_handle).

import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'
import * as Haptics from 'expo-haptics'
import { parseReelLink } from '@ivywolf/schema'
import { colour, radius } from '@ivywolf/ui'
import { extract } from '@/lib/recipes'
import { Sheet } from '@/components/Sheet'
import { RainbowSweep } from '@/components/RainbowSweep'

export function PasteReelSheet({ onClose }: { onClose: () => void }) {
  const { getToken } = useAuth()
  const [url, setUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [handle, setHandle] = useState('')
  const [askHandle, setAskHandle] = useState(false)
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState<{ text: string; cardId: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const link = parseReelLink(url)
  const needsHandle = !!link && link.handle === null && (link.platform === 'instagram' || askHandle)
  const valid = !!link && (!needsHandle || /^@?[\w.]{1,30}$/.test(handle.trim()))

  async function go() {
    if (!valid || running) return
    setRunning(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Sign in again to do that')
      const r = await extract(token, url.trim(), caption, needsHandle ? handle : undefined)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      if (r.kind === 'need_handle') {
        setAskHandle(true)
        setError(r.message)
      } else if (r.kind === 'recipe') {
        onClose()
        router.push({ pathname: '/recipe/[id]', params: { id: r.recipe_id } })
      } else setNote({ text: r.message, cardId: r.card_id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work — try again')
    } finally {
      setRunning(false)
    }
  }

  if (note) {
    return (
      <Sheet title="Not a recipe" onClose={onClose}>
        <Text style={styles.line}>{note.text}.</Text>
        <View style={styles.row}>
          {note.cardId && (
            <Pressable
              onPress={() => {
                onClose()
                router.push(`/idea/${note.cardId}`)
              }}
              style={[styles.button, styles.soft]}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Open idea</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} style={[styles.button, styles.lime]} accessibilityRole="button">
            <Text style={styles.buttonText}>OK</Text>
          </Pressable>
        </View>
      </Sheet>
    )
  }

  return (
    <Sheet title="Paste a reel link" subtitle="Instagram reel, TikTok or YouTube Short" onClose={running ? () => {} : onClose}>
      <RainbowSweep active={running} style={styles.fieldWrap} r={radius.thumb}>
        <View style={styles.field}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://"
            placeholderTextColor={colour.Grey}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!running}
            style={styles.input}
            accessibilityLabel="Reel link"
            testID="paste-reel-url"
          />
          {needsHandle && (
            <TextInput
              value={handle}
              onChangeText={setHandle}
              placeholder="Their @handle"
              placeholderTextColor={colour.Grey}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!running}
              style={styles.input}
              accessibilityLabel="Their handle"
              accessibilityHint="Who made this reel. The recipe is credited to them."
              testID="paste-reel-handle"
            />
          )}
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Its caption, if you have it (optional)"
            placeholderTextColor={colour.Grey}
            multiline
            editable={!running}
            style={[styles.input, styles.caption]}
            accessibilityLabel="Caption"
          />
        </View>
      </RainbowSweep>
      {!!url.trim() && !link && <Text style={styles.hint}>That isn’t a reel, TikTok or Short.</Text>}
      {error && <Text style={styles.hint}>{error}</Text>}
      <Pressable
        onPress={go}
        disabled={!valid || running}
        style={[styles.button, styles.full, running ? styles.ink : styles.lime, !valid && !running && styles.off]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !valid || running, busy: running }}
        testID="paste-reel-go"
      >
        {running ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colour.Surface} />
            <Text style={[styles.buttonText, styles.onInk]}>Reading the steps…</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>Turn into a recipe</Text>
        )}
      </Pressable>
      <Text style={styles.small}>We keep the steps and the credit, never the video. Private to you.</Text>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  fieldWrap: { marginTop: 18 },
  field: { backgroundColor: colour.Chip, borderRadius: radius.thumb, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  input: { fontSize: 15, color: colour.Ink, paddingVertical: 6 },
  caption: { minHeight: 64, textAlignVertical: 'top' },
  hint: { fontSize: 13, color: colour.Grey, marginTop: 8 },
  line: { fontSize: 15, lineHeight: 21, color: colour.Ink, textAlign: 'center', marginTop: 14 },
  row: { flexDirection: 'row', gap: 10, marginTop: 20 },
  button: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  full: { flex: 0, marginTop: 16 },
  lime: { backgroundColor: colour.Lime },
  ink: { backgroundColor: colour.Ink },
  soft: { backgroundColor: colour.Chip },
  off: { opacity: 0.4 },
  buttonText: { fontSize: 15, fontWeight: '600', color: colour.Ink },
  onInk: { color: colour.Surface },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  small: { fontSize: 12, color: colour.Grey, textAlign: 'center', marginTop: 10 },
})
