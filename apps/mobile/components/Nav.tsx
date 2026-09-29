// apps/mobile/components/Nav.tsx
// The nav trio (Figma 145:5): Home · ⊕ · Mini — three separate squircle tiles, 56 pt, r16. Home and Mini are rooms:
// outline at rest, solid ink when selected. The ⊕ is an action, not a room: it never shows a selected state, only the
// listening halo. Tap ⊕ = mic. Long-press ⊕ = Talk / Import / Project (rule 1). Search lives in the header, never here.

import { useEffect, useRef } from 'react'
import { ActionSheetIOS, Alert, Animated, Easing, Pressable, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'
import { useSupabase } from '@/lib/supabase'
import { hero } from '@/lib/theme'

const icons = {
  homeRest: require('@/assets/figma/nav-home-rest.svg'),
  homeSelected: require('@/assets/figma/nav-home-selected.svg'),
  mic: require('@/assets/figma/nav-mic.svg'),
  miniRest: require('@/assets/figma/nav-mini-rest.svg'),
  miniSelected: require('@/assets/figma/nav-mini-selected.svg'),
}

export type Room = 'home' | 'mini'

/**
 * @param room     which room tile is selected
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
    <View style={styles.trio} pointerEvents="box-none">
      <Pressable
        onPress={goHome}
        style={styles.tile}
        testID="nav-home"
        accessibilityRole="tab"
        accessibilityLabel="Home"
        accessibilityState={{ selected: room === 'home' }}
      >
        <Image source={room === 'home' ? icons.homeSelected : icons.homeRest} style={styles.icon} />
      </Pressable>
      <View>
        {listening && <Halo />}
        <Pressable
          onPress={() => router.push('/record')}
          onLongPress={menu}
          style={({ pressed }) => [styles.tile, styles.listen, pressed && { transform: [{ scale: 0.96 }] }]}
          accessibilityRole="button"
          accessibilityLabel="Talk"
          accessibilityHint="Hold for Talk, Import or Project"
        >
          <Image source={icons.mic} style={styles.icon} />
        </Pressable>
      </View>
      <Pressable
        onPress={goMini}
        style={styles.tile}
        testID="nav-mini"
        accessibilityRole="tab"
        accessibilityLabel="Ivy Mini"
        accessibilityState={{ selected: room === 'mini' }}
      >
        <Image source={room === 'mini' ? icons.miniSelected : icons.miniRest} style={styles.icon} />
      </Pressable>
    </View>
  )
}

/** 72 pt, r22, lime at 35 % behind the ⊕ — pulses rather than sits. */
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

// Figma L1/L7: tiles at y 756 in an 852 frame → 40 pt above the bottom edge.
const styles = StyleSheet.create({
  trio: { position: 'absolute', left: 0, right: 0, bottom: 40, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  tile: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: hero.room,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
  },
  listen: { backgroundColor: hero.lime },
  icon: { width: 24, height: 24 },
  halo: { position: 'absolute', left: -8, top: -8, width: 72, height: 72, borderRadius: 22, backgroundColor: 'rgba(216,242,122,0.35)' },
})
