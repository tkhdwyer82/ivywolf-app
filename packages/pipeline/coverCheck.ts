// packages/pipeline/coverCheck.ts
// The lettering check for a generated cover (B.12, covers.ts step c): the prompt says "no text, no logos", but the
// image model sometimes prints a brand name or a slogan anyway. A small vision call looks at the result; a cover with
// visible writing or a mark is rejected and drawn once more. Prompt: prompts/cover_lettering_v1.md.
// Only the generated picture is sent — nothing of hers.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

export const CHECK_MODEL = 'claude-haiku-5-5'
const PROMPT = new URL('./prompts/cover_lettering_v1.md', import.meta.url)
const Out = z.object({ lettering: z.boolean(), what: z.string() })
export type LetteringVerdict = z.infer<typeof Out>

let client: Anthropic | undefined

/** Whether a JPEG shows any writing or brand mark. Throws if the check itself can't run. */
export async function checkLettering(jpeg: Buffer): Promise<LetteringVerdict> {
  client ??= new Anthropic()
  const response = await client.beta.messages.parse({
    model: CHECK_MODEL,
    max_tokens: 300,
    system: [{ type: 'text', text: readFileSync(fileURLToPath(PROMPT), 'utf8'), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } }] }],
    output_config: { format: betaZodOutputFormat(Out) },
  })
  if (!response.parsed_output) throw new Error(`lettering check: no answer (${response.stop_reason})`)
  return response.parsed_output
}
