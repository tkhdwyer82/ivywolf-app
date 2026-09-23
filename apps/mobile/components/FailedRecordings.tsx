// apps/mobile/components/FailedRecordings.tsx
// Recordings Ivy couldn't process — an error, or swept after timing out (0020). Each says so plainly and offers
// Retry or Delete; nothing on Home ever spins forever.

import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { hero, text } from '@/lib/theme'
import type { FailedRecording } from '@/lib/home'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const when = (iso: string) => {
  const d = new Date(iso)
  return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const length = (ms: number | null) => {
  if (!ms) return null
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function FailedRecordings({
  items,
  onRetry,
  onDelete,
}: {
  items: FailedRecording[]
  onRetry: (r: FailedRecording) => Promise<void>
  onDelete: (r: FailedRecording) => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }
  if (!items.length) return null
  return (
    <View style={styles.list}>
      {items.map((r) => (
        <View key={r.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={text.bodyMedium}>Ivy couldn’t process this one</Text>
            <Text style={[text.caption, styles.secondary]}>{[when(r.received_at), length(r.duration_ms)].filter(Boolean).join(' · ')}</Text>
          </View>
          {busy === r.id ? (
            <ActivityIndicator color={hero.ink} />
          ) : (
            <>
              <Pressable onPress={() => act(r.id, () => onRetry(r))} style={styles.retry} accessibilityRole="button" accessibilityLabel="Retry">
                <Text style={styles.retryLabel}>Retry</Text>
              </Pressable>
              <Pressable onPress={() => act(r.id, () => onDelete(r))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete">
                <Text style={[text.bodySmall, styles.secondary]}>Delete</Text>
              </Pressable>
            </>
          )}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 8, paddingHorizontal: 20, paddingTop: 12, width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, backgroundColor: hero.fill },
  secondary: { color: hero.secondary },
  retry: { backgroundColor: hero.lime, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  retryLabel: { fontSize: 13, fontWeight: '600', color: hero.ink },
})
