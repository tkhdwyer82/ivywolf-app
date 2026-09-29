// apps/mobile/components/Nav.tsx
// The nav trio (L3b, Figma 209:31): Home · ⊕ · Mini in one white pill, bar-h tall and fully round. Home and Mini
// are rooms — SF Symbols, filled when selected (house / house.fill, rectangle.portrait / .fill). The ⊕ is an action,
// not a room: a lime disc (size/nav) with the mic that never shows a selected state, only the listening halo.
// Tap ⊕ = mic. Long-press ⊕ = Talk / Import / Project (rule 1). Search lives in the header, never here.

import { useEffect, useRef } from 'react'
import { ActionSheetIOS, Alert, Animated, Easing, Pressable, StyleSheet, View } from 'react-native'
import { SymbolView } from 'expo-symbols'
import { router } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'
import { colour, size } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import { BAR_BOTTOM, FLOAT_SHADOW } from '@/components/ActionBar'

// Figma 209:31 — measured, not tokens: the pill is 220 wide with room glyphs 20 in from its ends; the mic glyph is
// 20; the halo is the disc + 8 all round, lime at 35 %.
const PILL_W = 220
const END_PAD = 20
const MIC = 20
const HALO = 8

export type Room = 'home' | 'mini'

/**
 * @param room     which room is selected
 * @param listening the ⊕'s one state: a lime halo pulses while Ivy is hearing a take through
 * @param onHome   Home tapped (on Home: scroll to top)
 */
export function Nav({ room, listening = false, onHome }: { room: Room; listening?: boolean; onHome?: () => void }) {
  const supabase = useSupabase()
  const { userId } = useAuth()

  const goHome = () => {
    if (room === 'home') return onHome?.()
    router.dismissTo('/')
  }
  const goMini = () => {
    if (room !== 'mini') router.push('/mini')
  }

  const newProject = () =>
    Alert.prompt(
      'New project',
      undefined,
      async (name) => {
        const n = name?.trim()
        if (!n || !userId) return
        const { data, error } = await supabase.from('projects').insert({ creator_id: userId, name: n }).select('id').single()
        if (error) Alert.alert(error.code === '23505' ? `You already have “${n}”.` : 'That project didn’t save')
        else router.push(`/project/${data.id}`)
      },
      'plain-text'
    )

  const menu = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Talk', 'Import', 'Project', 'Cancel'], cancelButtonIndex: 3 },
      (i) => {
        if (i === 0) router.push('/record')
        else if (i === 1) router.push('/add')
        else if (i === 2) newProject()
      }
    )

  return (
    <View style={styles.pill}>
      <Pressable
        onPress={goHome}
        style={styles.room}
        accessibilityRole="tab"
        accessibilityLabel="Home"
        accessibilityState={{ selected: room === 'home' }}
        testID="nav-home"
      >
        <SymbolView name={room === 'home' ? 'house.fill' : 'house'} tintColor={colour.Ink} size={size.icon} />
      </Pressable>
      <View>
        {listening && <Halo />}
        <Pressable
          onPress={() => router.push('/record')}
          onLongPress={menu}
          style={({ pressed }) => [styles.disc, pressed && { transform: [{ scale: 0.96 }] }]}
          accessibilityRole="button"
          accessibilityLabel="Talk"
          accessibilityHint="Hold for Talk, Import or Project"
        >
          <SymbolView name="mic.fill" tintColor={colour.Ink} size={MIC} />
        </Pressable>
      </View>
      <Pressable
        onPress={goMini}
        style={styles.room}
        accessibilityRole="tab"
        accessibilityLabel="Ivy Mini"
        accessibilityState={{ selected: room === 'mini' }}
        testID="nav-mini"
      >
        <SymbolView name={room === 'mini' ? 'rectangle.portrait.fill' : 'rectangle.portrait'} tintColor={colour.Ink} size={size.icon} />
      </Pressable>
    </View>
  )
}

/** The disc + 8 all round, lime at 35 % — pulses rather than sits. */
function Halo() {
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.halo,
        {
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
        },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: BAR_BOTTOM,
    width: PILL_W,
    height: size['bar-h'],
    borderRadius: size['bar-h'] / 2,
    backgroundColor: colour.Surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Room glyphs sit END_PAD in from the ends; their hit areas are size/tap, centred on the glyph.
    paddingHorizontal: END_PAD - (size.tap - size.icon) / 2,
    ...FLOAT_SHADOW,
  },
  room: { width: size.tap, height: size.tap, alignItems: 'center', justifyContent: 'center' },
  disc: {
    width: size.nav,
    height: size.nav,
    borderRadius: size.nav / 2,
    backgroundColor: colour.Lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    left: -HALO,
    top: -HALO,
    width: size.nav + HALO * 2,
    height: size.nav + HALO * 2,
    borderRadius: (size.nav + HALO * 2) / 2,
    backgroundColor: 'rgba(216,242,122,0.35)',
  },
})
