// apps/web/app/api/recipes/extract/route.ts
// "Turn into a recipe" (Job B.10, door 1): POST { url, text? } → a draft_private recipe from an Instagram reel, a
// TikTok or a YouTube Short (packages/pipeline/recipes extractRecipe). `text` is whatever came with the link (the
// share sheet's text, or what she pasted). We read the platform's public oEmbed and, for YouTube, the video's
// description — no scraping, no download — and keep only the steps, the link and the handle; the text is discarded.
// Fewer than 3 clean steps → saved as an idea instead, and the response says so. Target < 15 s.
//
// Today the app reaches this from "Paste a reel link" (Explore's Recipes shelf and the recipe sheet); the share
// extension routes here once B.7 §4 lands.

import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { extractRecipe } from '@ivywolf/pipeline'
import { allow } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 30

const MAX_TEXT = 4000
const FALLBACK_SAVED = 'Couldn’t find steps in this one — saved as an idea instead'
const FALLBACK_UNSAVED = 'Couldn’t find steps in this one'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allow(`recipes-extract:${userId}`, 10)) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } })

  const body = (await req.json().catch(() => null)) as { url?: unknown; text?: unknown } | null
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  const text = typeof body?.text === 'string' ? body.text.slice(0, MAX_TEXT) : null
  if (!url) return NextResponse.json({ error: 'Not a link' }, { status: 400 })

  try {
    const out = await extractRecipe({ creatorId: userId, url, sharedText: text })
    if (out.kind === 'not_a_reel') return NextResponse.json({ error: 'That isn’t a reel, TikTok or Short' }, { status: 400 })
    if (out.kind === 'idea') return NextResponse.json({ kind: 'idea', card_id: out.cardId, message: out.cardId ? FALLBACK_SAVED : FALLBACK_UNSAVED })
    return NextResponse.json({ kind: 'recipe', recipe_id: out.recipeId })
  } catch (err) {
    console.error(`[recipes/extract] ${err instanceof Error ? err.message : err}`)
    return NextResponse.json({ error: 'That didn’t work — try again' }, { status: 500 })
  }
}
