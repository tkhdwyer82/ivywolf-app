// apps/mobile/app/(tabs)/notes.tsx
// Profile = Voice notes: every recording, grouped by the day it was recorded, newest first.

import { useCallback, useState } from 'react'
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native'
import { Link, useFocusEffect } from 'expo-router'
import type { RecordingRow } from '@ivywolf/schema'
import { useSupabase } from '@/lib/supabase'
import { color, space, type } from '@/lib/theme'

type Section = { title: string; data: RecordingRow[] }

export default function Notes() {
  const supabase = useSupabase()
  const [sections, setSections] = useState<Section[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    // transcript is only selected as a processed/not-processed signal; `transcript->0` keeps the payload small.
    const { data, error } = await supabase
      .from('recordings')
      .select('id, source, duration_ms, recorded_at, received_at, title, is_junk, junk_reason, transcript:transcript->0')
      .order('received_at', { ascending: false })
      .limit(200)
    if (error) {
      setError(error.message)
      return
    }
    setError(null)
    const byDay = new Map<string, RecordingRow[]>()
    for (const r of data as RecordingRow[]) {
      const day = dayLabel(r.recorded_at ?? r.received_at)
      byDay.set(day, [...(byDay.get(day) ?? []), r])
    }
    setSections([...byDay].map(([title, rows]) => ({ title, data: rows })))
  }, [supabase])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <SectionList
      sections={sections ?? []}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      ListEmptyComponent={
        sections !== null ? (
          <View style={styles.empty}>
            <Text style={type.body}>No voice notes yet.</Text>
            <Link href="/record" style={styles.link}>
              Record one
            </Link>
          </View>
        ) : null
      }
      renderSectionHeader={({ section }) => <Text style={[type.meta, styles.day]}>{section.title}</Text>}
      renderItem={({ item }) => (
        <View style={[styles.row, item.is_junk && { opacity: 0.5 }]}>
          <Text style={type.heading} numberOfLines={1}>
            {item.title ?? (item.is_junk ? 'Nothing kept' : item.transcript === null ? 'Ivy is listening…' : 'Untitled')}
          </Text>
          <Text style={type.meta}>
            {timeLabel(item.recorded_at ?? item.received_at)}
            {item.duration_ms ? ` · ${Math.round(item.duration_ms / 1000)} s` : ''}
            {item.is_junk ? ` · ${item.junk_reason === 'too_short' ? 'too short' : 'no speech'}` : ''}
          </Text>
        </View>
      )}
    />
  )
}

function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

const styles = StyleSheet.create({
  list: { padding: space.l, gap: space.s },
  day: { textTransform: 'uppercase', letterSpacing: 0.6, marginTop: space.l, marginBottom: space.xs },
  row: {
    backgroundColor: color.card,
    borderRadius: 12,
    padding: space.l,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  error: { color: color.accent },
  empty: { paddingTop: space.xxl, alignItems: 'center', gap: space.s },
  link: { color: color.accent, fontSize: 15, fontWeight: '600' },
})
