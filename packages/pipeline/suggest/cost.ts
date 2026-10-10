// packages/pipeline/suggest/cost.ts
// What one generation cost, in US cents, from the response's usage. Prices per million tokens, Anthropic first-party
// rates (claude-api reference, cached 2026-10-06). Cache writes are 1.25× input (5-minute TTL), cache reads as listed.
// The model is the one that served the response (a refusal fallback may answer on another model).

const PER_MTOK: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
}

export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

/** Cents, to 4 decimal places; null for a model not in the table (logged as unknown, never guessed). */
export function costCents(model: string, u: Usage): number | null {
  const p = PER_MTOK[model] ?? PER_MTOK[model.replace(/-\d{8}$/, '')]
  if (!p) return null
  const usd =
    (u.input_tokens * p.input +
      (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      u.output_tokens * p.output) /
    1_000_000
  return Math.round(usd * 100 * 10_000) / 10_000
}
