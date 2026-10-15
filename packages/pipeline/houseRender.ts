// packages/pipeline/houseRender.ts
// The to-do picture (Job B.4, Figma 1797:2): a house render, so every row in My things shares one visual language.
// One unchanging prompt — "one {noun}, product-render style, soft studio light, pastel ground, slight tilt, no text,
// no people" — where the noun is the to-do's frame_brief (Ivy writes one only for something drawable; a to-do
// without one is abstract and keeps its project's hue). Made once per (creator, brief) on fal's nano-banana,
// generated at 512 px and served at 256 in the list: both sizes go to the public frames bucket side by side
// (…-512.jpg is actions.frame_url, …-256.jpg is derived from it, thumbOf), and both go when the last to-do using
// them does (packages/schema/deletion.ts). Server-side only: the pipeline after a recording, and the admin backfill.
//
// Only the brief leaves, with anyone's name heard in the recording stripped first (redact.ts) — never a name, the
// transcript or other creators' data. It replaces the style-pack flux frame for to-dos; old files are left as they
// are.

import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { uploadBuffer } from './storage'
import { peopleFor, stripPeople } from './redact'

export const RENDER_MODEL = 'fal-ai/nano-banana'
const ENDPOINT = `https://fal.run/${RENDER_MODEL}`
/** fal pricing for nano-banana: $0.039 per image (checked 2026-10-15). */
export const RENDER_USD = 0.039
export const RENDER_PX = 512
export const THUMB_PX = 256

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

/** "A carton of milk." → "carton of milk": the brief, without its article or full stop. */
export function nounOf(brief: string): string {
  return brief.trim().replace(/\.$/, '').replace(/^(a|an|the|one|some)\s+/i, '')
}

/** The one prompt every to-do is drawn with. */
export function housePrompt(brief: string): string {
  return `one ${nounOf(brief)}, product-render style, soft studio light, pastel ground, slight tilt, no text, no people`
}

/** The 256 px copy of a house render; anything else is served as it is. */
export function thumbOf(url: string): string {
  return url.replace(/-512\.jpg(\?.*)?$/, '-256.jpg$1')
}

/** Lowercase, punctuation and articles out: "A carton of milk." ≡ "carton of milk" (the same as frames.ts). */
const briefHash = (brief: string) =>
  createHash('sha256')
    .update(
      brief
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w && !['a', 'an', 'the'].includes(w))
        .join(' ')
    )
    .digest('hex')

async function render(prompt: string): Promise<Buffer> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, num_images: 1, aspect_ratio: '1:1', output_format: 'jpeg' }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = (await res.json()) as { images?: { url: string }[] }
  const url = body.images?.[0]?.url
  if (!url) throw new Error('fal returned no image')
  const image = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!image.ok) throw new Error(`fal image ${image.status}`)
  return Buffer.from(await image.arrayBuffer())
}

export type RenderResult = 'rendered' | 'cached' | 'hue' | 'failed'

/**
 * Draw one to-do. `people` are the names heard in its recording (redact.ts). Sets frame_url and frame_status:
 * 'done' with a render, 'typographic' without a brief (the row shows its hue), 'failed' if fal fails.
 */
export async function renderTodo(
  creatorId: string,
  action: { id: string; brief: string | null },
  people: string[],
  stylePackId: string | null = null,
  supabase: SupabaseClient = db()
): Promise<RenderResult> {
  const set = async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from('actions').update(fields).eq('id', action.id)
    if (error) throw new Error(`actions ${action.id}: ${error.message}`)
  }
  const guarded = action.brief?.trim() ? stripPeople(action.brief, people) : { text: '', removed: 0 }
  if (guarded.removed) console.warn(`[render] to-do ${action.id}: removed ${guarded.removed} name word(s) from frame_brief before fal`)
  const brief = guarded.text.trim()
  if (!brief) {
    await set({ frame_status: 'typographic' })
    return 'hue'
  }

  const hash = briefHash(brief)
  const log = async (row: Record<string, unknown>) => {
    const { error } = await supabase.from('frame_generations').insert({
      creator_id: creatorId, style_pack_id: stylePackId, action_id: action.id, kind: 'action', brief_hash: hash, model: RENDER_MODEL, ...row,
    })
    if (error) console.error(`[render] cost log for to-do ${action.id}: ${error.message}`)
  }

  // Made once: another of her to-dos with this brief already has a live render.
  const { data: hit } = await supabase
    .from('frame_generations')
    .select('frame_url')
    .eq('creator_id', creatorId)
    .eq('brief_hash', hash)
    .eq('kind', 'action')
    .eq('model', RENDER_MODEL)
    .eq('status', 'done')
    .eq('cached', false)
    .not('frame_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const live = hit && (await supabase.from('actions').select('id', { count: 'exact', head: true }).eq('frame_url', hit.frame_url)).count
  if (hit && live) {
    await set({ frame_url: hit.frame_url, frame_status: 'done', frame_at: new Date().toISOString() })
    await log({ status: 'done', cached: true, frame_url: hit.frame_url, width: RENDER_PX, height: RENDER_PX })
    return 'cached'
  }

  await set({ frame_status: 'queued' })
  try {
    const original = await render(housePrompt(brief))
    const base = `${creatorId}/actions/house-${hash.slice(0, 32)}-${Date.now()}` // never reused: see deletion.ts
    const big = await sharp(original).resize(RENDER_PX, RENDER_PX, { fit: 'cover' }).jpeg({ quality: 86 }).toBuffer()
    const small = await sharp(original).resize(THUMB_PX, THUMB_PX, { fit: 'cover' }).jpeg({ quality: 84 }).toBuffer()
    await uploadBuffer({ bucket: 'frames', buffer: small, path: `${base}-256.jpg`, contentType: 'image/jpeg' })
    const frameUrl = await uploadBuffer({ bucket: 'frames', buffer: big, path: `${base}-512.jpg`, contentType: 'image/jpeg' })
    await set({ frame_url: frameUrl, frame_status: 'done', frame_at: new Date().toISOString() })
    await log({ status: 'done', frame_url: frameUrl, width: RENDER_PX, height: RENDER_PX, cost_usd: RENDER_USD })
    console.log(`[render] to-do ${action.id}: ${RENDER_PX}px, $${RENDER_USD}`)
    return 'rendered'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[render] to-do ${action.id} failed: ${message}`)
    await set({ frame_status: 'failed' }).catch(() => {})
    await log({ status: 'failed', error: message.slice(0, 2000), cost_usd: 0 })
    return 'failed'
  }
}

/**
 * The admin backfill (apps/web/app/api/admin/reference-pictures): every live to-do of hers that isn't a house render
 * yet. Briefless ones keep their hue. Returns the tally, and how many of her live to-dos end on a render vs the hue.
 */
export async function backfillTodoRenders(creatorId: string, supabase: SupabaseClient = db()) {
  const { data: pack } = await supabase.from('style_packs').select('id').eq('creator_id', creatorId).maybeSingle()
  const { data, error } = await supabase
    .from('actions')
    .select('id, frame_brief, frame_url, recording_id')
    .eq('creator_id', creatorId)
    .is('trashed_at', null)
    .order('created_at')
  if (error) throw new Error(`to-dos for ${creatorId}: ${error.message}`)
  const tally: Record<RenderResult, number> = { rendered: 0, cached: 0, hue: 0, failed: 0 }
  const people = new Map<string, string[]>()
  for (const a of data ?? []) {
    if (a.frame_url?.includes('/actions/house-')) continue
    const rec = a.recording_id as string | null
    if (rec && !people.has(rec)) people.set(rec, await peopleFor(supabase, creatorId, rec))
    tally[await renderTodo(creatorId, { id: a.id, brief: a.frame_brief }, rec ? people.get(rec)! : [], pack?.id ?? null, supabase)]++
  }
  const { data: after } = await supabase.from('actions').select('frame_url, frame_status').eq('creator_id', creatorId).is('trashed_at', null)
  const onRender = (after ?? []).filter((a) => a.frame_status === 'done' && a.frame_url?.includes('/actions/house-')).length
  return { ...tally, todos: after?.length ?? 0, onRender, onHue: (after?.length ?? 0) - onRender }
}
