// apps/mobile/components/Nav.tsx
// The nav (Figma 145:5, "Nav · selected states"): Home · ⊕ · Mini as three separate squircle tiles, size/nav square,
// r16, 8 apart. Home and Mini are rooms — each changes in its own way when selected, never by colour: Home's outline
// house fills ink with a smile; Mini's outline rectangle + grille goes solid ink with the grille knocked out. The ⊕ is
// an action, not a room: a lime tile with the mic that never shows a selected state, only the listening halo.
// Glyphs are the frame's own (assets/figma/nav-*.svg, 24 × 24). Tap ⊕ = mic. Long-press ⊕ = Talk / Import / Project
// (rule 1). Search lives in the header, never here.

import { useEffect, useRef } from 'react'
import { ActionSheetIOS, Alert, Animated, Easing, Pressable, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'
import { colour, size } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import { BAR_BOTTOM } from '@/components/ActionBar'

// Figma 145:5 — measured, not tokens: tiles r16 and 8 apart, glyphs 24, shadow 0 4 14 at 14 % (an iOS radius of 7);
// the halo is the tile + 8 all round (72, r22), lime at 35 %.
const TILE_R = 16
const GAP = 8
const GLYPH = 24
const HALO = 8
const HALO_R = 22
const TILE_SHADOW = { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 7, shadowOffset: { width: 0, height: 4 } } as const

const GLYPHS = {
  home: require('@/assets/figma/nav-home-rest.svg'),
  homeSelected: require('@/assets/figma/nav-home-selected.svg'),
  mini: require('@/assets/figma/nav-mini-rest.svg'),
  miniSelected: require('@/assets/figma/nav-mini-selected.svg'),
  mic: require('@/assets/figma/nav-mic.svg'),
}

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
    <View style={styles.bar} pointerEvents="box-none">
      <Pressable
        onPress={goHome}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
        accessibilityRole="tab"
        accessibilityLabel="Home"
        accessibilityState={{ selected: room === 'home' }}
        testID="nav-home"
      >
        <Image source={room === 'home' ? GLYPHS.homeSelected : GLYPHS.home} style={styles.glyph} accessibilityElementsHidden />
      </Pressable>
      <View>
        {listening && <Halo />}
        <Pressable
          onPress={() => router.push('/record')}
          onLongPress={menu}
          style={({ pressed }) => [styles.tile, styles.listen, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Talk"
          accessibilityHint="Hold for Talk, Import or Project"
          testID="nav-listen"
        >
          <Image source={GLYPHS.mic} style={styles.glyph} accessibilityElementsHidden />
        </Pressable>
      </View>
      <Pressable
        onPress={goMini}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
        accessibilityRole="tab"
        accessibilityLabel="Ivy Mini"
        accessibilityState={{ selected: room === 'mini' }}
        testID="nav-mini"
      >
        <Image source={room === 'mini' ? GLYPHS.miniSelected : GLYPHS.mini} style={styles.glyph} accessibilityElementsHidden />
      </Pressable>
    </View>
  )
}

/** The tile + 8 all round, lime at 35 % — pulses rather than sits. */
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
  bar: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: BAR_BOTTOM + (size['bar-h'] - size.nav) / 2,
    flexDirection: 'row',
    gap: GAP,
  },
  tile: {
    width: size.nav,
    height: size.nav,
    borderRadius: TILE_R,
    borderCurve: 'continuous',
    backgroundColor: colour.Surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...TILE_SHADOW,
  },
  listen: { backgroundColor: colour.Lime },
  pressed: { transform: [{ scale: 0.96 }] },
  glyph: { width: GLYPH, height: GLYPH },
  halo: {
    position: 'absolute',
    left: -HALO,
    top: -HALO,
    width: size.nav + HALO * 2,
    height: size.nav + HALO * 2,
    borderRadius: HALO_R,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(216,242,122,0.35)',
  },
})
