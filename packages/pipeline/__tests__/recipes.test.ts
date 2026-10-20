// Job B.10: recipes — the extraction gate, the fallback, price first, N cards in order, Undo removes all N.
//   npm test -w @ivywolf/pipeline
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canPublish,
  longestSharedRun,
  parseReelLink,
  recipeFit,
  recipePrice,
  RecipeDraft,
  RecipeStep,
  stepTag,
  validateExtraction,
  validateMapping,
  type RecipeExtractOutput,
  type StepForApply,
} from '@ivywolf/schema'
import { applyRecipe, cardRows, extractRecipe, undoApplication, RecipeError, type ApplyDeps, type ExtractDeps } from '../recipes'

const step = (n: number, over: Partial<RecipeExtractOutput['steps'][number]> = {}) => ({
  title: `Step number ${n}`,
  verb: `Write the hook for part ${n}`,
  why: 'Because the first second decides whether anyone stays.',
  make_kind: 'write' as const,
  ...over,
})
const out = (n: number, over: (i: number) => Partial<RecipeExtractOutput['steps'][number]> = () => ({})): RecipeExtractOutput => ({
  title: 'The 3-second hook',
  shape: 'playbook',
  steps: Array.from({ length: n }, (_, i) => step(i + 1, over(i))),
})

// ── zod and the gate ───────────────────────────────────────────────────────────────────────────────────────────

test('RecipeDraft rejects more than 8 steps and fewer than 3', () => {
  assert.equal(RecipeDraft.safeParse(out(9)).success, false)
  assert.equal(RecipeDraft.safeParse(out(2)).success, false)
  assert.equal(RecipeDraft.safeParse(out(8)).success, true)
})

test('RecipeStep rejects a missing verb or one the app cannot run', () => {
  assert.equal(RecipeStep.safeParse(step(1, { verb: '' })).success, false)
  assert.equal(RecipeStep.safeParse(step(1, { verb: 'Try a new angle' })).success, false)
  assert.equal(RecipeStep.safeParse(step(1, { verb: 'Cut the first beat to 2s' })).success, true)
  assert.equal(RecipeStep.safeParse(step(1, { title: 'one two three four five six seven' })).success, false)
})

test('validateExtraction: fewer than 3 clean steps is not a recipe', () => {
  const r = validateExtraction(out(4, (i) => (i < 2 ? { verb: 'Believe in yourself' } : {})), '')
  assert.deepEqual(r, { ok: false, reason: 'too_few_steps', kept: 2 })
})

test('validateExtraction: more than 8 clean steps is rejected, never trimmed', () => {
  assert.deepEqual(validateExtraction(out(9), ''), { ok: false, reason: 'too_many_steps', kept: 9 })
})

test('validateExtraction drops a step quoting more than 12 consecutive words of the source', () => {
  const source = 'the first second decides whether anyone stays so open on the product moving in your hand every time'
  const copied = 'The first second decides whether anyone stays so open on the product moving'
  assert.equal(longestSharedRun(copied, source), 13)
  const r = validateExtraction(out(4, (i) => (i === 0 ? { why: copied } : { why: 'Short and paraphrased.' })), source)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.draft.steps.length, 3)
    assert.equal(r.dropped, 1)
  }
})

// ── extract → fallback ─────────────────────────────────────────────────────────────────────────────────────────

/** A stand-in client: each awaited query resolves to `answer(table, ops, payload)`; every call is logged in order. */
function fake(answer: (table: string, ops: string[], payload: unknown) => { data?: unknown; error?: { message: string; code?: string } | null } = () => ({})) {
  const log: string[] = []
  const query = (table: string) => {
    const ops: string[] = []
    let payload: unknown = null
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'update', 'delete', 'insert', 'eq', 'ilike', 'is', 'in', 'order', 'limit', 'maybeSingle', 'single']) {
      b[m] = (...args: unknown[]) => {
        if (m === 'insert' || m === 'update') payload = args[0]
        ops.push(`${m}${m === 'in' || m === 'eq' ? `(${JSON.stringify(args[1])})` : ''}`)
        return b
      }
    }
    b.then = (resolve: (v: unknown) => void) => {
      log.push(`${table}: ${ops.join(' ')}`)
      resolve({ data: null, error: null, ...answer(table, ops, payload) })
    }
    return b
  }
  const client = {
    from: query,
    rpc: async (fn: string, args: unknown) => {
      log.push(`rpc ${fn}`)
      return { data: null, error: null, ...answer(`rpc ${fn}`, [], args) }
    },
  }
  return { client: client as never, log }
}

const extractDeps = (db: ReturnType<typeof fake>, steps: number): ExtractDeps => ({
  readSource: async () => ({ text: 'how I film a product hook', handle: 'maya', title: 'My hook trick' }),
  propose: async (text) => ({ result: validateExtraction(out(steps), text), cents: 1 }),
  db: () => db.client,
})

test('extract: fewer than 3 steps falls back to Save as idea (a YouTube or TikTok card in My things)', async () => {
  const db = fake((table, ops) => (table === 'projects' ? { data: { id: 'things' } } : table === 'cards' && ops[0] === 'insert' ? { data: { id: 'card-1' } } : {}))
  const r = await extractRecipe({ creatorId: 'u1', url: 'https://www.youtube.com/shorts/abc123' }, extractDeps(db, 2))
  assert.deepEqual(r, { kind: 'idea', cardId: 'card-1', reason: 'too_few_steps' })
  assert.ok(!db.log.some((l) => l.startsWith('recipes')))
})

test('extract: an Instagram reel that falls back is not saved (no card source for it yet)', async () => {
  const db = fake()
  const r = await extractRecipe({ creatorId: 'u1', url: 'https://www.instagram.com/reel/Cx1/' }, extractDeps(db, 1))
  assert.deepEqual(r, { kind: 'idea', cardId: null, reason: 'too_few_steps' })
})

test('extract: 3–8 steps → a draft_private recipe with its steps in order', async () => {
  const inserts: unknown[] = []
  const db = fake((table, ops, payload) => {
    if (ops[0] === 'insert') inserts.push([table, payload])
    return table === 'recipes' ? { data: { id: 'r1' } } : {}
  })
  const r = await extractRecipe({ creatorId: 'u1', url: 'https://www.tiktok.com/@maya/video/123' }, extractDeps(db, 4))
  assert.deepEqual(r, { kind: 'recipe', recipeId: 'r1' })
  const [recipe, steps] = inserts as [string, Record<string, unknown> | Record<string, unknown>[]][]
  assert.equal((recipe[1] as Record<string, unknown>).status, 'draft_private')
  assert.equal((recipe[1] as Record<string, unknown>).author_handle, 'maya')
  assert.deepEqual((steps[1] as Record<string, unknown>[]).map((s) => s.ordinal), [1, 2, 3, 4])
})

test('extract: not a reel link', async () => {
  assert.deepEqual(await extractRecipe({ creatorId: 'u1', url: 'https://example.com/x' }, extractDeps(fake(), 4)), { kind: 'not_a_reel' })
})

// ── apply ──────────────────────────────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 's2', ordinal: 2, title: 'Show it', verb: 'Make a 9-second opener', why: 'Motion first.', make_kind: 'video' },
  { id: 's1', ordinal: 1, title: 'Hook', verb: 'Write the hook', why: 'The first second decides.', make_kind: 'write' },
  { id: 's3', ordinal: 3, title: 'Post it', verb: 'Pick the slot', why: 'Mornings.', make_kind: 'none' },
] as const

function applyFixture(opts: { status?: string; accepted?: boolean; spendError?: string; mapFails?: boolean } = {}) {
  const order: string[] = []
  const inserted: Record<string, unknown> = {}
  const db = fake((table, ops, payload) => {
    if (table === 'recipes' && ops[0] === 'select' && ops.includes('maybeSingle'))
      return {
        data: {
          id: 'r1',
          title: 'The 3-second hook',
          author_handle: 'maya',
          status: opts.status ?? 'draft_private',
          created_by: 'u1',
          author_id: opts.accepted ? 'a1' : null,
          recipe_authors: opts.accepted ? { id: 'a1', accepted_at: '2026-10-01', payout_share: '0.150' } : null,
          recipe_steps: STEPS.map((s) => ({ ...s })),
        },
      }
    if (table === 'recipes' && ops[0] === 'select') return { data: { uses: 3 } }
    if (table === 'recipes' && ops[0] === 'update') return { data: [{ id: 'r1' }] }
    if (table === 'cards' && ops[0] === 'select')
      return { data: { id: 'idea', title: 'Lid twist jar', gist: '', source: 'voice', source_url: null, visual_query: 'jar on a counter', project_id: 'p1', segments: { text: 'the lid twists open' }, projects: { id: 'p1', name: 'Jars' } } }
    if (table === 'cards' && ops[0] === 'insert') {
      order.push('insert cards')
      inserted.cards = payload
      return { data: (payload as { created_at: string }[]).map((c, i) => ({ id: `c${i + 1}`, created_at: c.created_at })).reverse() }
    }
    if (table === 'recipe_application_cards') inserted.links = payload
    if (table === 'recipe_author_earnings') inserted.earnings = payload
    if (table === 'rpc spend_credits') {
      order.push('spend')
      return opts.spendError ? { error: { message: opts.spendError } } : {}
    }
    if (table === 'rpc refund_credits') order.push('refund')
    return {}
  })
  const deps: ApplyDeps = {
    db: () => db.client,
    newId: () => 'app1',
    now: () => Date.parse('2026-10-20T00:00:00Z'),
    map: async (recipe) => {
      order.push('map')
      if (opts.mapFails) return { result: { ok: false, reason: 'model said no' }, cents: 1 }
      return {
        result: validateMapping(
          { cards: recipe.steps.map((s) => ({ ordinal: s.ordinal, card_title: `For the jar: ${s.title}`, card_body: 'Open on the lid twisting in one hand.', make_prompt: s.make_kind === 'none' ? '' : `brief ${s.ordinal}` })) },
          recipe.steps
        ),
        cents: 1,
      }
    },
  }
  return { deps, order, inserted, log: db.log }
}

test('apply: credits are charged before any generation, then N cards land in step order', async () => {
  const f = applyFixture()
  const r = await applyRecipe({ creatorId: 'u1', recipeId: 'r1', ideaId: 'idea', quotedCredits: 4 }, f.deps)
  assert.deepEqual(f.order, ['spend', 'map', 'insert cards'])
  assert.equal(r.cardIds.length, 3)
  assert.deepEqual(r.cardIds, ['c1', 'c2', 'c3'])
  const cards = f.inserted.cards as { title: string; source: string; created_at: string }[]
  assert.deepEqual(cards.map((c) => c.title), ['For the jar: Hook', 'For the jar: Show it', 'For the jar: Post it'])
  assert.ok(cards.every((c) => c.source === 'recipe'))
  assert.ok(Date.parse(cards[0].created_at) < Date.parse(cards[1].created_at))
  const links = f.inserted.links as { step_id: string; card_id: string; make_prompt: string | null }[]
  assert.deepEqual(links.map((l) => [l.step_id, l.card_id]), [['s1', 'c1'], ['s2', 'c2'], ['s3', 'c3']])
  assert.equal(links[2].make_prompt, null) // make_kind none: a plain card, no Make button
  assert.equal(f.inserted.earnings, undefined) // a private draft: no author share
})

test('apply: the step tag', () => {
  assert.equal(stepTag(2, 'The 3-second hook', '@maya'), 'Step 2 of The 3-second hook · @maya')
})

test('apply: a changed price charges nothing', async () => {
  const f = applyFixture({ status: 'published', accepted: true })
  await assert.rejects(applyRecipe({ creatorId: 'u1', recipeId: 'r1', ideaId: 'idea', quotedCredits: 4 }, f.deps), (e: RecipeError) => e.code === 'price_changed')
  assert.deepEqual(f.order, [])
})

test('apply: insufficient credits never reaches the model', async () => {
  const f = applyFixture({ spendError: 'insufficient_credits' })
  await assert.rejects(applyRecipe({ creatorId: 'u1', recipeId: 'r1', ideaId: 'idea', quotedCredits: 4 }, f.deps), (e: RecipeError) => e.code === 'insufficient_credits')
  assert.deepEqual(f.order, ['spend'])
})

test('apply: a failed mapping refunds and lands nothing', async () => {
  const f = applyFixture({ mapFails: true })
  await assert.rejects(applyRecipe({ creatorId: 'u1', recipeId: 'r1', ideaId: 'idea', quotedCredits: 4 }, f.deps), (e: RecipeError) => e.code === 'no_cards')
  assert.deepEqual(f.order, ['spend', 'map', 'refund'])
})

test('apply: a published recipe with an accepted author pays the author share', async () => {
  const price = recipePrice({ status: 'published', authorAccepted: true, payoutShare: 0.15 })
  const f = applyFixture({ status: 'published', accepted: true })
  await applyRecipe({ creatorId: 'u1', recipeId: 'r1', ideaId: 'idea', quotedCredits: price.total }, f.deps)
  assert.deepEqual(f.inserted.earnings, { author_id: 'a1', application_id: 'app1', credits: price.author })
})

test('cardRows: one per mapped card, a millisecond apart', () => {
  const rows = cardRows(
    [
      { step_id: 'a', ordinal: 1, title: 'A', body: 'a', make_prompt: 'x' },
      { step_id: 'b', ordinal: 2, title: 'B', body: 'b', make_prompt: null },
    ],
    { creatorId: 'u1', projectId: 'p1', startMs: 0 }
  )
  assert.deepEqual(rows.map((r) => r.created_at), ['1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.001Z'])
})

test('validateMapping: a skipped step or an over-long body fails the whole application', () => {
  const steps: StepForApply[] = [
    { id: 'a', ordinal: 1, title: 'A', verb: 'Write it', make_kind: 'write' },
    { id: 'b', ordinal: 2, title: 'B', verb: 'Make it', make_kind: 'still' },
  ]
  assert.equal(validateMapping({ cards: [{ ordinal: 1, card_title: 'x', card_body: 'y', make_prompt: 'z' }] }, steps).ok, false)
  const long = Array.from({ length: 61 }, () => 'word').join(' ')
  assert.equal(validateMapping({ cards: [1, 2].map((ordinal) => ({ ordinal, card_title: 'x', card_body: long, make_prompt: 'z' })) }, steps).ok, false)
})

// ── undo ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('undo removes all N cards the application made, and only those', async () => {
  let deleted: unknown = null
  const db = fake((table, ops) => {
    if (table === 'recipe_applications' && ops[0] === 'select') return { data: { id: 'app1', undone_at: null, recipe_application_cards: [{ card_id: 'c1' }, { card_id: 'c2' }, { card_id: 'c3' }] } }
    if (table === 'cards' && ops[0] === 'delete') deleted = ops
    return {}
  })
  const r = await undoApplication({ creatorId: 'u1', applicationId: 'app1' }, db.client)
  assert.deepEqual(r, { removed: 3 })
  assert.deepEqual(deleted, ['delete', 'in(["c1","c2","c3"])', 'eq("u1")'])
  assert.ok(db.log.some((l) => l.startsWith('recipe_applications: update')))
})

// ── price, publishing, fit, links ──────────────────────────────────────────────────────────────────────────────

test('price: a private draft is model cost only; published + accepted adds the author share', () => {
  assert.deepEqual(recipePrice({ status: 'draft_private', authorAccepted: false, payoutShare: null }, 4), { model: 4, author: 0, total: 4 })
  assert.deepEqual(recipePrice({ status: 'published', authorAccepted: false, payoutShare: 0.15 }, 4), { model: 4, author: 0, total: 4 })
  assert.deepEqual(recipePrice({ status: 'published', authorAccepted: true, payoutShare: 0.15 }, 17), { model: 17, author: 3, total: 20 })
})

test('a recipe cannot be published without recipe_authors.accepted_at', () => {
  assert.equal(canPublish(null), false)
  assert.equal(canPublish({ accepted_at: null }), false)
  assert.equal(canPublish({ accepted_at: '2026-10-20T00:00:00Z' }), true)
})

test('fit: a video recipe suits a video idea better than a text one', () => {
  assert.ok(recipeFit(['video', 'cut'], 'video') > recipeFit(['video', 'cut'], 'text'))
  assert.equal(recipeFit(['none'], 'video'), 0)
})

test('parseReelLink: reels, TikToks and Shorts only', () => {
  assert.deepEqual(parseReelLink('https://www.instagram.com/reel/Cx1/?igsh=abc'), { platform: 'instagram', handle: null, url: 'https://www.instagram.com/reel/Cx1/' })
  assert.deepEqual(parseReelLink('https://www.tiktok.com/@maya/video/123?lang=en'), { platform: 'tiktok', handle: 'maya', url: 'https://www.tiktok.com/@maya/video/123' })
  assert.equal(parseReelLink('https://youtube.com/shorts/abc')?.platform, 'youtube')
  assert.equal(parseReelLink('https://www.youtube.com/watch?v=abc'), null)
  assert.equal(parseReelLink('not a link'), null)
})
