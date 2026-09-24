// apps/mobile/components/PinChrome.tsx
// The pin page's chrome, shared by Idea (P9) and To-do (P17): the glass buttons on the visual and the ••• menu (P6).

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { hero } from '@/lib/theme'

/** The ••• menu (P6): a 240-pt card at the top right over a light scrim. */
export function Menu({
  top,
  items,
  onClose,
}: {
  top: number
  items: { icon: SFSymbol; label: string; onPress: () => void; destructive?: boolean }[]
  onClose: () => void
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, styles.menuScrim]} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.menu, { top }]}>
        {items.map((it) => (
          <View key={it.label}>
            {it.destructive && <View style={styles.menuRule} />}
            <Pressable
              onPress={() => {
                onClose()
                it.onPress()
              }}
              style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.5 }]}
              accessibilityRole="menuitem"
            >
              <SymbolView name={it.icon} tintColor={it.destructive ? DESTRUCTIVE : hero.ink} size={20} />
              <Text style={[styles.menuLabel, it.destructive && { color: DESTRUCTIVE }]}>{it.label}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  )
}

export const DESTRUCTIVE = '#E54033'

export function Glass({ icon, label, onPress, style }: { icon: SFSymbol; label: string; onPress: () => void; style: object }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.glass, style]}>
      <SymbolView name={icon} tintColor={hero.ink} size={18} weight="semibold" />
    </Pressable>
  )
}

// Figma 83:201 — glass 44 × 44 radius 14; menu 240 wide, radius 24, rows 48.
const styles = StyleSheet.create({
  glass: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuScrim: { backgroundColor: 'rgba(250,250,247,0.55)' },
  menu: {
    position: 'absolute',
    right: 20,
    width: 240,
    borderRadius: 24,
    backgroundColor: hero.room,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48, paddingHorizontal: 22 },
  menuLabel: { fontSize: 17, color: hero.ink },
  menuRule: { height: StyleSheet.hairlineWidth, backgroundColor: '#E6E6E6', marginHorizontal: 20, marginVertical: 8 },
})
