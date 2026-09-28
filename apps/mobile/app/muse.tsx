// apps/mobile/app/muse.tsx
// Connect your Muse (Job F §4), opened from Connect. Makes a key for the Muse connector, shows the endpoint and the
// key once with copy buttons, says how to add it to Muse, and lists her keys with Revoke.
//
// Muse is a window onto her ideas, never the front door: it can read them and, if she lets it, add new ones. The two
// switches are the two scopes, in the consent words. Reading is what the connector is for, so it's always on.

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native'
import { useAuth } from '@clerk/clerk-expo'
import { listMuseKeys, makeMuseKey, revokeMuseKey, SCOPE_WORDS, type MuseKey, type MuseScope } from '@/lib/muse'
import { hero, text } from '@/lib/theme'

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function ConnectMuse() {
  const { getToken } = useAuth()
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [keys, setKeys] = useState<MuseKey[] | null>(null)
  const [capture, setCapture] = useState(true)
  const [fresh, setFresh] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) throw new Error('Sign in again to connect Muse.')
      const r = await listMuseKeys(token)
      setEndpoint(r.endpoint)
      setKeys(r.keys)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load your keys')
    }
  }, [getToken])

  useEffect(() => {
    load()
  }, [load])

  async function make() {
    setBusy(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) throw new Error('Sign in again to connect Muse.')
      const scopes: MuseScope[] = capture ? ['ideas:read', 'ideas:capture'] : ['ideas:read']
      const made = await makeMuseKey(token, scopes)
      setFresh(made.key)
      setEndpoint(made.endpoint)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t make a key')
    } finally {
      setBusy(false)
    }
  }

  function revoke(k: MuseKey) {
    Alert.alert('Revoke this key?', 'Muse stops reaching your ideas with it straight away. This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await getToken()
            if (!token) throw new Error('Sign in again to revoke.')
            await revokeMuseKey(token, k.id)
            await load()
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Couldn’t revoke the key')
          }
        },
      },
    ])
  }

  if (!keys) {
    return <View style={styles.centered}>{error ? <Text style={text.body}>{error}</Text> : <ActivityIndicator color={hero.ink} />}</View>
  }

  const live = keys.filter((k) => !k.revoked_at)
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <Text style={text.titleSection}>Ask your Muse about your ideas</Text>
      <Text style={[text.body, styles.secondary]}>
        “What did I keep coming back to this month?” Muse answers from your ideas in Ivy, with a link back to each one. It
        can’t change, move or delete anything.
      </Text>

      <View style={styles.group}>
        <View style={styles.row}>
          <Text style={[text.body, styles.flex]}>{SCOPE_WORDS['ideas:read']}</Text>
          <Switch value disabled trackColor={{ true: hero.lime, false: '#D9D9DE' }} accessibilityLabel={SCOPE_WORDS['ideas:read']} />
        </View>
        <View style={styles.hairline} />
        <View style={styles.row}>
          <Text style={[text.body, styles.flex]}>{SCOPE_WORDS['ideas:capture']}</Text>
          <Switch
            value={capture}
            onValueChange={setCapture}
            trackColor={{ true: hero.lime, false: '#D9D9DE' }}
            ios_backgroundColor="#D9D9DE"
            accessibilityLabel={SCOPE_WORDS['ideas:capture']}
          />
        </View>
      </View>

      <Pressable onPress={make} disabled={busy} style={[styles.cta, busy && styles.dim]} accessibilityRole="button">
        <Text style={styles.ctaText}>{busy ? 'Making your key…' : 'Make a key for Muse'}</Text>
      </Pressable>
      {error && <Text style={[text.bodySmall, styles.error]}>{error}</Text>}

      {fresh && endpoint && (
        <View style={styles.group}>
          <Text style={text.labelOverline}>Add to Muse</Text>
          <Text style={[text.bodySmall, styles.secondary]}>
            In Muse, add a custom connector. Paste the server address, then paste the key where Muse asks for an API key.
            This is the only time Ivy shows the key.
          </Text>
          <Copyable label="Server address" value={endpoint} />
          <Copyable label="Key" value={fresh} />
        </View>
      )}

      {live.length > 0 && (
        <View style={styles.group}>
          <Text style={text.labelOverline}>Your keys</Text>
          {live.map((k) => (
            <View key={k.id} style={styles.row}>
              <View style={styles.flex}>
                <Text style={text.bodyMedium}>{k.label} · made {day(k.created_at)}</Text>
                <Text style={[text.caption, styles.secondary]}>
                  {k.scopes.includes('ideas:capture') ? 'Reads and adds ideas' : 'Reads ideas'} ·{' '}
                  {k.last_used_at ? `last used ${day(k.last_used_at)}` : 'not used yet'}
                </Text>
              </View>
              <Pressable onPress={() => revoke(k)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Revoke ${k.label}`}>
                <Text style={[text.bodyMedium, styles.error]}>Revoke</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      // Loaded on use: builds made before expo-clipboard was added don't have its native module.
      const Clipboard = await import('expo-clipboard')
      await Clipboard.setStringAsync(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      await Share.share({ message: value })
    }
  }
  return (
    <View style={styles.copyRow}>
      <View style={styles.flex}>
        <Text style={[text.caption, styles.secondary]}>{label}</Text>
        <Text style={text.bodySmall} numberOfLines={1} ellipsizeMode="middle" selectable>
          {value}
        </Text>
      </View>
      <Pressable onPress={copy} style={styles.copy} accessibilityRole="button" accessibilityLabel={`Copy ${label}`}>
        <Text style={text.bodyMedium}>{copied ? 'Copied' : 'Copy'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: hero.room },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: hero.room, padding: 20 },
  body: { padding: 20, gap: 16, paddingBottom: 48 },
  secondary: { color: hero.secondary },
  error: { color: '#C2410C' },
  flex: { flex: 1 },
  group: { backgroundColor: hero.fill, borderRadius: 16, padding: 14, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: hero.hairline },
  cta: { backgroundColor: hero.ink, borderRadius: 26, height: 52, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...text.headingSmall, color: '#FFFFFF' },
  dim: { opacity: 0.6 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: hero.room, borderRadius: 12, padding: 10 },
  copy: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: hero.lime },
})
