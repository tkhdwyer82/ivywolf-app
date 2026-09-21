// packages/pipeline/storage.ts
// The one storage module. Lifted from gamesfield-app lib/storage.ts per docs/lift-list.md.
// Gamesfield had this module plus seven routes that re-implemented it inline; that is not repeated here.
// Everything that touches Supabase Storage goes through this file.
//
// Buckets:
//   recordings — raw audio, exactly as received. Never transcoded, never rewritten (CLAUDE.md working agreement:
//                "Never store raw audio outside Supabase storage").
//   frames     — generated card/board imagery. Cache common frames; generate only novel ones (rule 3).

import { createClient } from '@supabase/supabase-js'

export type Bucket = 'recordings' | 'frames'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Upload a raw buffer (already in memory) to Supabase Storage.
 * Use this when the source is a Response body or generated server-side.
 *
 * `recordings` is private — uploads there return the storage key, which is what goes in
 * recordings.storage_path. Read it back with a signed URL, never a public one.
 * `frames` is public — returns a public URL.
 */
export async function uploadBuffer({
  bucket,
  buffer,
  path,
  contentType,
  upsert = false,
}: {
  bucket: Bucket
  buffer: Buffer | ArrayBuffer
  path: string
  contentType: string
  upsert?: boolean
}): Promise<string> {
  const { error } = await supabaseAdmin.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert,
    cacheControl: '31536000', // 1 year — generated frames never change; recordings never change by definition
  })

  if (error) {
    throw new Error(`Supabase Storage upload failed (${bucket}/${path}): ${error.message}`)
  }

  if (bucket === 'recordings') return path

  const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Fetch a temporary URL from an adapter (Higgsfield, Deepgram artefacts, etc.) and re-upload it.
 * Returns the permanent location.
 *
 * Gamesfield learned this the hard way: fal.media URLs expired and every reference to them broke,
 * which is why characterRefs.ts had to filter for permanent URLs at read time. Re-upload on the way in.
 */
export async function fetchAndUpload({
  bucket,
  sourceUrl,
  path,
  contentType,
}: {
  bucket: Bucket
  sourceUrl: string
  path: string
  contentType: string
}): Promise<string> {
  const res = await fetch(sourceUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch source asset (${sourceUrl}): ${res.status} ${res.statusText}`)
  }
  const buffer = await res.arrayBuffer()
  return uploadBuffer({ bucket, buffer, path, contentType })
}

/**
 * Signed URL for a private object. Raw audio is only ever served this way —
 * play_from_ms on a card is meaningless without the recording behind it, but the
 * recording itself must never be publicly addressable.
 */
export async function signedUrl(
  bucket: Bucket,
  path: string,
  expiresInSeconds = 60 * 60
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds)

  if (error || !data) {
    throw new Error(`Signed URL failed (${bucket}/${path}): ${error?.message ?? 'no data'}`)
  }
  return data.signedUrl
}
