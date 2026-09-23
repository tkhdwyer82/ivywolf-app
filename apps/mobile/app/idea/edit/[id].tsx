// apps/mobile/app/idea/edit/[id].tsx
// Edit idea (from the ••• menu, P6): the heading and the gist, as she'd put them.

import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSupabase } from '@/lib/supabase'
import { hero, text } from '@/lib/theme'

export default function EditIdea() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const [title, setTitle] = useState<string | null>(null)
  const [gist, setGist] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('cards')
      .select('title, gist')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return setError(error?.message ?? 'This idea has gone.')
        setTitle(data.title)
        setGist(data.gist)
      })
  }, [supabase, id])

  async function save() {
    if (!title?.trim()) return setError('An idea needs a heading.')
    setSaving(true)
    const { error } = await supabase.from('cards').update({ title: title.trim(), gist: gist.trim() }).eq('id', id)
    setSaving(false)
    if (error) return setError(error.message)
    router.back()
  }

  if (title === null) {
    return <View style={styles.centered}>{error ? <Text style={text.body}>{error}</Text> : <ActivityIndicator color={hero.ink} />}</View>
  }
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={text.body}>Cancel</Text>
        </Pressable>
        <Text style={text.headingSmall}>Edit idea</Text>
        <Pressable onPress={save} disabled={saving} hitSlop={10}>
          <Text style={[text.body, { fontWeight: '600' }]}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
      <TextInput value={title} onChangeText={setTitle} style={styles.title} multiline placeholder="Heading" autoFocus />
      <TextInput value={gist} onChangeText={setGist} style={styles.gist} multiline placeholder="What it is, in a line" />
      {error && <Text style={[text.caption, { color: hero.secondary }]}>{error}</Text>}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room, paddingHorizontal: 20, paddingTop: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: hero.room },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: hero.ink, marginBottom: 12 },
  gist: { fontSize: 15, lineHeight: 21, color: hero.ink, marginBottom: 12 },
})
