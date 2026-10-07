// apps/mobile/lib/share.ts
// Share (Job C+, Figma 1459:207). What leaves the phone is the card only — its title, its form and the photo credit.
// The recording, transcript, context and linked ideas stay private (the sheet says so).
//
// A link is public only once she shares one: Copy link, WhatsApp and Messages turn on the card's page
// (cards.shared_at, 0034; app.ivywolf.com.au/idea/<id>, which answers for a shared card with the card alone). Stop
// sharing turns it off again. The image paths (Download image, Instagram, TikTok, More…) never make a page.

import type { SupabaseClient } from '@supabase/supabase-js'
import { Linking, Share } from 'react-native'

export const PUBLIC_BASE = 'https://app.ivywolf.com.au'
export const publicUrl = (cardId: string) => `${PUBLIC_BASE}/idea/${cardId}`

/** Turn the public page on (once — the first share's time is kept) or off. */
export async function setShared(supabase: SupabaseClient, cardId: string, on: boolean): Promise<string | null> {
  if (on) {
    const { data, error } = await supabase.from('cards').update({ shared_at: new Date().toISOString() }).eq('id', cardId).is('shared_at', null).select('shared_at')
    if (error) throw new Error(`share: ${error.message}`)
    if (data?.length) return data[0].shared_at
    // Already shared: nothing to change.
    return 'already'
  }
  const { error } = await supabase.from('cards').update({ shared_at: null }).eq('id', cardId)
  if (error) throw new Error(`stop sharing: ${error.message}`)
  return null
}

export async function copyText(text: string) {
  try {
    const Clipboard = await import('expo-clipboard')
    await Clipboard.setStringAsync(text)
  } catch {
    await Share.share({ message: text })
  }
}

/** WhatsApp or Messages with the title and the link; the system sheet if the app isn't there. */
export async function sendLink(to: 'whatsapp' | 'messages', title: string, url: string) {
  const body = encodeURIComponent(`${title}\n${url}`)
  const target = to === 'whatsapp' ? `whatsapp://send?text=${body}` : `sms:&body=${body}`
  try {
    await Linking.openURL(target)
  } catch {
    await Share.share({ message: `${title}\n${url}`, url })
  }
}

/** The card as a picture, into the system sheet — its own suggestions are the people she messages (no friends list
 *  in Ivy), and Instagram and TikTok take it from there. */
export async function shareImage(uri: string, title: string) {
  await Share.share({ url: uri, message: title })
}

/** Download image: saved to Photos (add-only permission). False if she said no. */
export async function saveImage(uri: string): Promise<boolean> {
  const MediaLibrary = await import('expo-media-library')
  const { granted } = await MediaLibrary.requestPermissionsAsync(true)
  if (!granted) return false
  await MediaLibrary.saveToLibraryAsync(uri)
  return true
}
