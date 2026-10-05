// packages/pipeline/frames.ts
// Frames after a recording's graph writes.
//
// Cards (Job B revised, Figma 227:5): a card takes the form shape_v1 chose, and only a photo card has a picture —
// a real photograph from Unsplash (unsplash.ts), found from its visual_query, credited and download-tracked. Quote,
// diagram, board and text cards are drawn natively by the app ('typographic'). No card frame is generated: a photo
// search that finds nothing turns the card into a text card. A card she imported keeps her picture (imports.ts).
//
// To-dos, as before (Job 4): each action with a frame_brief is drawn in the creator's style pack; one with no brief is
// left for the app to render typographically.
//
//   frame_status: none → queued → done | typographic | failed
//
// A failure sets 'failed' (to-dos) or falls back to text (cards) and never blocks the row.
// To-dos are cached by (style pack, normalised brief): "a carton of milk" is drawn once per creator, and its file is
// removed when the last to-do using it is deleted (reference-counted by apps/mobile/lib/deleteRecording.ts).
// Only the brief, tone words and palette are sent to fal.ai — never a name, the transcript or other creators' data.
// "Never a name" is enforced, not just asked for: the words of anyone heard in the recording are stripped from the
// brief and the visual_query before they leave (redact.ts), and the strip is logged (a count, never the names).

import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { fetchAndUpload } from './storage'
import { searchPhoto, trackDownload } from './unsplash'
import { peopleFor, stripPeople } from './redact'

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

async function frameOne(creatorId: string, pack: StylePack, s: Subject, people: string[]): Promise<void> {
  const supabase = db()
  const table = s.kind === 'card' ? 'cards' : 'actions'
  const setStatus = async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from(table).update(fields).eq('id', s.id)
    if (error) throw new Error(`${table} ${s.id}: ${error.message}`)
  }

  const guarded = s.brief?.trim() ? stripPeople(s.brief, people) : { text: '', removed: 0 }
  if (guarded.removed) console.warn(`[frames] ${s.kind} ${s.id}: removed ${guarded.removed} name word(s) from frame_brief before fal`)
  const brief = guarded.text
  if (!brief.trim()) {
    await setStatus({ frame_status: 'typographic' })
    return
  }

  const hash = briefHash(brief)
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
    // A cached frame is only good while some to-do still uses it: deleting the last one removes the file
    // (apps/mobile/lib/deleteRecording.ts), and the next to-do with this brief is drawn afresh.
    const live =
      hit &&
      (await supabase.from('actions').select('id', { count: 'exact', head: true }).eq('frame_url', hit.frame_url)).count
    if (hit && live) {
      await setStatus({ frame_url: hit.frame_url, frame_status: 'done', frame_at: new Date().toISOString() })
      await log({ status: 'done', cached: true, frame_url: hit.frame_url, width: hit.width, height: hit.height })
      console.log(`[frames] action ${s.id}: cached, $0`)
      return
    }
  }

  await setStatus({ frame_status: 'queued' })
  try {
    const image = await draw(framePrompt(brief, pack))
    // Cards: one frame each. To-dos: one per (style pack, brief), shared by every to-do with that brief.
    const path =
      s.kind === 'card'
        ? `${creatorId}/${s.id}.jpg`
        : `${creatorId}/actions/${pack.id}-${hash.slice(0, 32)}-${Date.now()}.jpg` // never reused: see deleteRecording
    const frameUrl = await fetchAndUpload({ bucket: 'frames', sourceUrl: image.url, path, contentType: 'image/jpeg' })
    await setStatus({ frame_url: frameUrl, frame_status: 'done', frame_at: new Date().toISOString() })
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
 * A photo card's picture: the best Unsplash match for its visual_query, hotlinked and credited, with the download
 * event sent. Nothing found, no query, or the search failing → the card becomes a text card (shape_set_by 'ivy'),
 * unless she chose photo herself (Change view), when it stays photo and shows its title until she picks again.
 * Returns whether a photo was set.
 */
export async function photoForCard(creatorId: string, cardId: string, palette?: string[], people?: string[]): Promise<boolean> {
  const supabase = db()
  const { data: card, error } = await supabase
    .from('cards')
    .select('id, recording_id, visual_query, title, shape_set_by')
    .eq('id', cardId)
    .eq('creator_id', creatorId)
    .single()
  if (error || !card) throw new Error(`card ${cardId}: ${error?.message ?? 'missing'}`)
  if (!palette) {
    const { data: pack } = await supabase.from('style_packs').select('palette').eq('creator_id', creatorId).maybeSingle()
    palette = (pack?.palette as string[] | undefined) ?? []
  }

  const guarded = stripPeople((card.visual_query as string | null)?.trim() ?? '', people ?? (await peopleFor(supabase, creatorId, card.recording_id as string | null)))
  if (guarded.removed) console.warn(`[frames] card ${cardId}: removed ${guarded.removed} name word(s) from visual_query before Unsplash`)
  const query = guarded.text || null
  const update = async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from('cards').update(fields).eq('id', cardId)
    if (error) throw new Error(`card ${cardId}: ${error.message}`)
  }
  const miss = (why: string) => {
    console.log(`[frames] card ${cardId}: no photo (${why})`)
    return card.shape_set_by === 'creator'
      ? update({ frame_status: 'typographic' })
      : update({ shape: 'text', shape_set_by: 'ivy', frame_status: 'typographic' })
  }

  if (!query) {
    await miss('no visual_query')
    return false
  }
  await update({ frame_status: 'queued' })
  try {
    const photo = await searchPhoto(query, palette)
    if (!photo) {
      await miss(`nothing for "${query}"`)
      return false
    }
    await update({
      frame_url: photo.url,
      frame_status: 'done',
      frame_at: new Date().toISOString(),
      frame_attribution: photo.attribution,
    })
    await trackDownload(photo.attribution.download_location)
    console.log(`[frames] card ${cardId}: Unsplash ${photo.attribution.photo_id} for "${query}"`)
    return true
  } catch (err) {
    console.error(`[frames] card ${cardId}: Unsplash failed`, err)
    await miss('search failed').catch(() => {})
    return false
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

  const { data: actions, error: aErr } = await supabase
    .from('actions')
    .select('id, frame_brief')
    .eq('recording_id', recordingId)
    .eq('frame_status', 'none')
  if (aErr) throw new Error(`actions for ${recordingId}: ${aErr.message}`)
  const { data: cards, error: cErr } = await supabase
    .from('cards')
    .select('id, shape')
    .eq('recording_id', recordingId)
    .eq('frame_status', 'none')
  if (cErr) throw new Error(`cards for ${recordingId}: ${cErr.message}`)

  const people = await peopleFor(supabase, creatorId, recordingId)

  // To-dos first and one at a time, so two to-dos with the same brief share one generation.
  for (const a of actions ?? []) await frameOne(creatorId, pack, { kind: 'action', id: a.id as string, brief: a.frame_brief as string | null }, people)

  await Promise.all(
    (cards ?? []).map(async (c) => {
      try {
        if (c.shape === 'photo') await photoForCard(creatorId, c.id as string, pack.palette as string[], people)
        else {
          const { error } = await supabase.from('cards').update({ frame_status: 'typographic' }).eq('id', c.id)
          if (error) throw new Error(error.message)
        }
      } catch (err) {
        console.error(`[frames] card ${c.id} failed`, err)
      }
    })
  )
}
