// packages/pipeline/embed.ts
// Voyage voyage-3 embeddings (1024-d, unit length). Only one creator's card text is ever sent in a call
// (CLAUDE.md: never send other creators' data to any adapter); the privacy policy lists what Voyage receives.

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings'
export const EMBEDDING_MODEL = 'voyage-3'
export const EMBEDDING_DIMS = 1024

/** The text a card is embedded as. Keep in one place: the eval and the pipeline must embed identically. */
export const cardText = (card: { title: string; gist: string }) => `${card.title}\n${card.gist}`

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const key = process.env.VOYAGE_API_KEY
  if (!key) throw new Error('VOYAGE_API_KEY is not set')

  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: texts, model: EMBEDDING_MODEL, input_type: 'document' }),
  })
  if (!res.ok) throw new Error(`Voyage failed: ${res.status} ${await res.text()}`)

  const body = (await res.json()) as { data: { index: number; embedding: number[] }[] }
  const out = body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
  if (out.length !== texts.length || out.some((e) => e.length !== EMBEDDING_DIMS)) {
    throw new Error(`Voyage returned ${out.length} embeddings for ${texts.length} inputs`)
  }
  return out
}
