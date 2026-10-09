// packages/pipeline/generate/routes/higgsfield.ts
// Higgsfield over REST (api.higgsfield.ai). Auth: `Authorization: Key <id>:<secret>` — HIGGSFIELD_API_KEY holds
// "<id>:<secret>". Estimate: POST /estimate/<endpoint> with the same body → { credits, usd } (strings). Submit:
// POST /<endpoint> with an Idempotency-Key → { request_id, status_url }. Then poll status_url: 2 s, ×1.5, ≤ 10 s, with
// jitter, until completed | failed | nsfw | canceled. Failed, nsfw and canceled requests are not charged (docs:
// billing-and-retention). Webhooks (hf_webhook) come with the server route; polling stays as recovery.

import type { Estimate, Outcome, Route, Terminal } from '../types'

const BASE = 'https://api.higgsfield.ai'
const TERMINAL = new Set<Terminal>(['completed', 'failed', 'nsfw', 'canceled'])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * "<key id>:<secret>". The stored value may carry a short label in front ("<label>:<key id>:<secret>", as the
 * ivywolf-api env does) — the API rejects that with 401, so the label is dropped when the middle part is a key id.
 */
export function credentials(raw: string): string {
  const parts = raw.trim().split(':')
  return parts.length === 3 && UUID.test(parts[1]) ? `${parts[1]}:${parts[2]}` : raw.trim()
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const higgsfield: Route = {
  name: 'higgsfield',
  live: true,

  async estimate(endpoint, body): Promise<Estimate> {
    const res = await fetch(`${BASE}/estimate/${endpoint}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
    const e = await json<{ usd: string | number; credits?: string | number }>(res, 'estimate')
    const usd = Number(e.usd)
    if (!Number.isFinite(usd)) throw new Error(`higgsfield estimate: no usd in ${JSON.stringify(e).slice(0, 200)}`)
    return { usd, credits: e.credits == null ? null : Number(e.credits) }
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

  async wait(requestId, timeoutMs): Promise<Outcome> {
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
