// packages/pipeline/recipes/index.ts
// Recipes (Job B.10, 0042): a creator's how-to → 3–8 steps → applied to her idea as one card per step.
//
//   extractRecipe     a reel link (+ any text she shared) → recipe_extract_v1 → validateExtraction → a draft_private
//                     recipe; fewer than 3 clean steps → Save as idea instead. The source text is never stored.
//   applyRecipe       price first: credits are spent before the model runs; recipe_apply_v1 writes one card per step
//                     for her idea; a failure after the charge refunds and leaves nothing behind.
//   undoApplication   "Remove these n cards": deletes the cards the application made.
//   inviteAuthor      records the invite (recipe_authors.invited_at). Sends nothing: Tim sends invites by hand.
//
// Writes here use the service role; the routes check who's asking first (apps/web/app/api/recipes). RLS on the recipe
// tables is select-only. Pinterest: an idea from Pinterest is refused before anything is sent.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  parseReelLink,
  recipePrice,
  refusePinterest,
  RecipeApplyOutput,
  RecipeExtractOutput,
  validateExtraction,
  validateMapping,
  type ExtractResult,
  type MakeKind,
  type MappedCard,
  type RecipeStatus,
  type StepForApply,
} from '@ivywolf/schema'
import { costCents } from '../suggest/cost'
import { readSource } from './source'

export { readSource } from './source'

export type RecipeExtractVersion = 'recipe_extract_v1'
export type RecipeApplyVersion = 'recipe_apply_v1'
/** The versions that ship. A new version is eyeballed on eval/recipes (run.ts) before it ships. */
export const RECIPE_EXTRACT_VERSION: RecipeExtractVersion = 'recipe_extract_v1'
export const RECIPE_APPLY_VERSION: RecipeApplyVersion = 'recipe_apply_v1'
export const MODEL = 'claude-opus-5-5'

const PROMPTS: Record<RecipeExtractVersion | RecipeApplyVersion, URL> = {
  recipe_extract_v1: new URL('../prompts/recipe_extract_v1.md', import.meta.url),
  recipe_apply_v1: new URL('../prompts/recipe_apply_v1.md', import.meta.url),
}
const loadPrompt = (v: keyof typeof PROMPTS) => readFileSync(fileURLToPath(PROMPTS[v]), 'utf8')

let client: Anthropic | undefined
let db: SupabaseClient | undefined
const admin = () => (db ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }))

// ── The two calls (no database; the eval calls these directly) ─────────────────────────────────────────────────

export async function proposeRecipe(sourceText: string, handle: string | null, version: RecipeExtractVersion = RECIPE_EXTRACT_VERSION): Promise<{ result: ExtractResult; cents: number | null }> {
  client ??= new Anthropic()
  const response = await client.beta.messages.parse({
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    model: MODEL,
    max_tokens: 3000,
    system: [{ type: 'text', text: loadPrompt(version), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: JSON.stringify({ source_text: sourceText, handle }) }],
    output_config: { format: betaZodOutputFormat(RecipeExtractOutput) },
  })
  const cents = costCents(response.model, response.usage)
  if (!response.parsed_output) {
    console.error(`[recipes] extract: no parseable output (${response.stop_reason})`)
    return { result: { ok: false, reason: 'too_few_steps', kept: 0 }, cents }
  }
  return { result: validateExtraction(response.parsed_output, sourceText), cents }
}

export interface IdeaForApply {
  title: string
  said: string
  gist: string
  picture: string
  project: string
}

export async function mapRecipe(
  recipe: { title: string; steps: (StepForApply & { why: string })[] },
  idea: IdeaForApply,
  version: RecipeApplyVersion = RECIPE_APPLY_VERSION
): Promise<{ result: ReturnType<typeof validateMapping>; cents: number | null }> {
  client ??= new Anthropic()
  const response = await client.beta.messages.parse({
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    model: MODEL,
    max_tokens: 4000,
    system: [{ type: 'text', text: loadPrompt(version), cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          recipe: { title: recipe.title, steps: recipe.steps.map(({ ordinal, title, verb, why, make_kind }) => ({ ordinal, title, verb, why, make_kind })) },
          idea,
        }),
      },
    ],
    output_config: { format: betaZodOutputFormat(RecipeApplyOutput) },
  })
  const cents = costCents(response.model, response.usage)
  if (!response.parsed_output) return { result: { ok: false, reason: `no parseable output (${response.stop_reason})` }, cents }
  return { result: validateMapping(response.parsed_output, recipe.steps), cents }
}

// ── Extract ────────────────────────────────────────────────────────────────────────────────────────────────────

export type ExtractOutcome =
  | { kind: 'recipe'; recipeId: string }
  /** Fewer than 3 clean steps: saved as an idea instead (cardId), or not saved (null) when the platform can't be. */
  | { kind: 'idea'; cardId: string | null; reason: string }
  | { kind: 'not_a_reel' }

export interface ExtractDeps {
  readSource: typeof readSource
  propose: typeof proposeRecipe
  db: () => SupabaseClient
}
const liveExtract: ExtractDeps = { readSource, propose: proposeRecipe, db: admin }

export async function extractRecipe(input: { creatorId: string; url: string; sharedText?: string | null }, deps: ExtractDeps = liveExtract): Promise<ExtractOutcome> {
  const link = parseReelLink(input.url)
  if (!link) return { kind: 'not_a_reel' }
  const source = await deps.readSource(link, input.sharedText ?? null)
  const handle = source.handle ?? link.handle

  let result: ExtractResult = { ok: false, reason: 'too_few_steps', kept: 0 }
  if (source.text.trim()) {
    try {
      result = (await deps.propose(source.text, handle)).result
    } catch (err) {
      console.error('[recipes] extract failed; saving as an idea', err)
    }
  }
  const supabase = deps.db()
  if (!result.ok || !handle) {
    return { kind: 'idea', cardId: await saveAsIdea(supabase, input.creatorId, link.platform, link.url, source.title), reason: result.ok ? 'no_handle' : result.reason }
  }

  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({ title: result.draft.title, shape: result.draft.shape, author_handle: handle, source_url: link.url, status: 'draft_private', created_by: input.creatorId })
    .select('id')
    .single()
  if (error || !recipe) throw new Error(`recipe: ${error?.message ?? 'not saved'}`)
  const { error: sErr } = await supabase
    .from('recipe_steps')
    .insert(result.draft.steps.map((s, i) => ({ recipe_id: recipe.id, ordinal: i + 1, title: s.title, verb: s.verb, why: s.why, make_kind: s.make_kind })))
  if (sErr) {
    await supabase.from('recipes').delete().eq('id', recipe.id)
    throw new Error(`recipe steps: ${sErr.message}`)
  }
  return { kind: 'recipe', recipeId: recipe.id as string }
}

/**
 * Save as idea: the link as a card in My things, the way a pinned YouTube or TikTok is (no recording, 0036).
 * Instagram can't be a card source yet (cards_source_check) — TODO(B.7 §4): add it with the share extension's job.
 */
async function saveAsIdea(supabase: SupabaseClient, creatorId: string, platform: string, url: string, title: string | null): Promise<string | null> {
  if (platform !== 'youtube' && platform !== 'tiktok') return null
  const { data: things } = await supabase.from('projects').select('id').eq('creator_id', creatorId).eq('kind', 'things').maybeSingle()
  if (!things) return null
  const { data, error } = await supabase
    .from('cards')
    .insert({ creator_id: creatorId, project_id: things.id, title: title?.slice(0, 120) || 'A reel to come back to', gist: '', play_from_ms: 0, confidence: 1, source: platform, source_url: url, is_reference: true, reference_url: url })
    .select('id')
    .single()
  if (error) {
    console.error(`[recipes] save as idea: ${error.message}`)
    return null
  }
  return data.id as string
}

// ── Apply ──────────────────────────────────────────────────────────────────────────────────────────────────────

export class RecipeError extends Error {
  constructor(
    readonly code: 'not_found' | 'price_changed' | 'insufficient_credits' | 'no_cards' | 'failed',
    message: string,
    readonly detail?: unknown
  ) {
    super(message)
  }
}

export interface ApplyInput {
  creatorId: string
  recipeId: string
  ideaId: string
  /** Where the cards land; the idea's own project when omitted. */
  projectId?: string | null
  /** The price she was shown. Charged only if it's still the price. */
  quotedCredits: number
}

export interface ApplyResult {
  applicationId: string
  projectId: string
  cardIds: string[]
  credits: number
}

export interface ApplyDeps {
  db: () => SupabaseClient
  map: typeof mapRecipe
  newId: () => string
  now: () => number
}
const liveApply: ApplyDeps = { db: admin, map: mapRecipe, newId: randomUUID, now: Date.now }

interface RecipeRow {
  id: string
  title: string
  author_handle: string
  status: RecipeStatus
  created_by: string
  author_id: string | null
  recipe_authors: { id: string; accepted_at: string | null; payout_share: number | string } | null
  recipe_steps: { id: string; ordinal: number; title: string; verb: string; why: string; make_kind: MakeKind }[]
}

export async function loadRecipeForApply(supabase: SupabaseClient, recipeId: string, creatorId: string): Promise<RecipeRow> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, title, author_handle, status, created_by, author_id, recipe_authors(id, accepted_at, payout_share), recipe_steps(id, ordinal, title, verb, why, make_kind)')
    .eq('id', recipeId)
    .maybeSingle()
  if (error) throw new RecipeError('failed', `recipe: ${error.message}`)
  const r = data as unknown as RecipeRow | null
  // What she can see under RLS: her own (any status but retired) or anything published.
  if (!r || r.status === 'retired' || (r.created_by !== creatorId && r.status !== 'published')) throw new RecipeError('not_found', 'No such recipe')
  r.recipe_steps.sort((a, b) => a.ordinal - b.ordinal)
  return r
}

export const priceOf = (r: Pick<RecipeRow, 'status' | 'recipe_authors'>) =>
  recipePrice({ status: r.status, authorAccepted: !!r.recipe_authors?.accepted_at, payoutShare: r.recipe_authors ? Number(r.recipe_authors.payout_share) : null })

/**
 * Price first: the charge comes before the model call, and is refunded if anything after it fails — no cards, no
 * charge. Each card is inserted a millisecond apart so Home and the project show them in step order (cardRows).
 */
export async function applyRecipe(input: ApplyInput, deps: ApplyDeps = liveApply): Promise<ApplyResult> {
  const supabase = deps.db()
  const recipe = await loadRecipeForApply(supabase, input.recipeId, input.creatorId)

  const { data: card } = await supabase
    .from('cards')
    .select('id, title, gist, source, source_url, visual_query, project_id, segments(text), projects(id, name)')
    .eq('id', input.ideaId)
    .eq('creator_id', input.creatorId)
    .is('trashed_at', null)
    .maybeSingle()
  if (!card) throw new RecipeError('not_found', 'No such idea')
  refusePinterest('recipes', card.source as string, [card.source_url as string | null])

  let projectId = card.project_id as string
  let projectName = (card.projects as unknown as { name: string } | null)?.name ?? ''
  if (input.projectId && input.projectId !== projectId) {
    const { data: p } = await supabase.from('projects').select('id, name').eq('id', input.projectId).eq('creator_id', input.creatorId).maybeSingle()
    if (!p) throw new RecipeError('not_found', 'No such project')
    projectId = p.id as string
    projectName = p.name as string
  }

  const price = priceOf(recipe)
  if (price.total !== input.quotedCredits) throw new RecipeError('price_changed', 'The price changed', price)

  const applicationId = deps.newId()
  const { error: spendErr } = await supabase.rpc('spend_credits', {
    p_creator: input.creatorId,
    p_cost: price.total,
    p_reason: 'recipe_apply',
    p_ref: applicationId,
    p_adapter: 'anthropic',
  })
  if (spendErr) {
    if (spendErr.message.includes('insufficient_credits')) throw new RecipeError('insufficient_credits', 'Not enough credits', price)
    throw new RecipeError('failed', `charge: ${spendErr.message}`)
  }

  const made: string[] = []
  try {
    const segment = card.segments as unknown as { text: string } | null
    const { result } = await deps.map(
      { title: recipe.title, steps: recipe.recipe_steps },
      { title: card.title as string, said: segment?.text ?? '', gist: (card.gist as string) ?? '', picture: (card.visual_query as string | null) ?? '', project: projectName }
    )
    if (!result.ok) throw new RecipeError('no_cards', result.reason)

    const rows = cardRows(result.cards, { creatorId: input.creatorId, projectId, startMs: deps.now() })
    const { data: inserted, error: cErr } = await supabase.from('cards').insert(rows).select('id, created_at')
    if (cErr || !inserted) throw new Error(`cards: ${cErr?.message ?? 'not saved'}`)
    // Back in step order: step 1 is the newest (cardRows).
    const ids = (inserted as { id: string; created_at: string }[]).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map((c) => c.id)
    made.push(...ids)

    const { error: aErr } = await supabase.from('recipe_applications').insert({
      id: applicationId,
      recipe_id: recipe.id,
      idea_id: card.id,
      project_id: projectId,
      user_id: input.creatorId,
      credits: price.total,
      author_share_credits: price.author,
    })
    if (aErr) throw new Error(`application: ${aErr.message}`)
    const { error: lErr } = await supabase
      .from('recipe_application_cards')
      .insert(result.cards.map((c, i) => ({ application_id: applicationId, step_id: c.step_id, card_id: ids[i], make_prompt: c.make_prompt })))
    if (lErr) throw new Error(`application cards: ${lErr.message}`)

    await bumpUses(supabase, recipe.id)
    // The author's share: only for a published recipe whose author accepted (priceOf already makes it 0 otherwise).
    if (price.author > 0 && recipe.status === 'published' && recipe.recipe_authors?.accepted_at) {
      const { error: eErr } = await supabase.from('recipe_author_earnings').insert({ author_id: recipe.recipe_authors.id, application_id: applicationId, credits: price.author })
      if (eErr) console.error(`[recipes] earnings for ${applicationId}: ${eErr.message}`)
    }
    return { applicationId, projectId, cardIds: ids, credits: price.total }
  } catch (err) {
    if (made.length) await supabase.from('cards').delete().in('id', made)
    await supabase.from('recipe_applications').delete().eq('id', applicationId)
    await supabase.rpc('refund_credits', { p_creator: input.creatorId, p_amount: price.total, p_reason: 'refund', p_ref: applicationId })
    if (err instanceof RecipeError) throw err
    throw new RecipeError('failed', err instanceof Error ? err.message : 'Apply failed')
  }
}

/**
 * One card row per mapped step, a millisecond apart from startMs. Home and the project list newest first, so step 1
 * gets the newest time and reads first. Step cards were never said: source 'recipe'.
 */
export function cardRows(cards: MappedCard[], at: { creatorId: string; projectId: string; startMs: number }) {
  return cards.map((c, i) => ({
    creator_id: at.creatorId,
    project_id: at.projectId,
    title: c.title,
    gist: c.body,
    play_from_ms: 0,
    confidence: 1,
    source: 'recipe',
    shape: 'text',
    created_at: new Date(at.startMs + (cards.length - 1 - i)).toISOString(),
  }))
}

/** uses + 1 without a lost update: compare-and-set, retried (counters are never read-modify-write blind). */
async function bumpUses(supabase: SupabaseClient, recipeId: string) {
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from('recipes').select('uses').eq('id', recipeId).single()
    const uses = (data?.uses as number) ?? 0
    const { data: hit } = await supabase.from('recipes').update({ uses: uses + 1 }).eq('id', recipeId).eq('uses', uses).select('id')
    if (hit?.length) return
  }
  console.error(`[recipes] uses for ${recipeId} not bumped after 5 tries`)
}

// ── Undo ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** "Remove these n cards": every card the application made, and nothing else. No refund (B.10 leaves that to Tim). */
export async function undoApplication(input: { creatorId: string; applicationId: string }, supabase = admin()): Promise<{ removed: number }> {
  const { data: app } = await supabase
    .from('recipe_applications')
    .select('id, undone_at, recipe_application_cards(card_id)')
    .eq('id', input.applicationId)
    .eq('user_id', input.creatorId)
    .maybeSingle()
  if (!app) throw new RecipeError('not_found', 'No such application')
  if (app.undone_at) return { removed: 0 }
  const ids = ((app.recipe_application_cards as unknown as { card_id: string }[]) ?? []).map((c) => c.card_id)
  if (ids.length) {
    const { error } = await supabase.from('cards').delete().in('id', ids).eq('creator_id', input.creatorId)
    if (error) throw new RecipeError('failed', `remove cards: ${error.message}`)
  }
  await supabase.from('recipe_applications').update({ undone_at: new Date().toISOString() }).eq('id', app.id)
  return { removed: ids.length }
}

// ── Invite ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * "Invite @handle?": records the invite against the author (one row per platform + handle) and marks her recipe
 * 'invited' — still private. Nothing is sent: GET /api/admin/recipe-invites lists them for Tim to email by hand.
 */
export async function inviteAuthor(input: { creatorId: string; recipeId: string }, supabase = admin()): Promise<{ authorId: string }> {
  const { data: recipe } = await supabase.from('recipes').select('id, author_handle, source_url, status, author_id').eq('id', input.recipeId).eq('created_by', input.creatorId).maybeSingle()
  if (!recipe) throw new RecipeError('not_found', 'No such recipe')
  if (recipe.author_id) return { authorId: recipe.author_id as string }
  const link = parseReelLink((recipe.source_url as string | null) ?? '')
  if (!link) throw new RecipeError('failed', 'This recipe has no link to invite from')
  const handle = recipe.author_handle as string

  const find = () => supabase.from('recipe_authors').select('id, invited_at').eq('platform', link.platform).ilike('handle', handle.replace(/[\\%_]/g, '\\$&')).maybeSingle()
  let { data: author } = await find()
  if (!author) {
    const { data, error } = await supabase
      .from('recipe_authors')
      .insert({ platform: link.platform, handle, invited_at: new Date().toISOString(), invited_by: input.creatorId })
      .select('id, invited_at')
      .single()
    if (error?.code === '23505') author = (await find()).data
    else if (error) throw new RecipeError('failed', `author: ${error.message}`)
    else author = data
  } else if (!author.invited_at) {
    await supabase.from('recipe_authors').update({ invited_at: new Date().toISOString(), invited_by: input.creatorId }).eq('id', author.id)
  }
  if (!author) throw new RecipeError('failed', 'author: not saved')
  const { error } = await supabase
    .from('recipes')
    .update({ author_id: author.id, ...(recipe.status === 'draft_private' ? { status: 'invited' } : {}) })
    .eq('id', recipe.id)
  if (error) throw new RecipeError('failed', `recipe: ${error.message}`)
  return { authorId: author.id as string }
}
