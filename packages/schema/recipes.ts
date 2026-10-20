// packages/schema/recipes.ts
// Recipes (Job B.10, 0042): a creator's how-to as 3–8 steps another creator applies to her own idea. Shared by the
// pipeline (validates what the model returns), the API (prices and guards) and the app (shows the price first).
// Pure: no database, no model.

import { z } from 'zod'

export const RecipeShape = z.enum(['playbook', 'system', 'lens'])
export type RecipeShape = z.infer<typeof RecipeShape>
export const RecipeStatus = z.enum(['draft_private', 'invited', 'published', 'retired'])
export type RecipeStatus = z.infer<typeof RecipeStatus>
export const MakeKind = z.enum(['write', 'still', 'video', 'cut', 'none'])
export type MakeKind = z.infer<typeof MakeKind>
export const RecipePlatform = z.enum(['instagram', 'tiktok', 'youtube'])
export type RecipePlatform = z.infer<typeof RecipePlatform>

export const MIN_STEPS = 3
export const MAX_STEPS = 8
/** The extraction prompt's limits (recipe_extract_v1). */
export const STEP_TITLE_WORDS = 6
export const STEP_WHY_WORDS = 20
/** No more than this many consecutive words of the source in anything we store. */
export const MAX_QUOTED_RUN = 12
/** apply: a card's body. */
export const CARD_BODY_WORDS = 60

const wordList = (t: string) =>
  t
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
export const wordCount = (t: string) => wordList(t).length

/** "Write…", "Make…", "Pick…", "Cut…" — one imperative the app can run. */
export const VERB = /^(Write|Make|Pick|Cut)\b/

/** What the model returns: loose, so the structured-output grammar stays small. RecipeDraft is the gate. */
export const RecipeExtractOutput = z.object({
  title: z.string(),
  shape: RecipeShape,
  steps: z.array(z.object({ title: z.string(), verb: z.string(), why: z.string(), make_kind: MakeKind })),
})
export type RecipeExtractOutput = z.infer<typeof RecipeExtractOutput>

export const RecipeStep = z.object({
  title: z.string().trim().min(1).refine((t) => wordCount(t) <= STEP_TITLE_WORDS, `title over ${STEP_TITLE_WORDS} words`),
  verb: z.string().trim().regex(VERB, 'verb must start Write, Make, Pick or Cut'),
  why: z.string().trim().min(1).refine((t) => wordCount(t) <= STEP_WHY_WORDS, `why over ${STEP_WHY_WORDS} words`),
  make_kind: MakeKind,
})
export type RecipeStep = z.infer<typeof RecipeStep>

/** A recipe we'll store: a title and 3–8 clean steps. */
export const RecipeDraft = z.object({
  title: z.string().trim().min(1),
  shape: RecipeShape,
  steps: z.array(RecipeStep).min(MIN_STEPS).max(MAX_STEPS),
})
export type RecipeDraft = z.infer<typeof RecipeDraft>

/** The longest run of consecutive words `text` shares with `source`. */
export function longestSharedRun(text: string, source: string): number {
  const a = wordList(text)
  const b = wordList(source)
  if (!a.length || !b.length) return 0
  let best = 0
  let prev = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1
        if (cur[j] > best) best = cur[j]
      }
    }
    prev = cur
  }
  return best
}

export type ExtractResult = { ok: true; draft: RecipeDraft; dropped: number } | { ok: false; reason: 'too_few_steps' | 'too_many_steps' | 'no_title'; kept: number }

/**
 * The gate after the model: each step must pass RecipeStep and quote no more than MAX_QUOTED_RUN consecutive words of
 * the source; steps that fail are dropped. Fewer than MIN_STEPS clean steps → not a recipe (the caller falls back to
 * Save as idea). More than MAX_STEPS → rejected, never trimmed: the model ignored the brief.
 */
export function validateExtraction(out: RecipeExtractOutput, sourceText: string): ExtractResult {
  const clean = out.steps
    .map((s) => RecipeStep.safeParse(s))
    .filter((r) => r.success)
    .map((r) => r.data)
    .filter((s) => [s.title, s.verb, s.why].every((t) => longestSharedRun(t, sourceText) <= MAX_QUOTED_RUN))
  if (clean.length < MIN_STEPS) return { ok: false, reason: 'too_few_steps', kept: clean.length }
  if (clean.length > MAX_STEPS) return { ok: false, reason: 'too_many_steps', kept: clean.length }
  const parsed = RecipeDraft.safeParse({ title: out.title, shape: out.shape, steps: clean })
  if (!parsed.success) return { ok: false, reason: 'no_title', kept: clean.length }
  return { ok: true, draft: parsed.data, dropped: out.steps.length - clean.length }
}

// ── Apply ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the mapping model returns: one card per step, written for her idea. */
export const RecipeApplyOutput = z.object({
  cards: z.array(z.object({ ordinal: z.number().int(), card_title: z.string(), card_body: z.string(), make_prompt: z.string() })),
})
export type RecipeApplyOutput = z.infer<typeof RecipeApplyOutput>

export interface StepForApply {
  id: string
  ordinal: number
  title: string
  verb: string
  make_kind: MakeKind
}
export interface MappedCard {
  step_id: string
  ordinal: number
  title: string
  body: string
  /** Null when the step's make_kind is 'none': a plain card, no Make button. */
  make_prompt: string | null
}

/**
 * Exactly one card per step, in step order. A step the model skipped, or wrote an empty or over-long body for, fails
 * the whole application (nothing lands; the caller refunds) — half a recipe is not a recipe.
 */
export function validateMapping(out: RecipeApplyOutput, steps: StepForApply[]): { ok: true; cards: MappedCard[] } | { ok: false; reason: string } {
  const byOrdinal = new Map(out.cards.map((c) => [c.ordinal, c]))
  const cards: MappedCard[] = []
  for (const s of [...steps].sort((a, b) => a.ordinal - b.ordinal)) {
    const c = byOrdinal.get(s.ordinal)
    if (!c) return { ok: false, reason: `no card for step ${s.ordinal}` }
    const title = c.card_title.trim()
    const body = c.card_body.trim()
    if (!title || !body) return { ok: false, reason: `step ${s.ordinal} is empty` }
    if (wordCount(body) > CARD_BODY_WORDS) return { ok: false, reason: `step ${s.ordinal} body over ${CARD_BODY_WORDS} words` }
    const prompt = c.make_prompt.trim()
    if (s.make_kind !== 'none' && !prompt) return { ok: false, reason: `step ${s.ordinal} has no make prompt` }
    cards.push({ step_id: s.id, ordinal: s.ordinal, title, body, make_prompt: s.make_kind === 'none' ? null : prompt })
  }
  return { ok: true, cards }
}

/** "Step 2 of The 3-second hook · @maya" — on each card the recipe lands. */
export const stepTag = (n: number, recipeTitle: string, handle: string) => `Step ${n} of ${recipeTitle} · @${handle.replace(/^@/, '')}`

// ── Price (W2: shown before anything runs) ─────────────────────────────────────────────────────────────────────

/**
 * The mapping call's cost in credits, flat per application. TODO(Tim): set from the credit rate once plans have real
 * numbers (apps/web/lib/billing.ts); 4 covers one claude-opus-5-5 mapping call at ~20k tokens with margin.
 */
export const RECIPE_MODEL_CREDITS = 4
/** recipe_authors.payout_share's default (15%). */
export const DEFAULT_PAYOUT_SHARE = 0.15

export interface RecipePrice {
  model: number
  author: number
  total: number
}

/**
 * Model cost always; the author's share only for a published recipe whose author has accepted (a draft from her own
 * extraction has no accepted author, so no share). The share is payout_share of the total, rounded up to a credit.
 */
export function recipePrice(r: { status: RecipeStatus; authorAccepted: boolean; payoutShare: number | null }, model = RECIPE_MODEL_CREDITS): RecipePrice {
  const share = r.status === 'published' && r.authorAccepted ? (r.payoutShare ?? DEFAULT_PAYOUT_SHARE) : 0
  if (share <= 0) return { model, author: 0, total: model }
  const total = Math.ceil(model / (1 - share))
  return { model, author: total - model, total }
}

/** Only an accepted author's recipe may be published (0042's trigger enforces the same). */
export const canPublish = (author: { accepted_at: string | null } | null) => !!author?.accepted_at

// ── Fit (the recipe sheet's order) ─────────────────────────────────────────────────────────────────────────────

/** What a kind of idea is mostly made into: video ideas want video, cuts and stills; a photo or board, stills. */
const WANTS: Record<string, MakeKind[]> = {
  video: ['video', 'cut', 'still', 'write'],
  photo: ['still', 'write', 'video', 'cut'],
  board: ['still', 'video', 'write', 'cut'],
  quote: ['write', 'still', 'video', 'cut'],
  diagram: ['write', 'still', 'video', 'cut'],
  text: ['write', 'still', 'video', 'cut'],
}

/** 0–1: how well a recipe's steps suit this idea kind — each step scored by its make_kind's rank for the kind. */
export function recipeFit(makeKinds: MakeKind[], ideaKind: string): number {
  const wants = WANTS[ideaKind] ?? WANTS.text
  const runnable = makeKinds.filter((k) => k !== 'none')
  if (!runnable.length) return 0
  const score = runnable.reduce((sum, k) => sum + (wants.length - wants.indexOf(k)) / wants.length, 0)
  return Math.round((score / runnable.length) * 1000) / 1000
}

// ── Source links ───────────────────────────────────────────────────────────────────────────────────────────────

export interface ReelLink {
  platform: RecipePlatform
  /** Without the @; null when the link doesn't carry it (a YouTube Short; oEmbed fills it in). */
  handle: string | null
  url: string
}

/** An Instagram reel, a TikTok or a YouTube Short — the links "Turn into a recipe" takes. Anything else is null. */
export function parseReelLink(raw: string): ReelLink | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.replace(/^(www|m)\./, '')
  const parts = u.pathname.split('/').filter(Boolean)
  const url = `https://${u.hostname.replace(/^m\./, 'www.')}${u.pathname}`
  if (host === 'instagram.com' && (parts[0] === 'reel' || parts[0] === 'reels' || parts[1] === 'reel') && parts.length >= 2) {
    return { platform: 'instagram', handle: parts[1] === 'reel' ? parts[0] : null, url }
  }
  if (host === 'tiktok.com' && parts[0]?.startsWith('@') && parts[1] === 'video' && parts[2]) {
    return { platform: 'tiktok', handle: parts[0].slice(1), url }
  }
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') return { platform: 'tiktok', handle: null, url: u.toString() }
  if (host === 'youtube.com' && parts[0] === 'shorts' && parts[1]) return { platform: 'youtube', handle: null, url }
  if (host === 'youtu.be' && parts[0]) return { platform: 'youtube', handle: null, url: u.toString() }
  return null
}
