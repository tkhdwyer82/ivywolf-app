// apps/mobile/app/mini.tsx
// Mini, no device yet (L7, Figma 172:2). A showroom, not a feature room: full-bleed footage of the Mini in use, one
// white CTA — Connect your Mini — and a quiet line that keeps DJI owners in. Sessions, chapters and the quote bank
// stay behind the device (L8, Job E).
// Connect is a stub: there's no BLE pairing until the Mini ships, so the button says so for a moment and settles.
// The showroom is the footage: muted, looping, playing only while the tab has focus.

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useFocusEffect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useAuth } from '@clerk/clerk-expo'
import { useSupabase } from '@/lib/supabase'
import { importSession } from '@/lib/mini'
import { hero } from '@/lib/theme'
import { Nav } from '@/components/Nav'

const COMING_MS = 2600

type Phase = { kind: 'idle' } | { kind: 'coming' } | { kind: 'importing' } | { kind: 'failed'; message: string }

export default function Mini() {
  const supabase = useSupabase()
  const { userId, getToken } = useAuth()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const player = useVideoPlayer(require('@/assets/mini-hero.mp4'), (p) => {
    p.muted = true
    p.loop = true
    p.audioMixingMode = 'mixWithOthers'
  })

  useFocusEffect(
    useCallback(() => {
      player.play()
      return () => player.pause()
    }, [player]),
  )

  useEffect(() => {
    if (phase.kind !== 'coming' && phase.kind !== 'failed') return
    const t = setTimeout(() => setPhase({ kind: 'idle' }), phase.kind === 'failed' ? 4000 : COMING_MS)
    return () => clearTimeout(t)
  }, [phase])

  async function importRecording() {
    if (!userId || phase.kind === 'importing') return
    setPhase({ kind: 'importing' })
    try {
      const token = await getToken()
      if (!token) throw new Error('Signed out')
      const done = await importSession({ supabase, userId, token })
      if (!done) return setPhase({ kind: 'idle' })
      // Home watches it in; the ⊕ halos while Ivy is hearing it through.
      setPhase({ kind: 'idle' })
      router.dismissTo('/')
    } catch (e) {
      setPhase({ kind: 'failed', message: e instanceof Error ? e.message : 'That didn’t import' })
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} accessibilityIgnoresInvertColors />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']} style={styles.fade} pointerEvents="none" />

      <View style={styles.top}>
        <Text style={styles.title}>Ivy Mini</Text>
      </View>

      <View style={styles.bottom}>
        <Text style={styles.headline}>{'Clip it on.\nIvy cuts the chapters.'}</Text>
        <Text style={styles.sub}>Interviews, walk-and-talks, on set — every quote findable, every chapter an idea.</Text>
        <Pressable
          onPress={() => setPhase({ kind: 'coming' })}
          style={({ pressed }) => [styles.connect, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Connect your Mini"
        >
          {phase.kind !== 'coming' && <Image source={require('@/assets/figma/l7-connect.svg')} style={styles.connectIcon} />}
          <Text style={styles.connectLabel}>{phase.kind === 'coming' ? 'Coming with your Mini' : 'Connect your Mini'}</Text>
        </Pressable>
        <Pressable onPress={importRecording} hitSlop={10} accessibilityRole="button" style={styles.djiRow}>
          {phase.kind === 'importing' ? (
            <ActivityIndicator color="rgba(255,255,255,0.75)" />
          ) : (
            <Text style={styles.dji} numberOfLines={2}>
              {phase.kind === 'failed' ? phase.message : 'Have a DJI mic? Import a recording'}
            </Text>
          )}
        </Pressable>
      </View>

      <Nav room="mini" />
    </View>
  )
}

// Positions follow the 393 × 852 frame, anchored to the bottom: headline at 500, sub at 580, Connect 640–696, the
// DJI line at 712, nav at 756. Title SF Pro Bold 30 white at 54.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  // Figma 172:3: black 0 → 85 % over the bottom 420 pt.
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 420 },
  top: { position: 'absolute', top: 54, left: 20 },
  title: { fontSize: 30, fontWeight: '700', color: '#FFFFFF' },
  bottom: { position: 'absolute', left: 20, right: 20, bottom: 123 },
  headline: { fontSize: 30, fontWeight: '700', lineHeight: 36, color: '#FFFFFF' },
  sub: { fontSize: 15, lineHeight: 18, color: 'rgba(255,255,255,0.8)', width: 340, marginTop: 8 },
  connect: {
    marginTop: 24,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  connectIcon: { width: 22, height: 22 },
  connectLabel: { fontSize: 17, fontWeight: '600', color: hero.ink },
  djiRow: { marginTop: 16, minHeight: 17, alignItems: 'center' },
  dji: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
})
