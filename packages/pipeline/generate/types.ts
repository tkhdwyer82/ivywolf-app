// packages/pipeline/generate/types.ts
// The generation gateway's shapes (Job H.0a). A model is what the creator asks for ("Kling 3.0, 5 s"); a route is who
// runs it (higgsfield, later fal or the model's own API). Every route of a model names the exact model version it
// serves, and generate() only ever chooses between routes serving the same version.

export type RouteName = 'higgsfield' | 'fal' | 'direct'
export type OutputKind = 'image' | 'video'

/**
 * What the generation is anchored to.
 *   character — a trained character, by each route's own id for it (Higgsfield: a Soul ID custom_reference_id).
 *   image     — a public image URL (a frame, a style reference).
 * A route that can't honour every ref is not a candidate.
 */
export type Ref = { kind: 'character'; ids: Partial<Record<RouteName, string>>; strength?: number } | { kind: 'image'; url: string }

export interface Estimate {
  usd: number
  /** The route's own unit, when it has one (Higgsfield credits). */
  credits: number | null
  /** 'provider': the route priced this request. 'pricing_formula': computed from the route's published formula. */
  source: 'provider' | 'pricing_formula'
}

export type Terminal = 'completed' | 'failed' | 'nsfw' | 'canceled'

export interface Outcome {
  status: Terminal
  /** The provider's temporary output URL (Higgsfield keeps it ≥ 7 days); copied to our storage at once. */
  outputUrl: string | null
  error: string | null
}

/** One way to run one model version. `body` builds the provider's request from the brief, refs and params. */
export interface ModelRoute {
  route: RouteName
  endpoint: string
  version: string
  body: (brief: string, refs: Ref[], params: Record<string, unknown>) => Record<string, unknown> | null
}

/**
 * default: what Ivy uses unless asked — exactly one per kind. fast: quicker and cheaper, offered as such.
 * premium: offered with its price shown, never chosen silently.
 */
export type Tier = 'default' | 'fast' | 'premium'

/** A reference price for showing next to a premium model: what one run at the defaults cost, and how we know. */
export interface PriceNote {
  usd: number
  for: string
  source: 'provider' | 'pricing_formula'
  checked: string
}

export interface Model {
  /** Registry key, e.g. 'kling-3.0-std-t2v'. */
  key: string
  label: string
  kind: OutputKind
  tier: Tier
  price: PriceNote
  /** The version every route must serve. */
  version: string
  /** In order of preference; the cheapest estimate wins, and order breaks a tie. */
  routes: ModelRoute[]
  defaults: Record<string, unknown>
}

/** A provider. Only live routes are estimated or run. */
export interface Route {
  name: RouteName
  live: boolean
  estimate(endpoint: string, body: Record<string, unknown>): Promise<Estimate>
  submit(endpoint: string, body: Record<string, unknown>, idempotencyKey: string): Promise<{ requestId: string }>
  /** Until a terminal state or the timeout (then 'failed' with the reason). */
  wait(requestId: string, timeoutMs: number): Promise<Outcome>
}
