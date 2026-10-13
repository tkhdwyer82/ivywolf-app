// apps/mobile/components/UndoPill.tsx
// "Writing it up · Undo" (Job B.3): on Home for 6 s once a voice take is saved and Home is back, just above the nav. Undo discards
// the take — stamps it, which stops the pipeline, then deletes the recording and anything already derived from it
// (lib/discard.ts). The pill goes as soon as Undo is tapped; if the delete fails it says so.

import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { size } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import { discardRecording } from '@/lib/deleteRecording'
import { justRecorded, onJustRecorded, setJustRecorded, undoLeft, type JustRecorded } from '@/lib/discard'
import { hero } from '@/lib/theme'
import { BAR_BOTTOM } from '@/components/ActionBar'

export function UndoPill({ onUndone }: { onUndone: () => void }) {
  const supabase = useSupabase()
  const [take, setTake] = useState<JustRecorded | null>(() => (undoLeft(justRecorded(), Date.now()) > 0 ? justRecorded() : null))
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => onJustRecorded((j) => setTake(undoLeft(j, Date.now()) > 0 ? j : null)), [])
  useEffect(() => {
    if (!take) return
    const t = setTimeout(() => setJustRecorded(null), undoLeft(take, Date.now()))
    return () => clearTimeout(t)
  }, [take])
  useEffect(() => {
    if (!failed) return
    const t = setTimeout(() => setFailed(null), 3000)
    return () => clearTimeout(t)
  }, [failed])

  async function undo() {
    if (!take) return
    setJustRecorded(null)
    try {
      await discardRecording(supabase, { id: take.recordingId, storage_path: take.storagePath })
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That didn’t undo')
    }
    onUndone()
  }

  if (!take && !failed) return null
  return (
    <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(160)} style={styles.wrap} pointerEvents="box-none">
      <View style={styles.pill}>
        {failed ? (
          <Text style={styles.label} numberOfLines={1}>
            {failed}
          </Text>
        ) : (
          <>
            <Text style={styles.label}>Writing it up</Text>
            <Text style={styles.dot}>·</Text>
            <Pressable onPress={undo} hitSlop={12} testID="undo-take" accessibilityRole="button" accessibilityLabel="Undo, discard this recording">
              <Text style={styles.undo}>Undo</Text>
            </Pressable>
          </>
        )}
      </View>
    </Animated.View>
  )
}

// Sits 12 above the nav pill row (Nav.tsx: BAR_BOTTOM + (bar-h − nav) / 2, nav tall).
const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', bottom: BAR_BOTTOM + (size['bar-h'] - size.nav) / 2 + size.nav + 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: hero.ink,
    maxWidth: 340,
  },
  label: { fontSize: 15, fontWeight: '500', color: '#FFFFFF' },
  dot: { fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  undo: { fontSize: 15, fontWeight: '600', color: hero.lime },
})
