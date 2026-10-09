// packages/pipeline/generate/routes/higgsfield.ts
// Higgsfield over REST (api.higgsfield.ai). Auth: `Authorization: Key <id>:<secret>` — HIGGSFIELD_API_KEY holds
// "<id>:<secret>". Estimate: POST /estimate/<endpoint> with the same body → { credits, usd } (strings). Submit:
// POST /<endpoint> with an Idempotency-Key → { request_id, status_url }. Then poll status_url: 2 s, ×1.5, ≤ 10 s, with
// jitter, until completed | failed | nsfw | canceled. Failed, nsfw and canceled requests are not charged (docs:
// billing-and-retention). Webhooks (hf_webhook) come with the server route; polling stays as recovery.

import type { Estimate, Outcome, Route, Terminal } from '../types'
import { videoTokens } from '../pricing'

export { dimensions } from '../pricing'

const BASE = 'https://api.higgsfield.ai'
const TERMINAL = new Set<Terminal>(['completed', 'failed', 'nsfw', 'canceled'])

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[A-Za-z0-9]+$/i

/** HIGGSFIELD_API_KEY is "<key id>:<secret>" exactly — anything else (a label in front) is rejected here, not sent. */
export function credentials(raw: string): string {
  const v = raw.trim()
  if (!KEY.test(v)) throw new Error('HIGGSFIELD_API_KEY must be "<key id>:<secret>" (no label in front)')
  return v
}

function headers(extra: Record<string, string> = {}) {
  const key = process.env.HIGGSFIELD_API_KEY
  if (!key) throw new Error('HIGGSFIELD_API_KEY is not set')
  return { Authorization: `Key ${credentials(key)}`, 'Content-Type': 'application/json', ...extra }
}

async function json<T>(res: Response, what: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) throw new Error(`higgsfield ${what} ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text) as T
}

/**
 * Some endpoints (Seedance 2.5) answer the estimate with a pricing description instead of a figure: video tokens =
 * ceil(height × width × seconds × 24 / 1024), priced per 1,000 tokens by resolution tier. The rate is read from the
 * description; if its wording changes the route refuses to price (and so never runs) rather than guess.
 */
export function tokenPrice(description: string, body: Record<string, unknown>): number {
  const resolution = String(body.resolution ?? '720p')
  if (!/ceil\(output height × output width × \(input video duration \+ generated video duration\) × 24 \/ 1024\)/.test(description))
    throw new Error('higgsfield estimate: unrecognised token formula')
  const m = /Each 1,000 video tokens costs \$([\d.]+) at 480p or 720p and \$([\d.]+) at 1080p/.exec(description)
  if (!m) throw new Error('higgsfield estimate: unrecognised token rates')
  const rate = resolution === '1080p' ? Number(m[2]) : Number(m[1])
  const tokens = videoTokens(body)
  return Math.round(((tokens / 1000) * rate) * 10_000) / 10_000
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const higgsfield: Route = {
  name: 'higgsfield',
  live: true,

  async estimate(endpoint, body): Promise<Estimate> {
    const res = await fetch(`${BASE}/estimate/${endpoint}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
    const e = await json<{ usd?: string | number; credits?: string | number; type?: string; pricing_description?: string }>(res, 'estimate')
    if (e.type === 'description' && e.pricing_description) return { usd: tokenPrice(e.pricing_description, body), credits: null, source: 'pricing_formula' }
    const usd = Number(e.usd)
    if (!Number.isFinite(usd)) throw new Error(`higgsfield estimate: no usd in ${JSON.stringify(e).slice(0, 200)}`)
    return { usd, credits: e.credits == null ? null : Number(e.credits), source: 'provider' }
  },

  async submit(endpoint, body, idempotencyKey) {
    const res = await fetch(`${BASE}/${endpoint}`, {
      method: 'POST',
      headers: headers({ 'Idempotency-Key': idempotencyKey }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
    const r = await json<{ request_id: string }>(res, 'submit')
    if (!r.request_id) throw new Error('higgsfield submit: no request_id')
    return { requestId: r.request_id }
  },

  async wait({ requestId }, timeoutMs): Promise<Outcome> {
    const until = Date.now() + timeoutMs
    let delay = 2000
    for (;;) {
      const res = await fetch(`${BASE}/requests/${requestId}/status`, { headers: headers(), signal: AbortSignal.timeout(30_000) }).catch(() => null)
      if (res && (res.status === 401 || res.status === 404)) return { status: 'failed', outputUrl: null, error: `status ${res.status}` }
      if (res?.ok) {
        const s = (await res.json()) as { status: string; error?: unknown; video?: { url?: string }; images?: { url?: string }[] }
        if (TERMINAL.has(s.status as Terminal)) {
          return {
            status: s.status as Terminal,
            outputUrl: s.video?.url ?? s.images?.[0]?.url ?? null,
            error: s.error == null ? null : typeof s.error === 'string' ? s.error : JSON.stringify(s.error).slice(0, 500),
          }
        }
      } // 5xx or a network failure: keep polling with backoff
      if (Date.now() > until) return { status: 'failed', outputUrl: null, error: `timed out after ${Math.round(timeoutMs / 1000)} s (request ${requestId} may still finish)` }
      await sleep(delay + Math.random() * 500)
      delay = Math.min(delay * 1.5, 10_000)
    }
  },
}
