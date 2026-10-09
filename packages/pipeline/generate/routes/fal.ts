// packages/pipeline/generate/routes/fal.ts
// fal over its queue REST API (Job H.0b). Auth: `Authorization: Key <FAL_KEY>`.
//   Estimate: POST api.fal.ai/v1/models/pricing/estimate { estimate_type: 'unit_price', endpoints: { <id>: { unit_quantity } } }
//             → { total_cost } — units are the endpoint's billing unit (Kling v3: seconds; Seedance 2.5: 1,000 tokens).
//   Submit:   POST queue.fal.run/<endpoint> → { request_id, status_url, response_url }.
//   Wait:     GET status_url until COMPLETED (2 s, ×1.5, ≤ 10 s), then GET response_url: the result, or an error
//             status for a failed request (fal doesn't bill failures).
//   Actual:   GET api.fal.ai/v1/models/billing-events?request_id=… → cost_total (after discount). That endpoint needs
//             an admin key (FAL_ADMIN_KEY); without one the actual cost is unknown and the gateway uses the estimate.
// Only the brief and the request parameters are sent — never a name (redact.ts runs first), never another creator's data.

import type { Estimate, Outcome, Route } from '../types'

const API = 'https://api.fal.ai/v1'
const QUEUE = 'https://queue.fal.run'

function key(admin = false): string {
  const k = admin ? process.env.FAL_ADMIN_KEY : process.env.FAL_KEY
  if (!k) throw new Error(`${admin ? 'FAL_ADMIN_KEY' : 'FAL_KEY'} is not set`)
  return k.trim()
}
const headers = (admin = false) => ({ Authorization: `Key ${key(admin)}`, 'Content-Type': 'application/json' })

async function json<T>(res: Response, what: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) throw new Error(`fal ${what} ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text) as T
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const fal: Route = {
  name: 'fal',
  live: true,

  async estimate(endpoint, _body, units): Promise<Estimate> {
    if (units == null || !Number.isFinite(units) || units <= 0) throw new Error(`fal estimate: no billing units for ${endpoint}`)
    const res = await fetch(`${API}/models/pricing/estimate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ estimate_type: 'unit_price', endpoints: { [endpoint]: { unit_quantity: units } } }),
      signal: AbortSignal.timeout(30_000),
    })
    const e = await json<{ total_cost?: number }>(res, 'estimate')
    if (typeof e.total_cost !== 'number') throw new Error(`fal estimate: no total_cost in ${JSON.stringify(e).slice(0, 200)}`)
    return { usd: Math.round(e.total_cost * 10_000) / 10_000, credits: null, source: 'provider' }
  },

  async submit(endpoint, body) {
    // fal's queue has no idempotency key; generate() writes the run row before submitting, so a retry is visible.
    const res = await fetch(`${QUEUE}/${endpoint}`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) })
    const r = await json<{ request_id: string; status_url: string; response_url: string }>(res, 'submit')
    if (!r.request_id || !r.status_url || !r.response_url) throw new Error('fal submit: incomplete queue response')
    return { requestId: r.request_id, statusUrl: r.status_url, resultUrl: r.response_url }
  },

  async wait({ requestId, statusUrl, resultUrl }, timeoutMs): Promise<Outcome> {
    if (!statusUrl || !resultUrl) return { status: 'failed', outputUrl: null, error: 'fal: no status/result URL' }
    const until = Date.now() + timeoutMs
    let delay = 2000
    for (;;) {
      const res = await fetch(statusUrl, { headers: headers(), signal: AbortSignal.timeout(30_000) }).catch(() => null)
      if (res && (res.status === 401 || res.status === 404)) return { status: 'failed', outputUrl: null, error: `status ${res.status}` }
      if (res?.ok) {
        const s = (await res.json()) as { status: string }
        if (s.status === 'COMPLETED') {
          const out = await fetch(resultUrl, { headers: headers(), signal: AbortSignal.timeout(60_000) })
          const text = await out.text()
          if (!out.ok) {
            const nsfw = /content.?(policy|moderation)|nsfw|safety/i.test(text)
            return { status: nsfw ? 'nsfw' : 'failed', outputUrl: null, error: `fal ${out.status}: ${text.slice(0, 500)}` }
          }
          const r = JSON.parse(text) as { video?: { url?: string }; images?: { url?: string }[]; image?: { url?: string } }
          const url = r.video?.url ?? r.images?.[0]?.url ?? r.image?.url ?? null
          return url ? { status: 'completed', outputUrl: url, error: null } : { status: 'failed', outputUrl: null, error: 'fal: completed with no output' }
        }
      }
      if (Date.now() > until) return { status: 'failed', outputUrl: null, error: `timed out after ${Math.round(timeoutMs / 1000)} s (request ${requestId} may still finish)` }
      await sleep(delay + Math.random() * 500)
      delay = Math.min(delay * 1.5, 10_000)
    }
  },

  async actualCost(requestId) {
    if (!process.env.FAL_ADMIN_KEY) return null
    // Billing events can trail the result by a little; ask a few times.
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${API}/models/billing-events?request_id=${encodeURIComponent(requestId)}`, { headers: headers(true), signal: AbortSignal.timeout(30_000) }).catch(() => null)
      if (res?.ok) {
        const b = (await res.json()) as { billing_events?: { request_id: string; cost_total?: number }[] }
        const e = b.billing_events?.find((x) => x.request_id === requestId)
        if (e && typeof e.cost_total === 'number') return e.cost_total
      }
      await sleep(5000)
    }
    return null
  },
}
