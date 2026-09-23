// apps/mobile/lib/imports.ts
// Add to ideas (P2): pick an image or video from the library and upload it with the creator's own JWT — the
// original to the private `imports` bucket, a poster (the image itself, or a still from the video) to
// frames/<her id>/imports/ (0018). Record then asks what it's for; the pipeline makes the card (imports.ts).

import * as ImagePicker from 'expo-image-picker'
import * as VideoThumbnails from 'expo-video-thumbnails'
import { File } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PickedImport {
  kind: 'image' | 'video'
  original_path: string
  poster_path: string
}

const extOf = (uri: string, fallback: string) => /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(uri)?.[1]?.toLowerCase() ?? fallback

/** Null when she cancels the picker. Throws with a readable message when an upload fails. */
export async function pickImport(supabase: SupabaseClient, userId: string, kind: 'image' | 'video'): Promise<PickedImport | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: [kind === 'image' ? 'images' : 'videos'],
    quality: 0.9,
    allowsMultipleSelection: false,
  })
  if (picked.canceled || !picked.assets[0]) return null
  const asset = picked.assets[0]

  const id = randomUUID()
  const ext = extOf(asset.fileName ?? asset.uri, kind === 'image' ? 'jpg' : 'mov')
  const originalPath = `${userId}/${id}.${ext}`
  const contentType = asset.mimeType ?? (kind === 'image' ? 'image/jpeg' : 'video/quicktime')
  const original = await new File(asset.uri).arrayBuffer()
  const up = await supabase.storage.from('imports').upload(originalPath, original, { contentType, upsert: false })
  if (up.error) throw new Error(`upload: ${up.error.message}`)

  // The poster is what Home shows: the image itself, or a still one second into the video.
  const posterPath = `${userId}/imports/${id}.jpg`
  let poster: ArrayBuffer
  let posterType = 'image/jpeg'
  if (kind === 'image') {
    poster = original
    posterType = contentType
  } else {
    const still = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000, quality: 0.8 })
    poster = await new File(still.uri).arrayBuffer()
  }
  const posterUp = await supabase.storage.from('frames').upload(posterPath, poster, { contentType: posterType, upsert: false })
  if (posterUp.error) throw new Error(`poster: ${posterUp.error.message}`)

  return { kind, original_path: originalPath, poster_path: posterPath }
}
