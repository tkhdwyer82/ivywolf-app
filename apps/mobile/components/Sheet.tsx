// apps/mobile/components/Sheet.tsx
// A bottom sheet over a grey scrim (Figma 1459:207 Share, 1461:2 Add context, 1453:106 voice, S6 227:594): white,
// radius 28 at the top, a grabber, a centred title. Tap the scrim to close.

import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colour, space } from '@ivywolf/ui'

export function Sheet({ title, subtitle, onClose, children }: { title?: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.stack) }]}>
          <View style={styles.grabber} />
          {title && (
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
          )}
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/** "SEND TO", "ALREADY ATTACHED" — the sheet's section overline. */
export function SheetSection({ label }: { label: string }) {
  return <Text style={styles.section}>{label}</Text>
}
export function SheetRule() {
  return <View style={styles.rule} />
}

// Figma 1459:207 — measured: sheet radius 28, grabber 36 × 5 at 8 from the top; title Semibold 18; sections
// Semibold 13 grey, 24 in; rules hairline #E6E6E6.
const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.28)' },
  sheet: { backgroundColor: colour.Surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8, paddingHorizontal: 24 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: '#E0E0E0', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '600', color: colour.Ink, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colour.Grey, textAlign: 'center', marginTop: 4 },
  section: { fontSize: 13, fontWeight: '600', color: colour.Grey, marginTop: 22, marginBottom: 12 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: '#E6E6E6', marginTop: 20 },
})
