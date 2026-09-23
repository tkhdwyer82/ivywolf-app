// apps/mobile/app/connections.tsx
// Connect, from Add to ideas (P2): the connections catalogue (0013), read-only for now. Each tool is shown by its
// verb (rule 4 — verbs, not tools); connecting comes with P15/P16, once they have images.

import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSupabase } from '@/lib/supabase'
import { hero, text } from '@/lib/theme'

interface Connection {
  slug: string
  name: string
  verb_line: string
  tile_url: string | null
}

export default function Connections() {
  const supabase = useSupabase()
  const [rows, setRows] = useState<Connection[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('connections')
      .select('slug, name, verb_line, tile_url')
      .order('sort_weight', { ascending: false })
      .then(({ data, error }) => (error ? setError(error.message) : setRows(data as Connection[])))
  }, [supabase])

  if (!rows) {
    return <View style={styles.centered}>{error ? <Text style={text.body}>{error}</Text> : <ActivityIndicator color={hero.ink} />}</View>
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.list}>
      <Text style={[text.bodySmall, styles.secondary]}>Tools Ivy can hand your ideas to. Connecting them comes next.</Text>
      {rows.map((c) => (
        <View key={c.slug} style={styles.row}>
          <View style={styles.tile}>
            {c.tile_url ? <Image source={{ uri: c.tile_url }} style={StyleSheet.absoluteFill} /> : <Text style={styles.initial}>{c.name[0]}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={text.headingSmall}>{c.verb_line}</Text>
            <Text style={[text.caption, styles.secondary]}>via {c.name}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: hero.room },
  list: { padding: 20, gap: 16 },
  secondary: { color: hero.secondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tile: { width: 56, height: 56, borderRadius: 16, backgroundColor: hero.fill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 22, fontWeight: '600', color: hero.ink },
})
