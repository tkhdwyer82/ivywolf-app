// packages/pipeline/generate/models.ts
// The model registry. Each model lists its routes in order; each route names the exact version it serves. To add fal
// or a direct API for a model, append a route with the same `version` and the gateway starts estimating it too.
// Only Higgsfield is live in Job H.0a (routes/index.ts).
//
// Endpoints and fields: docs.higgsfield.ai, read 2026-10-09 —
//   Kling 3.0 Standard · Text to video   kling-video/v3.0/std/text-to-video   duration 3–15 (default 5), aspect 16:9|9:16|1:1
//   Seedance 2.5 · Text to video         bytedance/seedance-2.5/text-to-video duration 4–30, 480p|720p|1080p
//   SOUL V2 · Text to image              higgsfield-ai/soul/v2/standard       custom_reference_id = a Soul ID (v2) it owns

import type { Model, Ref } from './types'

const character = (refs: Ref[], route: 'higgsfield') => refs.find((r) => r.kind === 'character' && r.ids[route]) as Extract<Ref, { kind: 'character' }> | undefined
/** Text-to-video routes take no media: any ref makes them ineligible rather than silently dropped. */
const textOnly = (refs: Ref[]) => refs.length === 0

export const MODELS: Record<string, Model> = {
  'kling-3.0-std-t2v': {
    key: 'kling-3.0-std-t2v',
    label: 'Kling 3.0 · Standard · text to video',
    kind: 'video',
    version: 'kling-3.0-std',
    defaults: { duration: 5, aspect_ratio: '9:16', sound: 'off' },
    routes: [
      {
        route: 'higgsfield',
        endpoint: 'kling-video/v3.0/std/text-to-video',
        version: 'kling-3.0-std',
        body: (brief, refs, p) => (textOnly(refs) ? { prompt: brief, duration: p.duration, aspect_ratio: p.aspect_ratio, sound: p.sound } : null),
      },
    ],
  },
  'seedance-2.5-t2v': {
    key: 'seedance-2.5-t2v',
    label: 'Seedance 2.5 · text to video',
    kind: 'video',
    version: 'seedance-2.5',
    defaults: { duration: 5, aspect_ratio: '9:16', resolution: '720p', generate_audio: false },
    routes: [
      {
        route: 'higgsfield',
        endpoint: 'bytedance/seedance-2.5/text-to-video',
        version: 'seedance-2.5',
        body: (brief, refs, p) =>
          textOnly(refs) ? { prompt: brief, duration: p.duration, aspect_ratio: p.aspect_ratio, resolution: p.resolution, generate_audio: p.generate_audio } : null,
      },
    ],
  },
  'soul-2': {
    key: 'soul-2',
    label: 'SOUL V2 · text to image',
    kind: 'image',
    version: 'soul-2',
    defaults: { aspect_ratio: '3:4', resolution: '720p', batch_size: 1, enhance_prompt: false },
    routes: [
      {
        route: 'higgsfield',
        endpoint: 'higgsfield-ai/soul/v2/standard',
        version: 'soul-2',
        body: (brief, refs, p) => {
          const c = character(refs, 'higgsfield')
          // Only a character ref is understood here; anything else (an image URL) makes the route ineligible.
          if (refs.some((r) => r !== c)) return null
          return {
            prompt: brief,
            aspect_ratio: p.aspect_ratio,
            resolution: p.resolution,
            batch_size: p.batch_size,
            enhance_prompt: p.enhance_prompt,
            // The runtime can't process strength 0 for a character reference (docs): keep it in (0, 1].
            ...(c ? { custom_reference_id: c.ids.higgsfield, custom_reference_strength: Math.min(1, Math.max(0.05, c.strength ?? 1)) } : {}),
          }
        },
      },
    ],
  },
}
