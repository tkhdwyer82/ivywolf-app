// packages/pipeline/generate/index.ts
// generate(model, brief, refs) — the one way Ivy makes an image or a clip (Job H.0a).
//
//   1. Guard the brief: the names of anyone heard are stripped before it leaves (redact.ts, as frames.ts does).
//   2. Estimate every live route that serves the model's version and can honour the refs; keep every estimate.
//   3. Run the cheapest (registry order breaks a tie). The run row is written before submitting, so a crash after
//      the provider accepted it still leaves a row with its request id to reconcile.
//   4. Wait (polling; webhooks come with the server route), copy the output into Supabase storage at once — the
//      provider's URL lasts ~7 days — and record latency (submit → terminal).
//   5. One credit_events row per run: what the provider charged. Higgsfield reports no per-request cost, so `actual`
//      is the pre-submit estimate when it completed and 0 when it failed / nsfw / canceled (its documented billing),
//      marked actual_source 'estimate_on_completion' to reconcile against the console.
//
// Never sends another creator's data: the brief and refs are this creator's, and character ids are scoped to the
// provider account (Soul IDs belong to the calling account).

import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { uploadBuffer } from '../storage'
import { stripPeople } from '../redact'
import { MODELS } from './models'
import { ROUTES } from './routes'
import type { Estimate, Model, ModelRoute, Ref, RouteName, Stage } from './types'

export { MODELS, defaultModel } from './models'
export type { Ref } from './types'

const TIMEOUT_MS: Record<Model['kind'], number> = { image: 5 * 60_000, video: 20 * 60_000 }

let client: SupabaseClient | undefined
const db = () => (client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }))

export interface Candidate {
  route: RouteName
  endpoint: string
  body: Record<string, unknown>
  /** Billing units for routes that price per unit (fal). */
  units?: number
}
export type Priced = Candidate & ({ estimate: Estimate; error?: never } | { estimate?: never; error: string })

/** The live routes that serve the model's version and accept these refs, in registry order. */
export function candidates(model: Model, brief: string, refs: Ref[], params: Record<string, unknown> = {}, live = (r: RouteName) => !!ROUTES[r]?.live): Candidate[] {
  const p = { ...model.defaults, ...params }
  return model.routes
    .filter((r: ModelRoute) => r.version === model.version && live(r.route))
    .flatMap((r) => {
      const body = r.body(brief, refs, p)
      return body ? [{ route: r.route, endpoint: r.endpoint, body, ...(r.units ? { units: r.units(p) } : {}) }] : []
    })
}

/** Prices this close are equal (estimates are kept to 4 dp). */
const SAME_PRICE = 0.00005
/** How many recent completed runs of a model on a route make its rolling latency. */
export const LATENCY_WINDOW = 10

/**
 * The cheapest priced candidate. Equal prices go to the route with the lower measured latency for this model (rolling
 * average, `latency`), then to the first listed — a route with no measurements yet loses a tie to one that has them
 * only on list order. Null when none could be priced.
 */
export function cheapest(priced: Priced[], latency: Partial<Record<RouteName, number>> = {}): (Candidate & { estimate: Estimate }) | null {
  let best: (Candidate & { estimate: Estimate }) | null = null
  for (const p of priced) {
    if (!p.estimate) continue
    const c = p as Candidate & { estimate: Estimate }
    if (!best) best = c
    else if (c.estimate.usd < best.estimate.usd - SAME_PRICE) best = c
    else if (Math.abs(c.estimate.usd - best.estimate.usd) <= SAME_PRICE) {
      const lc = latency[c.route]
      const lb = latency[best.route]
      if (lc != null && lb != null && lc < lb) best = c
    }
  }
  return best
}

/** Rolling average latency (ms) of the last LATENCY_WINDOW completed runs of a model, per route. */
export async function routeLatency(supabase: SupabaseClient, model: string, routes: RouteName[]): Promise<Partial<Record<RouteName, number>>> {
  const out: Partial<Record<RouteName, number>> = {}
  await Promise.all(
    routes.map(async (route) => {
      const { data } = await supabase
        .from('generation_runs')
        .select('latency_ms')
        .eq('model', model)
        .eq('route', route)
        .eq('status', 'completed')
        .not('latency_ms', 'is', null)
        .order('created_at', { ascending: false })
        .limit(LATENCY_WINDOW)
      const ms = (data ?? []).map((r) => r.latency_ms as number)
      if (ms.length) out[route] = ms.reduce((a, b) => a + b, 0) / ms.length
    })
  )
  return out
}

export interface GenerateArgs {
  creatorId: string
  model: string
  brief: string
  refs?: Ref[]
  params?: Record<string, unknown>
  /** The card it was made for, when there is one. */
  cardId?: string | null
  /** Names to strip from the brief (peopleFor()); the guard runs even when empty. */
  people?: string[]
  /**
   * Run on this route even if another is cheaper (side-by-side comparisons). Every route is still estimated and the
   * run records that it was forced. It must still serve the model's version.
   */
  route?: RouteName
  /**
   * preview: a take to choose between, at the model's preview resolution; final: the render she keeps. Only models
   * with resolution tiers differ (Seedance 2.5: 480p / 720p). An explicit params.resolution wins. Default: final.
   */
  stage?: Stage
}

/** The params a run actually uses: the stage's resolution, under any explicit params. */
export function stageParams(model: Model, stage: Stage = 'final', params: Record<string, unknown> = {}): Record<string, unknown> {
  return model.resolutions && params.resolution == null ? { ...params, resolution: model.resolutions[stage] } : params
}

export interface GenerateResult {
  runId: string
  status: string
  route: RouteName
  estimates: Priced[]
  estimateUsd: number
  actualUsd: number
  latencyMs: number | null
  outputUrl: string | null
  error: string | null
}

export async function generate(a: GenerateArgs): Promise<GenerateResult> {
  const model = MODELS[a.model]
  if (!model) throw new Error(`unknown model ${a.model}`)
  const guarded = stripPeople(a.brief.trim(), a.people ?? [])
  if (guarded.removed) console.warn(`[generate] removed ${guarded.removed} name word(s) from the brief before it left`)
  const brief = guarded.text
  if (!brief) throw new Error('empty brief')
  const refs = a.refs ?? []

  const params = stageParams(model, a.stage, a.params)
  const found = candidates(model, brief, refs, params)
  if (!found.length) throw new Error(`no live route for ${model.key} (${model.version}) that accepts these refs`)
  const priced: Priced[] = await Promise.all(
    found.map(async (c) => {
      try {
        return { ...c, estimate: await ROUTES[c.route]!.estimate(c.endpoint, c.body, c.units) }
      } catch (e) {
        return { ...c, error: e instanceof Error ? e.message : String(e) }
      }
    })
  )
  const supabase = db()
  const latency = a.route ? {} : await routeLatency(supabase, model.key, priced.filter((p) => p.estimate).map((p) => p.route))
  const pick = a.route ? (priced.find((p) => p.route === a.route && p.estimate) as (Candidate & { estimate: Estimate }) | undefined) ?? null : cheapest(priced, latency)
  if (!pick)
    throw new Error(
      a.route
        ? `route ${a.route} can't run ${model.key}: ${priced.find((p) => p.route === a.route)?.error ?? 'not a candidate'}`
        : `no route could be priced: ${priced.map((p) => `${p.route}: ${p.error}`).join('; ')}`
    )
  const route = ROUTES[pick.route]!

  const runId = randomUUID()
  const update = async (fields: Record<string, unknown>) => {
    const { error } = await supabase.from('generation_runs').update(fields).eq('id', runId)
    if (error) throw new Error(`generation_runs ${runId}: ${error.message}`)
  }
  {
    const { error } = await supabase.from('generation_runs').insert({
      id: runId,
      creator_id: a.creatorId,
      card_id: a.cardId ?? null,
      model: model.key,
      model_version: model.version,
      kind: model.kind,
      route: pick.route,
      endpoint: pick.endpoint,
      brief,
      refs,
      request_body: pick.body,
      estimates: priced.map((p) => ({
        route: p.route,
        endpoint: p.endpoint,
        usd: p.estimate?.usd ?? null,
        credits: p.estimate?.credits ?? null,
        source: p.estimate?.source ?? null,
        units: p.units ?? null,
        latency_ms: latency[p.route] != null ? Math.round(latency[p.route]!) : null,
        stage: a.stage ?? 'final',
        error: p.error ?? null,
        chosen: p.route === pick.route ? (a.route ? 'forced' : 'cheapest') : null,
      })),
      estimate_usd: pick.estimate.usd,
      estimate_credits: pick.estimate.credits,
      status: 'submitting',
    })
    if (error) throw new Error(`generation_runs insert: ${error.message}`)
  }

  const submittedAt = Date.now()
  let handle: Awaited<ReturnType<typeof route.submit>>
  try {
    handle = await route.submit(pick.endpoint, pick.body, runId) // the run id is the idempotency key, where the route takes one
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await update({ status: 'failed', error: message.slice(0, 2000), actual_usd: 0, actual_credits: 0, actual_source: 'not_submitted' })
    await creditEvent(supabase, a.creatorId, runId, pick, model, 'failed', 0, 0)
    throw e
  }
  await update({ status: 'queued', request_id: handle.requestId, submitted_at: new Date(submittedAt).toISOString() })

  const outcome = await route.wait(handle, TIMEOUT_MS[model.kind])
  const doneAt = Date.now()
  const charged = outcome.status === 'completed'
  // What the route says it charged, when it can say (fal with an admin key); else the estimate on completion.
  const reported = charged && route.actualCost ? await route.actualCost(handle.requestId).catch(() => null) : null
  const actualUsd = !charged ? 0 : reported ?? pick.estimate.usd
  const actualCredits = charged ? (reported != null ? null : pick.estimate.credits) : 0
  const actualSource = !charged ? 'not_charged' : reported != null ? 'provider_billing' : pick.estimate.source === 'provider' ? 'estimate_on_completion' : 'pricing_formula_on_completion'

  let outputUrl: string | null = null
  let copyError: string | null = null
  if (charged && outcome.outputUrl) {
    try {
      const res = await fetch(outcome.outputUrl, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`fetch output ${res.status}`)
      const type = res.headers.get('content-type') ?? (model.kind === 'video' ? 'video/mp4' : 'image/jpeg')
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('quicktime') ? 'mov' : model.kind === 'video' ? 'mp4' : 'jpg'
      const buffer = await res.arrayBuffer()
      const path = `${a.creatorId}/generations/${runId}.${ext}`
      outputUrl = await uploadBuffer({ bucket: 'frames', buffer, path, contentType: type })
      await update({ output_path: path, output_url: outputUrl, output_bytes: buffer.byteLength, content_type: type })
    } catch (e) {
      copyError = e instanceof Error ? e.message : String(e)
    }
  }

  const status = charged && !outputUrl ? 'copy_failed' : outcome.status
  const error = outcome.error ?? copyError
  await update({
    status,
    error: error?.slice(0, 2000) ?? null,
    completed_at: new Date(doneAt).toISOString(),
    latency_ms: doneAt - submittedAt,
    provider_output_url: outcome.outputUrl,
    actual_usd: actualUsd,
    actual_credits: actualCredits,
    actual_source: actualSource,
  })
  await creditEvent(supabase, a.creatorId, runId, pick, model, outcome.status, actualUsd, actualCredits)

  return { runId, status, route: pick.route, estimates: priced, estimateUsd: pick.estimate.usd, actualUsd, latencyMs: doneAt - submittedAt, outputUrl, error }
}

async function creditEvent(
  supabase: SupabaseClient,
  creatorId: string,
  runId: string,
  pick: Candidate & { estimate: Estimate },
  model: Model,
  outcome: string,
  usd: number,
  credits: number | null
) {
  const { error } = await supabase.from('credit_events').insert({
    creator_id: creatorId,
    run_id: runId,
    route: pick.route,
    model: model.key,
    outcome,
    estimate_usd: pick.estimate.usd,
    usd,
    provider_credits: credits,
  })
  if (error) console.error(`[generate] credit_events for ${runId}: ${error.message}`)
}
