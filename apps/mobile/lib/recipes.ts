// apps/mobile/lib/recipes.ts
// Recipes (Job B.10, 0042): what the recipe sheet, the recipe page (R2), Explore's Recipes shelf (R1) and the author
// page (R4) read, and the four calls that change anything (extract, apply, undo, invite — all through apps/web, which
// writes with the service role; the app only reads, under RLS: her own recipes and anything published).
//
// Two rules the reads keep as well as RLS: a private draft (draft_private or invited) never shows on Explore, and an
// author page shows only an author who has accepted (recipe_authors.accepted_at).

import type { SupabaseClient } from '@supabase/supabase-js'
import { recipeFit, recipePrice, stepTag, type MakeKind, type RecipePrice, type RecipeShape, type RecipeStatus } from '@ivywolf/schema'
import type { CardItem } from './home'

const API_URL = process.env.EXPO_PUBLIC_API_URL!

export interface RecipeStepItem {
  id: string
  ordinal: number
  title: string
  verb: string
  why: string
  makeKind: MakeKind
}

export interface RecipeAuthor {
  id: string
  handle: string
  name: string | null
  acceptedAt: string | null
  payoutShare: number
}

export interface Recipe {
  id: string
  title: string
  shape: RecipeShape
  status: RecipeStatus
  handle: string
  sourceUrl: string | null
  uses: number
  createdBy: string
  author: RecipeAuthor | null
  steps: RecipeStepItem[]
}

const COLUMNS =
  'id, title, shape, status, author_handle, source_url, uses, created_by, recipe_authors(id, handle, name, accepted_at, payout_share), recipe_steps(id, ordinal, title, verb, why, make_kind)'

interface Row {
  id: string
  title: string
  shape: RecipeShape
  status: RecipeStatus
  author_handle: string
  source_url: string | null
  uses: number
  created_by: string
  recipe_authors: { id: string; handle: string; name: string | null; accepted_at: string | null; payout_share: number | string } | null
  recipe_steps: { id: string; ordinal: number; title: string; verb: string; why: string; make_kind: MakeKind }[]
}

export function toRecipe(r: Row): Recipe {
  return {
    id: r.id,
    title: r.title,
    shape: r.shape,
    status: r.status,
    handle: r.author_handle,
    sourceUrl: r.source_url,
    uses: r.uses,
    createdBy: r.created_by,
    author: r.recipe_authors
      ? { id: r.recipe_authors.id, handle: r.recipe_authors.handle, name: r.recipe_authors.name, acceptedAt: r.recipe_authors.accepted_at, payoutShare: Number(r.recipe_authors.payout_share) }
      : null,
    steps: [...(r.recipe_steps ?? [])]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((s) => ({ id: s.id, ordinal: s.ordinal, title: s.title, verb: s.verb, why: s.why, makeKind: s.make_kind })),
  }
}

/** Hers and not public yet: extracted by her, not published (the author hasn't accepted). */
export const isPrivateDraft = (r: Pick<Recipe, 'status'>) => r.status === 'draft_private' || r.status === 'invited'

/** The price shown before anything runs (W2). Her own drafts: model cost only. */
export const priceOf = (r: Recipe): RecipePrice => recipePrice({ status: r.status, authorAccepted: !!r.author?.acceptedAt, payoutShare: r.author?.payoutShare ?? null })
export const creditsLabel = (n: number) => `${n} credit${n === 1 ? '' : 's'}`
export const applyLabel = (r: Recipe) => `Apply · ${creditsLabel(priceOf(r).total)}`

/** "From @maya · private to you" — or, published, "From @maya · {uses} used". */
export function fromLine(r: Recipe): string {
  const who = `From @${r.handle}`
  return isPrivateDraft(r) ? `${who} · private to you` : `${who} · ${r.uses} used`
}

/** The kind of idea, for fit: a video idea, else its form. */
export const ideaKind = (card: Pick<CardItem, 'shape' | 'picture'>) => (card.picture?.kind === 'video' ? 'video' : card.shape ?? 'text')

// ── Reads (RLS) ────────────────────────────────────────────────────────────────────────────────────────────────

export async function loadRecipe(supabase: SupabaseClient, id: string): Promise<Recipe | null> {
  const { data, error } = await supabase.from('recipes').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(`recipe: ${error.message}`)
  return data ? toRecipe(data as unknown as Row) : null
}

export interface SheetList {
  /** (a) the recipes she extracted, newest first. */
  drafts: Recipe[]
  /** (b) published recipes, best fit for this idea first. */
  published: Recipe[]
}

/** The recipe sheet (W5) for an idea: her drafts, then published recipes ranked by fit for the idea's kind. */
export async function loadSheet(supabase: SupabaseClient, userId: string, kind: string): Promise<SheetList> {
  const [mine, pub] = await Promise.all([
    supabase.from('recipes').select(COLUMNS).eq('created_by', userId).in('status', ['draft_private', 'invited']).order('created_at', { ascending: false }).limit(30),
    supabase.from('recipes').select(COLUMNS).eq('status', 'published').order('uses', { ascending: false }).limit(30),
  ])
  if (mine.error) throw new Error(`recipes: ${mine.error.message}`)
  if (pub.error) throw new Error(`recipes: ${pub.error.message}`)
  return sheetList((mine.data as unknown as Row[]).map(toRecipe), (pub.data as unknown as Row[]).map(toRecipe), kind)
}

export function sheetList(mine: Recipe[], published: Recipe[], kind: string): SheetList {
  const fit = (r: Recipe) => recipeFit(r.steps.map((s) => s.makeKind), kind)
  return {
    drafts: mine.filter(isPrivateDraft),
    published: published
      .filter((r) => r.status === 'published')
      .map((r) => ({ r, f: fit(r) }))
      .sort((a, b) => b.f - a.f || b.r.uses - a.r.uses)
      .map(({ r }) => r),
  }
}

/** The badge on the Recipe circle: her private drafts. TODO(B.8): the Make with row reads this for ✦'s badge. */
export async function draftCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase.from('recipes').select('id', { count: 'exact', head: true }).eq('created_by', userId).in('status', ['draft_private', 'invited'])
  return count ?? 0
}

/** Explore's Recipes shelf (R1): published only — a private draft never appears here, hers included. */
export async function loadShelf(supabase: SupabaseClient): Promise<Recipe[]> {
  const { data, error } = await supabase.from('recipes').select(COLUMNS).eq('status', 'published').order('uses', { ascending: false }).limit(20)
  if (error) throw new Error(`recipes: ${error.message}`)
  return shelf((data as unknown as Row[]).map(toRecipe))
}
export const shelf = (list: Recipe[]) => list.filter((r) => r.status === 'published')

export interface AuthorPage {
  author: RecipeAuthor
  recipes: Recipe[]
  uses: number
  /** Only the author themself can read their earnings (RLS); null for anyone else. */
  creditsEarned: number | null
}

/** The author page (R4): only for an author who has accepted. Anyone else → null, as if there were no page. */
export async function loadAuthor(supabase: SupabaseClient, authorId: string, userId: string | null): Promise<AuthorPage | null> {
  const { data: a } = await supabase.from('recipe_authors').select('id, handle, name, accepted_at, payout_share, user_id').eq('id', authorId).maybeSingle()
  if (!a || !authorVisible(a)) return null
  const { data: rows, error } = await supabase.from('recipes').select(COLUMNS).eq('author_id', authorId).eq('status', 'published').order('uses', { ascending: false })
  if (error) throw new Error(`recipes: ${error.message}`)
  const recipes = (rows as unknown as Row[]).map(toRecipe)
  let creditsEarned: number | null = null
  if (userId && a.user_id === userId) {
    const { data: e } = await supabase.from('recipe_author_earnings').select('credits').eq('author_id', authorId)
    creditsEarned = (e ?? []).reduce((sum, x) => sum + (x.credits as number), 0)
  }
  return {
    author: { id: a.id, handle: a.handle, name: a.name, acceptedAt: a.accepted_at, payoutShare: Number(a.payout_share) },
    recipes,
    uses: recipes.reduce((sum, r) => sum + r.uses, 0),
    creditsEarned,
  }
}
export const authorVisible = (a: { accepted_at: string | null }) => !!a.accepted_at

export interface StepCard {
  applicationId: string
  tag: string
  makeKind: MakeKind
  /** What the Make button is pre-filled with; null for a plain card. */
  makePrompt: string | null
  recipeId: string
}

/** A card a recipe made: its tag and its Make button. Null for any other card. */
export async function loadStepCard(supabase: SupabaseClient, cardId: string): Promise<StepCard | null> {
  const { data } = await supabase
    .from('recipe_application_cards')
    .select('application_id, make_prompt, recipe_steps(ordinal, make_kind, recipes(id, title, author_handle))')
    .eq('card_id', cardId)
    .maybeSingle()
  if (!data) return null
  const s = data.recipe_steps as unknown as { ordinal: number; make_kind: MakeKind; recipes: { id: string; title: string; author_handle: string } | null } | null
  if (!s?.recipes) return null
  return {
    applicationId: data.application_id as string,
    tag: stepTag(s.ordinal, s.recipes.title, s.recipes.author_handle),
    makeKind: s.make_kind,
    makePrompt: s.make_kind === 'none' ? null : ((data.make_prompt as string | null) ?? null),
    recipeId: s.recipes.id,
  }
}

export const MAKE_LABEL: Record<Exclude<MakeKind, 'none'>, string> = { write: 'Make words', still: 'Make stills', video: 'Make video', cut: 'Make a cut' }

// ── Calls (apps/web) ───────────────────────────────────────────────────────────────────────────────────────────

async function call<T>(token: string, path: string, init: { method: string; body?: unknown }): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; body: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) return { ok: false, status: res.status, error: typeof body.error === 'string' ? body.error : 'That didn’t work — try again', body }
  return { ok: true, data: body as T }
}

export type ExtractReply = { kind: 'recipe'; recipe_id: string } | { kind: 'idea'; card_id: string | null; message: string }

/** "Turn into a recipe": a reel link (+ any text with it) → a private draft, or saved as an idea instead. */
export async function extract(token: string, url: string, text?: string): Promise<ExtractReply> {
  const r = await call<ExtractReply>(token, '/api/recipes/extract', { method: 'POST', body: { url, text: text?.trim() || undefined } })
  if (!r.ok) throw new Error(r.error)
  return r.data
}

export type ApplyReply =
  | { ok: true; applicationId: string; projectId: string; cardIds: string[]; credits: number }
  | { ok: false; code: 'insufficient_credits' | 'price_changed' | 'other'; error: string; price: RecipePrice | null }

/** Apply · {credits}: `credits` is the price she was shown; the server charges it only if it's still the price. */
export async function apply(token: string, recipeId: string, ideaId: string, projectId: string | null, credits: number): Promise<ApplyReply> {
  const r = await call<{ application_id: string; project_id: string; card_ids: string[]; credits: number }>(token, `/api/recipes/${recipeId}/apply`, {
    method: 'POST',
    body: { idea_id: ideaId, project_id: projectId, credits },
  })
  if (r.ok) return { ok: true, applicationId: r.data.application_id, projectId: r.data.project_id, cardIds: r.data.card_ids, credits: r.data.credits }
  const code = r.status === 402 ? 'insufficient_credits' : r.status === 409 ? 'price_changed' : 'other'
  return { ok: false, code, error: r.error, price: (r.body.price as RecipePrice | null) ?? null }
}

/** "Remove these n cards" — within the pill's 10 s, the charge comes back in full. Returns the credits refunded. */
export async function undo(token: string, applicationId: string): Promise<number> {
  const r = await call<{ removed: number; refunded: number }>(token, `/api/recipes/applications/${applicationId}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(r.error)
  return r.data.refunded
}

/** "Invite @handle?" — recorded for Tim; nothing is sent from the app or the server. */
export async function invite(token: string, recipeId: string): Promise<void> {
  const r = await call(token, `/api/recipes/${recipeId}/invite`, { method: 'POST' })
  if (!r.ok) throw new Error(r.error)
}

/** How long "Remove these n cards" stays after they land (the refund window; packages/schema/recipes.ts). */
export { UNDO_MS } from '@ivywolf/schema'
export const removeLabel = (n: number) => (n === 1 ? 'Remove this card' : `Remove these ${n} cards`)
