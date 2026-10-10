// apps/web/app/api/projects/[id]/directions/route.ts
// More ideas, free (Job H). GET → her project's current directions, each with 3 references looked up live, and Ivy's
// one line. Opening a project calls this: when directions are due (packages/pipeline/suggest shouldGenerate — ≥ 3
// cards; a change quiet 5 min; or 24 h old) it rewrites them after responding (next/server after()), so she never
// waits — the previous directions show until the new ones land. ?references=0 checks and triggers without looking
// references up (the project page, before the More ideas tab is open). Creator-scoped: read under her RLS. Free:
// one model call per project per trigger (logged in cents); references are never stored.

import { auth } from '@clerk/nextjs/server'
import { after, NextResponse } from 'next/server'
import { findReferences, generateDirections, shouldGenerate, DIRECTIONS_MIN_CARDS, type Reference } from '@ivywolf/pipeline'
import { supabaseAsUser } from '@/lib/supabase'
import { accessToken } from '@/lib/pinterest'
import { allow } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five']
const WHERE: Record<string, string> = { mini: 'your Mini', note_taker: 'the note taker', muse: 'Muse', dji_import: 'the import' }
const WEEKDAY = (iso: string, tz: string | null) =>
  new Intl.DateTimeFormat('en-AU', { weekday: 'long', ...(tz ? { timeZone: tz } : {}) }).format(new Date(iso))

/** "Three new directions, from your Mini and Tuesday's note." — where the cited words were said, at most two places. */
function ivyLine(n: number, places: string[]): string | null {
  if (!n) return null
  const uniq = [...new Set(places)].slice(0, 2)
  return `${COUNT[n] ?? n} new direction${n === 1 ? '' : 's'}${uniq.length ? `, from ${uniq.join(' and ')}` : ''}.`
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!allow(`directions:${userId}`, 60)) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const withReferences = new URL(req.url).searchParams.get('references') !== '0'

  const supabase = await supabaseAsUser()
  const { data: project } = await supabase.from('projects').select('id, directions_at, directions_stale_at').eq('id', id).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { count } = await supabase.from('cards').select('id', { count: 'exact', head: true }).eq('project_id', id)
  const cards = count ?? 0

  const due = shouldGenerate(project, cards)
  if (due) {
    after(async () => {
      try {
        await generateDirections(id)
      } catch (err) {
        console.error(`[directions] project ${id} failed: ${err instanceof Error ? err.message : err}`)
      }
    })
  }

  const { data: rows, error } = await supabase
    .from('suggestions')
    .select('id, title, gist, why, why_ms, format, visual_query, payload, hearted_at, generated_at, cite_card_ids, recordings:why_recording_id(recorded_at, recorded_tz, source)')
    .eq('project_id', id)
    .eq('kind', 'direction')
    .eq('status', 'new')
    .order('rank')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const token = withReferences && rows?.length ? await accessToken(userId).catch(() => null) : null
  const directions = await Promise.all(
    (rows ?? []).map(async (r) => {
      const references: Reference[] = withReferences
        ? await findReferences(
            { title: r.title as string, gist: (r.gist as string) ?? null, visual_query: r.visual_query as string | null, shape: r.format === 'video' ? 'board' : (r.format as never) },
            { limit: 3, pinterestToken: token }
          ).catch(() => [])
        : []
      const rec = r.recordings as unknown as { recorded_at: string | null; recorded_tz: string | null; source: string | null } | null
      const { recordings: _r, ...rest } = r
      return { ...rest, references, place: rec ? WHERE[rec.source ?? ''] ?? (rec.recorded_at ? `${WEEKDAY(rec.recorded_at, rec.recorded_tz)}'s note` : null) : null }
    })
  )
  return NextResponse.json({
    unlocked: cards >= DIRECTIONS_MIN_CARDS,
    generating: due,
    ivy_line: ivyLine(directions.length, directions.map((d) => d.place).filter((p): p is string => !!p)),
    directions,
  })
}
