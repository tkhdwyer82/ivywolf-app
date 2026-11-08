// apps/mobile/components/CoverSheet.tsx
// ••• → Change cover (B.12): the Ivy library's six photos nearest this idea, three across. Tap one to make it the
// cover; the sheet closes and the page reloads. Behind INSPIRATION_ENABLED (lib/covers.ts).

import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Image } from 'expo-image'
import { useAuth } from '@clerk/clerk-expo'
import { colour } from '@ivywolf/ui'
import { loadCoverChoices, setCover, type CoverChoice } from '@/lib/covers'
import { Sheet } from '@/components/Sheet'

const ACROSS = 3
const GAP = 8
const SIDE = 24

export function CoverSheet({ cardId, onClose, onChanged }: { cardId: string; onClose: () => void; onChanged: () => void }) {
  const { getToken } = useAuth()
  const { width } = useWindowDimensions()
  const [items, setItems] = useState<CoverChoice[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const tile = Math.floor((width - 2 * SIDE - (ACROSS - 1) * GAP) / ACROSS)

  useEffect(() => {
    let live = true
    getToken()
      .then((t) => (t ? loadCoverChoices(t, cardId) : []))
      .then((l) => live && setItems(l))
      .catch((e) => {
        if (!live) return
        setItems([])
        setNote(e instanceof Error ? e.message : 'The Ivy library didn’t load')
      })
    return () => {
      live = false
    }
  }, [cardId, getToken])

  async function pick(c: CoverChoice) {
    if (busy) return
    setBusy(c.id)
    setNote(null)
    try {
      const t = await getToken()
      if (!t) throw new Error('Signed out')
      await setCover(t, cardId, c.id)
      onChanged()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That cover didn’t change')
      setBusy(null)
    }
  }

  return (
    <Sheet title="Change cover" subtitle="From the Ivy library" onClose={onClose}>
      {items === null ? (
        <ActivityIndicator style={styles.loading} testID="cover-loading" />
      ) : items.length === 0 ? (
        <Text style={styles.note}>{note ?? 'Nothing in the Ivy library for this one yet.'}</Text>
      ) : (
        <View style={styles.grid} testID="cover-grid">
          {items.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => pick(c)}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityLabel={`Use as cover: ${c.caption}`}
              testID={`cover-${c.id}`}
              style={[styles.tile, { width: tile, height: Math.round(tile * 1.25) }]}
            >
              <Image source={{ uri: c.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              {busy === c.id && (
                <View style={styles.busy}>
                  <ActivityIndicator color={colour.Surface} />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}
      {note && items && items.length > 0 && <Text style={styles.note}>{note}</Text>}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  loading: { marginVertical: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 18, marginBottom: 8 },
  tile: { borderRadius: 14, overflow: 'hidden', backgroundColor: colour.Chip },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 13, color: colour.Grey, textAlign: 'center', marginVertical: 24 },
})
