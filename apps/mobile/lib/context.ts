// apps/mobile/lib/context.ts
// Add context (Job C+, Figma 1461:2, 1453:106, S6 227:594): what she adds to an idea after the fact — a voice note,
// some text, a link, a file or an image — kept on the idea with its cite (card_context, 0034). Context never
// rewrites the card: nothing here writes to cards.
//
//   voice  recorded on the sheet → the private `context` bucket → apps/web transcribes it (Deepgram, from a short-lived
//          signed URL, as recordings are) and writes the words onto the row.
//   text   what she typed.
//   link   apps/web fetches the page's title and thumbnail, and nothing else.
//   file   a PDF or an image, ≤ 20 MB, into the private bucket.
//   image  from her library, ≤ 20 MB, with what it's for (S6): this idea, her style, or both. Style (and both) also
//          add it to her style pack's references and leave a style signal.

import { File } from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { writeStyleSignal } from '@/lib/styleSignals'

const API_URL = process.env.EXPO_PUBLIC_API_URL!
export const MAX_BYTES = 20 * 1024 * 1024
export const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/gif']

export type ContextKind = 'voice' | 'text' | 'link' | 'file' | 'image'
export type ImageRole = 'idea' | 'style' | 'both'

export interface ContextItem {
  id: string
  kind: ContextKind
  content: string | null
  url: string | null
  meta: { status?: 'transcribing' | 'done' | 'failed'; duration_ms?: number; thumbnail_url?: string | null; host?: string; mime?: string; bytes?: number; role?: ImageRole }
  cite: { source?: string; at?: string }
  createdAt: string
}

type Row = { id: string; kind: ContextKind; content: string | null; url: string | null; meta: ContextItem['meta']; cite: ContextItem['cite']; created_at: string }
const toItem = (r: Row): ContextItem => ({ id: r.id, kind: r.kind, content: r.content, url: r.url, meta: r.meta ?? {}, cite: r.cite ?? {}, createdAt: r.created_at })
const COLUMNS = 'id, kind, content, url, meta, cite, created_at'

export async function loadContext(supabase: SupabaseClient, cardId: string): Promise<ContextItem[]> {
  const { data, error } = await supabase.from('card_context').select(COLUMNS).eq('card_id', cardId).order('created_at', { ascending: false })
  if (error) throw new Error(`context: ${error.message}`)
  return (data as Row[]).map(toItem)
}

async function insert(supabase: SupabaseClient, row: { id?: string; creator_id: string; card_id: string; kind: ContextKind; content?: string | null; url?: string | null; meta?: object; cite?: object }) {
  const { data, error } = await supabase
    .from('card_context')
    .insert({ cite: { at: new Date().toISOString() }, ...row })
    .select(COLUMNS)
    .single()
  if (error) throw new Error(`add context: ${error.message}`)
  return toItem(data as Row)
}

async function upload(supabase: SupabaseClient, userId: string, uri: string, ext: string, contentType: string): Promise<string> {
  const path = `${userId}/${randomUUID()}.${ext}`
  const bytes = await new File(uri).arrayBuffer()
  if (bytes.byteLength > MAX_BYTES) throw new Error('That file is over 20 MB.')
  const up = await supabase.storage.from('context').upload(path, bytes, { contentType, upsert: false })
  if (up.error) throw new Error(`upload: ${up.error.message}`)
  return path
}

const extOf = (name: string, fallback: string) => /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase() ?? fallback

export function addText(supabase: SupabaseClient, userId: string, cardId: string, text: string) {
  const clean = text.trim()
  if (!clean) throw new Error('Nothing to add.')
  return insert(supabase, { creator_id: userId, card_id: cardId, kind: 'text', content: clean, cite: { at: new Date().toISOString(), source: 'typed' } })
}

/** A link: the title and thumbnail come from apps/web, which fetches nothing else from the page. */
export async function addLink(supabase: SupabaseClient, userId: string, cardId: string, raw: string, token: string | null) {
  const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`
  let preview: { title: string | null; thumbnail_url: string | null; host: string } = { title: null, thumbnail_url: null, host: hostOf(url) }
  if (token) {
    const res = await fetch(`${API_URL}/api/context/link`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).catch(() => null)
    if (res?.ok) preview = { ...preview, ...((await res.json()) as typeof preview) }
  }
  return insert(supabase, {
    creator_id: userId,
    card_id: cardId,
    kind: 'link',
    content: preview.title ?? preview.host,
    url,
    meta: { thumbnail_url: preview.thumbnail_url, host: preview.host },
    cite: { at: new Date().toISOString(), source: preview.host },
  })
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

export async function addFile(
  supabase: SupabaseClient,
  userId: string,
  cardId: string,
  file: { uri: string; name: string; mimeType: string; size: number | null }
) {
  if (!FILE_TYPES.includes(file.mimeType)) throw new Error('A file can be a PDF or an image.')
  if (file.size !== null && file.size > MAX_BYTES) throw new Error('That file is over 20 MB.')
  const path = await upload(supabase, userId, file.uri, extOf(file.name, file.mimeType === 'application/pdf' ? 'pdf' : 'jpg'), file.mimeType)
  return insert(supabase, {
    creator_id: userId,
    card_id: cardId,
    kind: file.mimeType.startsWith('image/') ? 'image' : 'file',
    content: file.name,
    url: path,
    meta: { mime: file.mimeType, bytes: file.size ?? undefined, ...(file.mimeType.startsWith('image/') ? { role: 'idea' } : {}) },
    cite: { at: new Date().toISOString(), source: 'Files' },
  })
}

/** An image from her library, for this idea, her style, or both (S6). */
export async function addImage(
  supabase: SupabaseClient,
  userId: string,
  cardId: string,
  image: { uri: string; name: string; mimeType: string; size: number | null },
  role: ImageRole
) {
  if (image.size !== null && image.size > MAX_BYTES) throw new Error('That image is over 20 MB.')
  const path = await upload(supabase, userId, image.uri, extOf(image.name, 'jpg'), image.mimeType)
  const item = await insert(supabase, {
    creator_id: userId,
    card_id: cardId,
    kind: 'image',
    content: image.name,
    url: path,
    meta: { mime: image.mimeType, bytes: image.size ?? undefined, role },
    cite: { at: new Date().toISOString(), source: 'Camera roll' },
  })
  if (role !== 'idea') {
    // Her style: the picture joins her style pack's references (stored privately; the path, never a public URL).
    const ref = `context/${path}`
    const { data } = await supabase.from('style_packs').select('reference_urls').eq('creator_id', userId).maybeSingle()
    const refs = (data?.reference_urls as string[] | undefined) ?? []
    if (!refs.includes(ref)) {
      const { error } = await supabase.from('style_packs').update({ reference_urls: [...refs, ref] }).eq('creator_id', userId)
      if (error) console.warn(`[context] style reference: ${error.message}`)
    }
    writeStyleSignal(supabase, 'style_reference', { field: 'aesthetic', source: 'context', card_id: cardId, path: ref, role }).catch((e) =>
      console.warn(`[context] style signal: ${e.message}`)
    )
  }
  return item
}

/** A voice note: upload, the row (status transcribing), then ask apps/web to write the words down. */
export async function addVoice(supabase: SupabaseClient, userId: string, cardId: string, uri: string, durationMs: number, token: string | null) {
  const path = await upload(supabase, userId, uri, 'm4a', 'audio/mp4')
  const item = await insert(supabase, {
    creator_id: userId,
    card_id: cardId,
    kind: 'voice',
    content: null,
    url: path,
    meta: { status: 'transcribing', duration_ms: durationMs },
    cite: { at: new Date().toISOString(), source: 'Phone' },
  })
  if (token) {
    fetch(`${API_URL}/api/context/${item.id}/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch((e) =>
      console.warn(`[context] transcribe: ${e.message}`)
    )
  }
  return item
}

/** Remove a piece of context, and its file if it has one. */
export async function removeContext(supabase: SupabaseClient, item: ContextItem) {
  if (item.url && item.kind !== 'link') await supabase.storage.from('context').remove([item.url])
  const { error } = await supabase.from('card_context').delete().eq('id', item.id)
  if (error) throw new Error(`remove: ${error.message}`)
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const when = (iso: string, now = new Date()) => {
  const d = new Date(iso)
  const t = `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`
  return d.toDateString() === now.toDateString() ? `Today ${t}` : `${DAYS[d.getDay()]} ${t}`
}
const mb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** What a piece of context says in the list (1461:2): its words, then "Voice note · Today 2:14 · 0:12". */
export function contextLines(item: ContextItem, now = new Date()): { title: string; meta: string } {
  switch (item.kind) {
    case 'voice':
      return {
        title: item.content ? `“${item.content}”` : item.meta.status === 'failed' ? 'Couldn’t write this one down' : 'Ivy is writing it down…',
        meta: ['Voice note', when(item.createdAt, now), item.meta.duration_ms ? clock(item.meta.duration_ms) : null].filter(Boolean).join(' · '),
      }
    case 'text':
      return { title: item.content ?? '', meta: ['Text', when(item.createdAt, now)].join(' · ') }
    case 'link':
      return { title: item.content ?? item.url ?? '', meta: ['Link', item.meta.host ?? (item.url ? hostOf(item.url) : null)].filter(Boolean).join(' · ') }
    case 'file':
      return { title: item.content ?? 'File', meta: ['File', item.meta.mime === 'application/pdf' ? 'PDF' : null, item.meta.bytes ? mb(item.meta.bytes) : null].filter(Boolean).join(' · ') }
    case 'image':
      return {
        title: item.content ?? 'Image',
        meta: ['Image', item.meta.role === 'style' ? 'Your style' : item.meta.role === 'both' ? 'This idea and your style' : null, item.cite.source ?? null]
          .filter(Boolean)
          .join(' · '),
      }
  }
}
