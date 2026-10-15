// apps/mobile/components/UndoPill.tsx
// The pill on the nav row, one component for three moments:
// - "Writing it up… · Undo" (Job B.3, Figma 1787:142 in D2): on Home for 6 s once a voice take is saved and Home is
//   back. Undo discards the take — stamps it, which stops the pipeline, then deletes the recording and anything
//   already derived from it (lib/discard.ts). If the delete fails it says so.
// - "Nothing saved" (B.3.1): grey, no action, 2 s after × closes a take with no speech in it.
// - "Done · Undo" (My things M3, 1797:97): the screen renders <Pill> itself (lib/ticks.ts).

import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated'
import { size } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import { discardRecording } from '@/lib/deleteRecording'
import { justRecorded, notice, onJustRecorded, onNotice, setJustRecorded, undoLeft, type JustRecorded, type Notice } from '@/lib/discard'
import { hero } from '@/lib/theme'
import { BAR_BOTTOM } from '@/components/ActionBar'

/** The pill itself: ink with a white action chip, or grey with no action. */
export function Pill({ label, action, onAction, actionLabel, testID, tone = 'ink' }: {
  label: string
  action?: string
  onAction?: () => void
  /** VoiceOver's name for the action ("Undo, discard this recording"). */
  actionLabel?: string
  testID?: string
  tone?: 'ink' | 'grey'
}) {
  return (
    <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(160)} style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.pill, tone === 'grey' ? styles.grey : styles.ink, !action && styles.plain]} accessibilityLiveRegion="polite">
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {action && (
          <Pressable onPress={onAction} hitSlop={12} testID={testID} accessibilityRole="button" accessibilityLabel={actionLabel ?? action} style={styles.action}>
            <Text style={styles.actionText}>{action}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  )
}

/** Home's pill: Undo for a take just saved, or "Nothing saved" after a silent ×. */
export function UndoPill({ onUndone }: { onUndone: () => void }) {
  const supabase = useSupabase()
  const [take, setTake] = useState<JustRecorded | null>(() => (undoLeft(justRecorded(), Date.now()) > 0 ? justRecorded() : null))
  const [note, setNote] = useState<Notice | null>(() => live(notice()))
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => onJustRecorded((j) => setTake(undoLeft(j, Date.now()) > 0 ? j : null)), [])
  useEffect(() => onNotice((n) => setNote(live(n))), [])
  useEffect(() => {
    if (!take) return
    const t = setTimeout(() => setJustRecorded(null), undoLeft(take, Date.now()))
    return () => clearTimeout(t)
  }, [take])
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), note.until - Date.now())
    return () => clearTimeout(t)
  }, [note])
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

  if (failed) return <Pill label={failed} />
  if (take) return <Pill label="Writing it up…" action="Undo" onAction={undo} actionLabel="Undo, discard this recording" testID="undo-take" />
  if (note) return <Pill label={note.label} tone="grey" />
  return null
}

const live = (n: Notice | null) => (n && n.until > Date.now() ? n : null)

// Figma D2: 44 high, radius 22, ink; the label Regular 14 white, 14 to a white action chip (radius 14, 12 × 6,
// Semibold 13 ink); 16 in on the left, 8 on the right. Without an action it's 16 both sides; the notice is grey.
// Its bottom sits on the nav row's top (Nav.tsx).
const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', bottom: BAR_BOTTOM + (size['bar-h'] - size.nav) / 2 + size.nav },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 44, paddingLeft: 16, paddingRight: 8, borderRadius: 22, maxWidth: 340 },
  ink: { backgroundColor: hero.ink },
  grey: { backgroundColor: hero.secondary },
  plain: { paddingRight: 16 },
  label: { fontSize: 14, color: '#FFFFFF', flexShrink: 1 },
  action: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  actionText: { fontSize: 13, fontWeight: '600', color: hero.ink },
})
