// packages/pipeline/frames.ts
// Every card and to-do gets a frame (handover §4 rule 6). Called after a recording's graph writes: each card or
// action with a frame_brief is drawn in the creator's style pack; one with no brief is left for the app to render
// typographically (its title in the palette).
//
//   frame_status: none → queued → done | typographic | failed
//
// A failure sets 'failed' and never blocks the card — the app shows the typographic frame instead.
// To-dos are cached by (style pack, normalised brief): "a carton of milk" is drawn once per creator.
// Only the brief, tone words and palette are sent to fal.ai — never a name, the transcript or other creators' data.

import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { fetchAndUpload } from './storage'

const MODEL = 'fal-ai/flux/schnell'
const ENDPOINT = `https://fal.run/${MODEL}`
const IMAGE_SIZE = 'portrait_4_3' // 768 × 1024, i.e. 3:4 portrait
/** fal pricing for flux/schnell: $0.003 per megapixel, rounded up to the nearest megapixel (checked 2026-09-23). */
const USD_PER_MEGAPIXEL = 0.003

const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

interface StylePack {
  id: string
  tone_words: string[]
  palette: string[]
}

interface Subject {
  kind: 'card' | 'action'
  id: string
  brief: string | null
}

/** Lowercase, punctuation and articles out, whitespace collapsed: "A carton of milk." ≡ "carton of milk". */
export function normaliseBrief(brief: string): string {
  return brief
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !['a', 'an', 'the'].includes(w))
    .join(' ')
}

const briefHash = (brief: string) => createHash('sha256').update(normaliseBrief(brief)).digest('hex')

/** Hex → a colour word an image model understands. Coarse on purpose: the palette sets a mood, not exact values. */
export function colourName(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return hex
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1))
  if (s < 0.12) return l < 0.15 ? 'ink black' : l > 0.92 ? 'paper white' : l < 0.5 ? 'charcoal grey' : 'soft grey'
  const d = max - min
  const h = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60
  const hue = (h + 360) % 360
  const name =
    hue < 15 ? 'red' : hue < 40 ? 'orange' : hue < 60 ? 'yellow' : hue < 90 ? 'lime green' : hue < 160 ? 'green'
    : hue < 200 ? 'teal' : hue < 250 ? 'blue' : hue < 290 ? 'purple' : hue < 335 ? 'pink' : 'red'
  return `${l > 0.7 ? 'pale ' : l < 0.3 ? 'deep ' : ''}${name}`
}

const PEOPLE =
  /\b(figure|figures|person|people|man|men|woman|women|girl|boy|child|children|kid|kids|runner|crowd|hand|hands|creator|creators|someone|dancer|friends?)\b/i

/** The model prompt: her brief, drawn in her style. Illustrative — no faces, lettering or brand marks. */
export function framePrompt(brief: string, pack: StylePack): string {
  const tone = pack.tone_words.join(', ')
  const palette = [...new Set(pack.palette.map(colourName))].join(', ')
  return [
    brief.trim().replace(/\.$/, ''),
    tone && `${tone}`,
    palette && `colour palette: ${palette}`,
    // Naming people at all draws them in (Flux has no negative prompt), so only a brief with a figure gets the rule.
    PEOPLE.test(brief)
      ? 'an illustrative still, figures seen from behind or at a distance, no visible faces, no text, no lettering, no logos, no brand marks'
      : 'an illustrative still, no people, no text, no lettering, no logos, no brand marks',
  ]
    .filter(Boolean)
    .join('. ')
}

async function draw(prompt: string): Promise<{ url: string; width: number; height: number; costUsd: number }> {
  const key = process.env.FAL_KEY
  if (!key) throw new Error('FAL_KEY is not set')
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image_size: IMAGE_SIZE,
      num_images: 1,
      output_format: 'jpeg',
      enable_safety_checker: true,
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`fal ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = (await res.json()) as {
    images?: { url: string; width: number; height: number }[]
    has_nsfw_concepts?: boolean[]
  }
  const image = body.images?.[0]
  if (!image) throw new Error('fal returned no image')
  if (body.has_nsfw_concepts?.[0]) throw new Error('fal flagged the image (safety checker)')
  const megapixels = Math.ceil((image.width * image.height) / 1_000_000)
  return { ...image, costUsd: megapixels * USD_PER_MEGAPIXEL }
}

async function frameOne(creatorId: string, pack: StylePack, s: Subject): Promise<void> {
  const supabase = db()
  const table = s.kind === 'card' ? 'cards' : 'actions'
  const setStatus = async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from(table).update(fields).eq('id', s.id)
    if (error) throw new Error(`${table} ${s.id}: ${error.message}`)
  }

  if (!s.brief?.trim()) {
    await setStatus({ frame_status: 'typographic' })
    return
  }

  const hash = briefHash(s.brief)
  const log = async (row: Record<string, unknown>) => {
    const { error } = await supabase.from('frame_generations').insert({
      creator_id: creatorId,
      style_pack_id: pack.id,
      card_id: s.kind === 'card' ? s.id : null,
      action_id: s.kind === 'action' ? s.id : null,
      kind: s.kind,
      brief_hash: hash,
      model: MODEL,
      ...row,
    })
    if (error) console.error(`[frames] cost log for ${s.kind} ${s.id}: ${error.message}`)
  }

  if (s.kind === 'action') {
    const { data: hit } = await supabase
      .from('frame_generations')
      .select('frame_url, width, height')
      .eq('style_pack_id', pack.id)
      .eq('brief_hash', hash)
      .eq('kind', 'action')
      .eq('status', 'done')
      .eq('cached', false)
      .not('frame_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (hit) {
      await setStatus({ frame_url: hit.frame_url, frame_status: 'done' })
      await log({ status: 'done', cached: true, frame_url: hit.frame_url, width: hit.width, height: hit.height })
      console.log(`[frames] action ${s.id}: cached, $0`)
      return
    }
  }

  await setStatus({ frame_status: 'queued' })
  try {
    const image = await draw(framePrompt(s.brief, pack))
    // Cards: one frame each. To-dos: one per (style pack, brief), shared by every to-do with that brief.
    const path =
      s.kind === 'card' ? `${creatorId}/${s.id}.jpg` : `${creatorId}/actions/${pack.id}-${hash.slice(0, 32)}.jpg`
    const frameUrl = await fetchAndUpload({ bucket: 'frames', sourceUrl: image.url, path, contentType: 'image/jpeg' })
    await setStatus({ frame_url: frameUrl, frame_status: 'done' })
    await log({ status: 'done', frame_url: frameUrl, width: image.width, height: image.height, cost_usd: image.costUsd })
    console.log(`[frames] ${s.kind} ${s.id}: ${image.width}×${image.height}, $${image.costUsd.toFixed(4)}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[frames] ${s.kind} ${s.id} failed: ${message}`)
    await setStatus({ frame_status: 'failed' }).catch(() => {})
    await log({ status: 'failed', error: message.slice(0, 2000) })
  }
}

/**
 * Frame every card and action of one recording that doesn't have one yet. Never throws for a single frame; throws
 * only if the recording's rows or the style pack can't be read at all.
 */
export async function frameRecording(creatorId: string, recordingId: string): Promise<void> {
  const supabase = db()
  const { data: pack, error: packError } = await supabase
    .from('style_packs')
    .select('id, tone_words, palette')
    .eq('creator_id', creatorId)
    .single()
  if (packError || !pack) throw new Error(`style pack for ${creatorId}: ${packError?.message ?? 'missing'}`)

  const subjects: Subject[] = []
  for (const kind of ['card', 'action'] as const) {
    const { data, error } = await supabase
      .from(kind === 'card' ? 'cards' : 'actions')
      .select('id, frame_brief')
      .eq('recording_id', recordingId)
      .eq('frame_status', 'none')
    if (error) throw new Error(`${kind}s for ${recordingId}: ${error.message}`)
    subjects.push(...(data ?? []).map((r) => ({ kind, id: r.id as string, brief: r.frame_brief as string | null })))
  }

  // To-dos first and one at a time, so two to-dos with the same brief share one generation.
  for (const s of subjects.filter((x) => x.kind === 'action')) await frameOne(creatorId, pack, s)
  await Promise.all(subjects.filter((x) => x.kind === 'card').map((s) => frameOne(creatorId, pack, s)))
}
