// packages/pipeline/eval/recipes/run.ts
// Recipes (Job B.10): extract → apply on 5 how-to transcripts × 3 ideas, printed, so a prompt change can be read by
// eye. Not a test gate and not the ratchet — a tool. Calls the model directly (proposeRecipe, mapRecipe): no database,
// no credits. Transcripts still marked PLACEHOLDER are skipped.
//
//   npm run eval:recipes -w @ivywolf/pipeline                       every transcript × every idea
//   npm run eval:recipes -w @ivywolf/pipeline -- --dry              print what would be sent; no model calls
//   npm run eval:recipes -w @ivywolf/pipeline -- --only 01 --idea jar
//   npm run eval:recipes -w @ivywolf/pipeline -- --extract recipe_extract_v1 --apply recipe_apply_v1

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { stepTag } from '@ivywolf/schema'
import { mapRecipe, proposeRecipe, RECIPE_APPLY_VERSION, RECIPE_EXTRACT_VERSION, type IdeaForApply, type RecipeApplyVersion, type RecipeExtractVersion } from '../../recipes'

const dir = fileURLToPath(new URL('./transcripts/', import.meta.url))
const ideas = JSON.parse(readFileSync(fileURLToPath(new URL('./ideas.json', import.meta.url)), 'utf8')) as (IdeaForApply & { key: string })[]

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const dry = args.includes('--dry')
const only = flag('--only')
const ideaKey = flag('--idea')
const extractVersion = (flag('--extract') ?? RECIPE_EXTRACT_VERSION) as RecipeExtractVersion
const applyVersion = (flag('--apply') ?? RECIPE_APPLY_VERSION) as RecipeApplyVersion

function parse(file: string) {
  const raw = readFileSync(dir + file, 'utf8')
  const placeholder = raw.includes('PLACEHOLDER')
  const body = raw.replace(/<!--[\s\S]*?-->/g, '').trim()
  const handle = body.match(/^handle:\s*(.+)$/m)?.[1]?.trim() ?? null
  const text = body.replace(/^(handle|url):.*$/gm, '').trim()
  return { file, placeholder, handle, text }
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.md') && (!only || f.startsWith(only)))
  .sort()
const chosen = ideas.filter((i) => !ideaKey || i.key === ideaKey)

for (const t of files.map(parse)) {
  console.log(`\n━━ ${t.file}  @${t.handle ?? '?'}  (${extractVersion} → ${applyVersion})`)
  if (t.placeholder) {
    console.log('   PLACEHOLDER — skipped (Tim supplies the transcript)')
    continue
  }
  if (dry) {
    console.log(`   would extract from ${t.text.split(/\s+/).length} words; then apply to ${chosen.map((i) => i.key).join(', ')}`)
    continue
  }
  const { result, cents } = await proposeRecipe(t.text, t.handle, extractVersion)
  if (!result.ok) {
    console.log(`   not a recipe: ${result.reason} (${result.kept} clean steps) — falls back to Save as idea   [${cents ?? '?'}¢]`)
    continue
  }
  const { draft } = result
  console.log(`   “${draft.title}” · ${draft.shape} · ${draft.steps.length} steps${result.dropped ? ` (${result.dropped} dropped)` : ''}   [${cents ?? '?'}¢]`)
  draft.steps.forEach((s, i) => console.log(`   ${i + 1}. ${s.title} — ${s.verb} [${s.make_kind}]\n      why: ${s.why}`))

  const steps = draft.steps.map((s, i) => ({ ...s, id: `s${i + 1}`, ordinal: i + 1 }))
  for (const idea of chosen) {
    const { key, ...input } = idea
    const mapped = await mapRecipe({ title: draft.title, steps }, input, applyVersion)
    console.log(`\n   → ${key}: ${idea.title}   [${mapped.cents ?? '?'}¢]`)
    if (!mapped.result.ok) {
      console.log(`     failed: ${mapped.result.reason}`)
      continue
    }
    for (const c of mapped.result.cards) {
      console.log(`     ${stepTag(c.ordinal, draft.title, t.handle ?? '?')}\n     ${c.title}\n     ${c.body}${c.make_prompt ? `\n     Make: ${c.make_prompt}` : ''}\n`)
    }
  }
}
