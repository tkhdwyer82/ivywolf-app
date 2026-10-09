// apps/mobile/app/connections.tsx
// Connect, from Add to ideas (P2): the connections catalogue (0013), read-only for now. Each tool is shown by its
// verb (rule 4 — verbs, not tools); connecting comes with P15/P16, once they have images.
// Muse sits first and apart: it's the one connection that runs the other way — Muse asks Ivy (Job F).
// Pinterest sits with it (Job H.0c): Ivy reads her own pins as references, live, and keeps only the token. "Connect
// Pinterest · coming soon" until the server has the app secret; Disconnect deletes the token and the connection.

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'
import { PINTEREST } from '@ivywolf/schema'
import { connectPinterest, disconnectPinterest, pinterestStatus, type PinterestStatus } from '@/lib/pinterest'
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
      .neq('slug', PINTEREST) // not a tool Ivy hands ideas to: it has its own row above
      .order('sort_weight', { ascending: false })
      .then(({ data, error }) => (error ? setError(error.message) : setRows(data as Connection[])))
  }, [supabase])

  if (!rows) {
    return <View style={styles.centered}>{error ? <Text style={text.body}>{error}</Text> : <ActivityIndicator color={hero.ink} />}</View>
  }
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.list}>
      <Pressable onPress={() => router.push('/muse')} style={styles.row} accessibilityRole="button">
        <View style={styles.tile}>
          <Text style={styles.initial}>M</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={text.headingSmall}>Connect your Muse</Text>
          <Text style={[text.caption, styles.secondary]}>ask your Muse about your ideas</Text>
        </View>
      </Pressable>
      <PinterestRow />
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

/** Connect Pinterest · Connect / Disconnect, or "coming soon" while the server has no app secret. */
function PinterestRow() {
  const { getToken } = useAuth()
  const [status, setStatus] = useState<PinterestStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    setStatus(await pinterestStatus(token).catch(() => ({ available: false, connected: false })))
    // getToken is a new function every render (Clerk): never key this on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])

  async function toggle() {
    const token = await getToken()
    if (!token || !status) return
    setBusy(true)
    try {
      if (status.connected) await disconnectPinterest(token)
      else {
        const outcome = await connectPinterest(token)
        if (outcome === 'error') Alert.alert('Pinterest didn’t connect', 'Try again in a moment.')
      }
    } catch (e) {
      Alert.alert(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const soon = status !== null && !status.available
  const action = status?.connected ? 'Disconnect' : 'Connect'
  return (
    <View style={styles.row}>
      <View style={styles.tile}>
        <Text style={styles.initial}>P</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={text.headingSmall}>{soon ? 'Connect Pinterest · coming soon' : status?.connected ? 'Pinterest connected' : 'Connect Pinterest'}</Text>
        <Text style={[text.caption, styles.secondary]}>Your boards, beside your ideas</Text>
      </View>
      {status && !soon && (
        <Pressable onPress={toggle} disabled={busy} style={styles.action} accessibilityRole="button" accessibilityLabel={`${action} Pinterest`}>
          {busy ? <ActivityIndicator color={hero.ink} /> : <Text style={text.headingSmall}>{action}</Text>}
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  action: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: hero.fill },
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: hero.room },
  list: { padding: 20, gap: 16 },
  secondary: { color: hero.secondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tile: { width: 56, height: 56, borderRadius: 16, backgroundColor: hero.fill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 22, fontWeight: '600', color: hero.ink },
})
