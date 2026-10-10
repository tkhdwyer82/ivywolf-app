// packages/pipeline/suggest/index.ts
// More ideas, free (Job H): 3–5 new directions for a project, written from her own cards.
//
//   generateDirections(projectId)   load the project → one model call (direction_v1) → validate.ts → store
//   shouldGenerate(project, n)      the trigger rule (a change, quiet for 5 minutes; or 24 h since the last; ≥ 3 cards)
//
// Free and capped: one call per project per trigger, its cost logged in cents (cost.ts); nothing spends credits.
// References are not stored: they're looked up live per direction (packages/pipeline/references) when shown.
// Pinterest: nothing here reads pins. A card or context item from Pinterest is refused or left out before the call
// (packages/schema/pinterest.ts) — directions are never written from Pinterest data.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DirectionOutput, isPinterestSource, isPinterestUrl, refusePinterest } from '@ivywolf/schema'
import { costCents } from './cost'
import { preferredForms, validateDirections } from './validate'
import type { CardForm, Direction, DirectionVersion, Dropped, FormatProfile, InputCard, ProjectInput } from './types'

export type { Direction, DirectionVersion, ProjectInput, InputCard, FormatProfile } from './types'
export { validateDirections, preferredForms, similarTitles, isVerbatim, asks, whyLine, citeLabel } from './validate'
export { costCents } from './cost'

/**
 * The version that ships. A new version ships through the same ratchet as classify and shape (CLAUDE.md; the eval
 * is packages/pipeline/eval/direction-eval.ts).
 * direction_v1 — Job H, 2026-10-09: first version; read by hand on the 3 eval memos as one project, 3 runs.
 */
export const DIRECTION_VERSION: DirectionVersion = 'direction_v1'
export const MODEL = 'claude-opus-5-5'
/** A project earns More ideas at this many cards (staged unlock). */
export const MIN_CARDS = 3
/** A change must be quiet this long before directions are rewritten (debounce). */
export const DEBOUNCE_MS = 5 * 60_000
/** Opening a project rewrites directions this old. */
export const MAX_AGE_MS = 24 * 3600_000

const PROMPTS: Record<DirectionVersion, URL> = { direction_v1: new URL('../prompts/direction_v1.md', import.meta.url) }
const loadPrompt = (v: DirectionVersion) => readFileSync(fileURLToPath(PROMPTS[v]), 'utf8')

let client: Anthropic | undefined
let db: SupabaseClient | undefined
const admin = () => (db ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }))

// ── The trigger rule ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ProjectClock {
  directions_at: string | null
  directions_stale_at: string | null
}

/**
 * Due when the project has ≥ MIN_CARDS cards and: it has never had directions; or something changed after the last
 * generation and has been quiet DEBOUNCE_MS (a card landed, a pin, a heart, Link ideas — set by 0038's triggers); or
 * the last generation is older than MAX_AGE_MS (checked when she opens the project). Never on scroll: only on open.
 */
export function shouldGenerate(p: ProjectClock, cardCount: number, now = Date.now()): boolean {
  if (cardCount < MIN_CARDS) return false
  if (!p.directions_at) return true
  const at = Date.parse(p.directions_at)
  if (now - at >= MAX_AGE_MS) return true
  if (p.directions_stale_at) {
    const stale = Date.parse(p.directions_stale_at)
    return stale > at && now - stale >= DEBOUNCE_MS
  }
  return false
}

// ── Input ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** The project as the model sees it. Pinterest is refused or left out here, before anything is sent. */
export async function loadProjectInput(projectId: string, supabase = admin()): Promise<ProjectInput & { cards: (InputCard & { recorded_tz: string | null })[] }> {
  const { data: project, error: pErr } = await supabase.from('projects').select('id, creator_id, name, format_profile').eq('id', projectId).single()
  if (pErr || !project) throw new Error(`project ${projectId}: ${pErr?.message ?? 'missing'}`)
  const { data: rows, error } = await supabase
    .from('cards')
    .select('id, title, gist, shape, source, source_url, recording_id, play_from_ms, pinned_at, hearted_at, segments(text), recordings(recorded_at, recorded_tz, source), thread_cards(threads(return_count)), card_context(kind, content, url)')
    .eq('project_id', projectId)
    .order('created_at')
  if (error) throw new Error(`cards: ${error.message}`)
  const cards = (rows ?? []).map((r) => {
    // A card from Pinterest is a stored pin — it can't exist (0036), and is never an input if it somehow did.
    refusePinterest('directions', r.source as string, [r.source_url as string | null])
    const seg = r.segments as unknown as { text: string } | null
    const rec = r.recordings as unknown as { recorded_at: string | null; recorded_tz: string | null; source: string | null } | null
    const threads = (r.thread_cards as unknown as { threads: { return_count: number } | null }[]) ?? []
    const context = ((r.card_context as unknown as { kind: string; content: string | null; url: string | null }[]) ?? [])
      .filter((c) => !isPinterestUrl(c.url) && !isPinterestUrl(c.content)) // a pinned link is never read
      .map((c) => [c.kind, c.content, c.url].filter(Boolean).join(': '))
      .filter(Boolean)
    return {
      id: r.id as string,
      title: r.title as string,
      gist: (r.gist as string) ?? '',
      form: ((r.shape as CardForm | null) ?? 'text') as CardForm,
      said: seg?.text ?? '',
      recording_id: r.recording_id as string | null,
      recorded_at: rec?.recorded_at ?? null,
      recorded_tz: rec?.recorded_tz ?? null,
      play_from_ms: (r.play_from_ms as number) ?? 0,
      recording_source: rec?.source ?? null,
      thread_returns: Math.max(0, ...threads.map((t) => t.threads?.return_count ?? 0)),
      pinned: !!r.pinned_at,
      hearted: !!r.hearted_at,
      context,
      source: r.source as string,
    }
  })
  const { data: dismissed } = await supabase
    .from('suggestions')
    .select('title')
    .eq('project_id', projectId)
    .eq('kind', 'direction')
    .eq('status', 'dismissed')
    .order('acted_at', { ascending: false })
    .limit(10)
  return {
    projectId,
    creatorId: project.creator_id as string,
    name: project.name as string,
    cards,
    profile: (project.format_profile as FormatProfile) ?? {},
    avoid: (dismissed ?? []).map((d) => d.title as string),
  }
}

// ── The call ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Proposal {
  kept: Direction[]
  dropped: Dropped[]
  model: string
  cents: number | null
  usage: { input_tokens: number; output_tokens: number }
}

/** One model call and the checks — no database. The eval calls this directly. */
export async function proposeDirections(input: ProjectInput & { cards: (InputCard & { recorded_tz?: string | null })[] }, version: DirectionVersion = DIRECTION_VERSION): Promise<Proposal> {
  if (input.cards.some((c) => isPinterestSource(c.source))) throw new Error('directions: Pinterest content is never an input')
  client ??= new Anthropic()
  const response = await client.beta.messages.parse({
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: betaZodOutputFormat(DirectionOutput) },
    system: [{ type: 'text', text: loadPrompt(version), cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          project: input.name,
          cards: input.cards.map((c, card_index) => ({
            card_index,
            title: c.title,
            gist: c.gist,
            form: c.form,
            said: c.said,
            thread_returns: c.thread_returns,
            pinned: c.pinned,
            hearted: c.hearted,
            context: c.context,
          })),
          format_profile: input.profile,
          preferred_forms: preferredForms(input.profile),
          avoid: input.avoid,
          existing_titles: input.cards.map((c) => c.title),
        }),
      },
    ],
  })
  if (response.stop_reason === 'refusal') throw new Error(`directions: refused (${response.stop_details?.category ?? 'no category'})`)
  const out = response.parsed_output
  if (!out) throw new Error(`directions: no parseable output (${response.stop_reason})`)
  const { kept, dropped } = validateDirections(out, input.cards, input.cards.map((c) => c.title), input.avoid, input.profile)
  return {
    kept,
    dropped,
    model: response.model,
    cents: costCents(response.model, response.usage),
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  }
}

// ── Generate and store ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Rewrite a project's directions: claim the run (so two opens don't both call), one call, store what passes, retire the
 * previous unacted ones. If nothing passes, the previous directions stay (no blank screen). Returns what was stored.
 */
export async function generateDirections(projectId: string, opts: { version?: DirectionVersion; supabase?: SupabaseClient } = {}): Promise<Direction[] | null> {
  const supabase = opts.supabase ?? admin()
  const version = opts.version ?? DIRECTION_VERSION
  const { data: clock } = await supabase.from('projects').select('directions_at, directions_stale_at').eq('id', projectId).single()
  const started = new Date().toISOString()
  // Claim: only the call that moves directions_at from the value it read goes on.
  const claim = supabase.from('projects').update({ directions_at: started }).eq('id', projectId)
  const { data: claimed } = await (clock?.directions_at ? claim.eq('directions_at', clock.directions_at) : claim.is('directions_at', null)).select('id')
  if (!claimed?.length) return null

  const input = await loadProjectInput(projectId, supabase)
  if (input.cards.length < MIN_CARDS) return null
  const t0 = Date.now()
  const p = await proposeDirections(input, version)
  console.log(
    `[directions] project ${projectId}: ${p.kept.length} kept, ${p.dropped.length} dropped (${p.dropped.map((d) => d.reason).join(', ') || 'none'}) — ${p.model}, ${p.cents ?? '?'}¢, ${Date.now() - t0} ms`
  )
  if (p.kept.length) {
    await supabase.from('suggestions').update({ status: 'expired' }).eq('project_id', projectId).eq('kind', 'direction').eq('status', 'new')
    const generated_at = new Date().toISOString()
    const { error } = await supabase.from('suggestions').insert(
      p.kept.map((d, rank) => ({
        creator_id: input.creatorId,
        project_id: projectId,
        kind: 'direction',
        field: 'graph',
        source: 'graph',
        title: d.title,
        gist: d.gist,
        why: d.why,
        why_recording_id: d.cite_recording_id,
        why_ms: d.cite_ms,
        cite_card_ids: d.cite_card_ids,
        near_card_id: d.cite_card_ids[0] ?? null,
        format: d.format,
        visual_query: d.visual_query || null,
        payload: d.payload,
        rank,
        status: 'new',
        generated_at,
        model_version: version,
      }))
    )
    if (error) throw new Error(`directions insert: ${error.message}`)
  }
  // Clear the change marker only if nothing newer arrived while this ran.
  await supabase.from('projects').update({ directions_stale_at: null }).eq('id', projectId).lte('directions_stale_at', started)
  return p.kept
}
