// apps/mobile/components/ShareSheet.tsx
// Share (Job C+, Figma 1459:207), Pinterest-style. Shares the card only — the recording, transcript and linked ideas
// stay private, and the sheet says so at the bottom.
//   Send to   the phone's own share sheet, whose top row is the people she messages most. Ivy has no friends list
//             and no social features (clarified).
//   Share to  Copy link · WhatsApp · Messages send the card's public page (made now if it isn't already — off until
//             she shares, lib/share.ts); Instagram · TikTok take the card as a picture, through the phone's sheet.
//   Download image — the card as a picture, into Photos.   More… — the phone's share sheet with the picture.
// The picture is the card drawn off-screen at 360 wide and captured (react-native-view-shot).

import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SymbolView, type SFSymbol } from 'expo-symbols'
import { captureRef } from 'react-native-view-shot'
import { colour } from '@ivywolf/ui'
import { useSupabase } from '@/lib/supabase'
import type { CardItem } from '@/lib/home'
import { copyText, publicUrl, saveImage, sendLink, setShared, shareImage } from '@/lib/share'
import { CardFace } from '@/components/CardFace'
import { Sheet, SheetRule, SheetSection } from '@/components/Sheet'

const SHOT_W = 360
const SHOT_PHOTO_H = 440

export function ShareSheet({ card, onClose, onShared }: { card: CardItem; onClose: () => void; onShared?: (sharedAt: string) => void }) {
  const supabase = useSupabase()
  const shot = useRef<View>(null)
  const [note, setNote] = useState<string | null>(null)

  async function picture(): Promise<string> {
    return captureRef(shot, { format: 'png', quality: 1, result: 'tmpfile' })
  }

  /** Make the public page (if it isn't already) and hand back its link. */
  async function link(): Promise<string> {
    const at = await setShared(supabase, card.id, true)
    if (at && at !== 'already') onShared?.(at)
    return publicUrl(card.id)
  }

  const run = (f: () => Promise<unknown>) => () => {
    setNote(null)
    f().catch((e) => setNote(e instanceof Error ? e.message : 'That didn’t share'))
  }

  const targets: { key: string; label: string; icon: SFSymbol; bg: string; tint: string; go: () => Promise<unknown> }[] = [
    {
      key: 'copy',
      label: 'Copy link',
      icon: 'link',
      bg: colour.Chip,
      tint: colour.Ink,
      go: async () => {
        await copyText(await link())
        setNote('Link copied. Anyone with it sees this card, and only this card.')
      },
    },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'phone.fill', bg: '#25D366', tint: colour.Surface, go: async () => sendLink('whatsapp', card.title, await link()) },
    { key: 'messages', label: 'Messages', icon: 'message.fill', bg: '#34C759', tint: colour.Surface, go: async () => sendLink('messages', card.title, await link()) },
    { key: 'instagram', label: 'Instagram', icon: 'camera.fill', bg: '#E1306C', tint: colour.Surface, go: async () => shareImage(await picture(), card.title) },
    { key: 'tiktok', label: 'TikTok', icon: 'music.note', bg: '#111111', tint: colour.Surface, go: async () => shareImage(await picture(), card.title) },
  ]

  return (
    <Sheet title="Share" onClose={onClose}>
      <SheetSection label="Send to" />
      <Pressable onPress={run(async () => shareImage(await picture(), card.title))} style={styles.row} accessibilityRole="button">
        <View style={[styles.disc, { backgroundColor: colour.Chip }]}>
          <SymbolView name="person.2.fill" tintColor={colour.Ink} size={20} />
        </View>
        <View style={styles.rowWords}>
          <Text style={styles.rowTitle}>Choose people</Text>
          <Text style={styles.rowSub}>Your phone suggests who you message most</Text>
        </View>
      </Pressable>
      <SheetRule />

      <SheetSection label="Share to" />
      <View style={styles.targets}>
        {targets.map((t) => (
          <Pressable key={t.key} onPress={run(t.go)} style={styles.target} accessibilityRole="button" accessibilityLabel={t.label}>
            <View style={[styles.square, { backgroundColor: t.bg }]}>
              <SymbolView name={t.icon} tintColor={t.tint} size={22} />
            </View>
            <Text style={styles.targetLabel} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <SheetRule />

      <Pressable
        onPress={run(async () => {
          const ok = await saveImage(await picture())
          setNote(ok ? 'Saved to Photos.' : 'Ivy needs permission to add to Photos — Settings › Ivy Wolf › Photos.')
        })}
        style={styles.line}
        accessibilityRole="button"
      >
        <Text style={styles.rowTitle}>Download image</Text>
        <Text style={styles.rowSub}>Saves the card as an image</Text>
      </Pressable>
      <Pressable onPress={run(async () => shareImage(await picture(), card.title))} style={styles.line} accessibilityRole="button">
        <Text style={styles.rowTitle}>More…</Text>
        <Text style={styles.rowSub}>System share sheet</Text>
      </Pressable>

      {note && <Text style={styles.note}>{note}</Text>}
      <Text style={styles.privacy}>Shares the card only. Recording, transcript and linked ideas stay private.</Text>

      {/* The picture: the card alone, drawn off-screen for the capture. */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={shot} collapsable={false} style={styles.shot}>
          <CardFace card={{ ...card, projectName: null }} photoHeight={SHOT_PHOTO_H} footer={false} />
        </View>
      </View>
    </Sheet>
  )
}

// Figma 1459:207 — measured: share-to squares 54 at radius 14, labels Regular 11 6 under; Send to's disc 54; the rows
// Semibold 16 over Regular 12 grey; the privacy line Regular 11, centred, 16 above the bottom.
const SQUARE = 54

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  disc: { width: SQUARE, height: SQUARE, borderRadius: SQUARE / 2, alignItems: 'center', justifyContent: 'center' },
  rowWords: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colour.Ink },
  rowSub: { fontSize: 12, color: colour.Grey, marginTop: 2 },
  targets: { flexDirection: 'row', justifyContent: 'space-between' },
  target: { alignItems: 'center', width: 62 },
  square: { width: SQUARE, height: SQUARE, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  targetLabel: { fontSize: 11, color: colour.Ink, marginTop: 6 },
  line: { marginTop: 18 },
  note: { fontSize: 13, color: colour.Ink, marginTop: 16 },
  privacy: { fontSize: 11, color: colour.Grey, textAlign: 'center', marginTop: 22 },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  shot: { width: SHOT_W, backgroundColor: colour.Surface, padding: 12 },
})
