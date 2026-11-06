// packages/pipeline/inspirationTag.ts
// The indexer's model calls for the inspiration demo (inspiration.ts): Claude tags one picture, Voyage embeds it.
// Kept apart from inspiration.ts so the web routes that search the library don't load the Anthropic SDK or prompts.
//
// image_embedding is voyage-multimodal-3.5: fal has no CLIP endpoint (checked 2026-11-06); Voyage's multimodal model
// is CLIP-style (one space for images and text), 1024-d.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { PEOPLE } from './inspiration'

export const IMAGE_EMBEDDING_MODEL = 'voyage-multimodal-3.5'
export const IMAGE_EMBEDDING_DIMS = 1024
const TAG_MODEL = 'claude-opus-5-5'
/**
 * v2 added `people` (the first 37 photos were tagged with v1, `people` backfilled with v2, captions kept); v3 tags a
 * video from three frames instead of its first.
 */
const TAG_PROMPT = new URL('./prompts/inspiration_tag_v3.md', import.meta.url)

const SHOTS = ['product', 'detail', 'flat_lay', 'in_hand', 'on_body', 'lifestyle', 'editorial', 'graphic'] as const
const TagOutput = z.object({
  caption: z.string(),
  keywords: z.array(z.string()),
  colours: z.array(z.string()),
  shot: z.enum(SHOTS),
  people: z.enum(PEOPLE),
})
export type Tags = z.infer<typeof TagOutput>

/** Holds the prompt's limits whatever the model returns. Throws if there's too little to keep. */
export function enforceTags(t: Tags): Tags {
  const words = t.caption.trim().split(/\s+/)
  const caption = words.length > 20 ? words.slice(0, 20).join(' ').replace(/[,;:]$/, '') : t.caption.trim()
  const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))]
  const keywords = clean(t.keywords).slice(0, 12)
  const colours = clean(t.colours).slice(0, 3)
  if (!caption || keywords.length < 8 || colours.length < 3) {
    throw new Error(`tags too thin: ${keywords.length} keywords, ${colours.length} colours`)
  }
  return { caption, keywords, colours, shot: t.shot, people: t.people }
}

let client: Anthropic | undefined

/** One JPEG for a photo; a video's frames, in order. */
export async function tagPicture(jpegs: Buffer[]): Promise<Tags> {
  client ??= new Anthropic()
  // Server-side fallback: if Opus 5.5 declines, the API re-runs the same request on a fallback model in-call.
  const response = await client.beta.messages.parse({
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    model: TAG_MODEL,
    max_tokens: 2000,
    system: [{ type: 'text', text: readFileSync(fileURLToPath(TAG_PROMPT), 'utf8'), cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: jpegs.map((j) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: j.toString('base64') } })),
      },
    ],
    output_config: { effort: 'low', format: betaZodOutputFormat(TagOutput) },
  })
  if (response.stop_reason === 'refusal') throw new Error(`tag refused: ${response.stop_details?.category ?? 'unknown'}`)
  if (response.stop_reason === 'max_tokens') throw new Error('tag hit max_tokens')
  if (!response.parsed_output) throw new Error('tag returned no parseable output')
  return enforceTags(response.parsed_output)
}

/** voyage-multimodal-3.5 of one JPEG, as a stored document. */
export async function embedPicture(jpeg: Buffer): Promise<number[]> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) throw new Error('VOYAGE_API_KEY is not set')
  const res = await fetch('https://api.voyageai.com/v1/multimodalembeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: IMAGE_EMBEDDING_MODEL,
      input_type: 'document',
      inputs: [{ content: [{ type: 'image_base64', image_base64: `data:image/jpeg;base64,${jpeg.toString('base64')}` }] }],
    }),
  })
  if (!res.ok) throw new Error(`Voyage multimodal failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { data: { embedding: number[] }[] }
  const e = body.data[0]?.embedding
  if (e?.length !== IMAGE_EMBEDDING_DIMS) throw new Error(`Voyage multimodal returned ${e?.length ?? 0} dims`)
  return e
}
