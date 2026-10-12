// apps/mobile/lib/directionOfDay.ts
// The direction tile on Home (v4, 1737:152): one outside tile a day. The newest direction (suggestions.kind
// 'direction', status 'new') across her projects, lime-pilled "IVY · DIRECTION", with its picture by rule 1 and its
// cite line. Tap opens that project's More ideas; hold → Save / Not this. Once she saves or dismisses it, Home shows
// no direction until tomorrow — the next one doesn't step in. Which one is today's, and whether it's gone, is kept on
// the phone (SecureStore): it's how Home looks, not part of her graph.

import type { SupabaseClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import type { HueName } from '@ivywolf/ui'
import { localDay } from './home'
import type { ReferencePicture } from './picture'

export interface HomeDirection {
  id: string
  projectId: string
  projectName: string
  hue: HueName | null
  title: string
  /** "from Thu 0:31: “…”" */
  why: string
  generatedAt: string
}

/** What Home remembers: the day, the direction it showed that day, and whether she's done with it. */
export interface DayState {
  day: string
  id: string | null
  gone: boolean
}

/**
 * Today's direction. On a new day, the newest candidate becomes today's. On the same day, the one already chosen stays
 * — or none, once she saved or dismissed it, or it's no longer new. Returns the direction and the state to keep.
 */
export function pickDirection(state: DayState | null, candidates: HomeDirection[], today: string): { direction: HomeDirection | null; state: DayState } {
  if (state && state.day === today) {
    if (state.gone || !state.id) return { direction: null, state }
    return { direction: candidates.find((d) => d.id === state.id) ?? null, state }
  }
  const newest = [...candidates].sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : a.generatedAt > b.generatedAt ? -1 : 0))[0] ?? null
  return { direction: newest, state: { day: today, id: newest?.id ?? null, gone: false } }
}

/** Saved or dismissed: gone for the rest of the day. */
export const doneForToday = (state: DayState): DayState => ({ ...state, gone: true })

/** "from Thu 0:31 · Restock Reel" (1737:156): when her words were said, and where the direction lives. */
export function directionMeta(d: Pick<HomeDirection, 'why' | 'projectName'>): string {
  const at = /^from ([^:]+?\d+:\d\d)/.exec(d.why)?.[1]
  return [at ? `from ${at}` : null, d.projectName].filter(Boolean).join(' · ')
}

const KEY = 'home.direction'

export async function readDayState(): Promise<DayState | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    return raw ? (JSON.parse(raw) as DayState) : null
  } catch {
    return null
  }
}

export async function writeDayState(state: DayState): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(state)).catch(() => {})
}

/** Her new directions, newest first, across every project (her own rows, RLS). */
export async function loadNewDirections(supabase: SupabaseClient): Promise<HomeDirection[]> {
  const { data, error } = await supabase
    .from('suggestions')
    .select('id, project_id, title, why, generated_at, projects(name, hue)')
    .eq('kind', 'direction')
    .eq('status', 'new')
    .order('generated_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(`directions: ${error.message}`)
  type Row = { id: string; project_id: string; title: string; why: string | null; generated_at: string; projects: { name: string; hue: HueName | null } | null }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    projectName: r.projects?.name ?? '',
    hue: r.projects?.hue ?? null,
    title: r.title,
    why: r.why ?? '',
    generatedAt: r.generated_at,
  }))
}

/** Today's direction for Home, remembered for the day. */
export async function directionOfDay(supabase: SupabaseClient, now = new Date()): Promise<HomeDirection | null> {
  const [state, candidates] = await Promise.all([readDayState(), loadNewDirections(supabase)])
  const picked = pickDirection(state, candidates, localDay(now.toISOString()))
  if (JSON.stringify(picked.state) !== JSON.stringify(state)) await writeDayState(picked.state)
  return picked.direction
}

export async function dismissForToday(): Promise<void> {
  const state = await readDayState()
  if (state) await writeDayState(doneForToday(state))
}

const API_URL = process.env.EXPO_PUBLIC_API_URL!

/** A direction's picture by rule 1: it has none of its own, so its first stock reference (Unsplash or Pixabay). */
export async function directionPicture(token: string, id: string): Promise<ReferencePicture | null> {
  const res = await fetch(`${API_URL}/api/references?suggestion_id=${id}&limit=1&sources=stock`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const [r] = (await res.json()) as { source: string; id: string; full_url: string; thumb_url: string; link_url: string; credit: { name: string; url: string }; width: number; height: number; track_url?: string }[]
  if (!r || (r.source !== 'unsplash' && r.source !== 'pixabay')) return null
  return { source: r.source, id: r.id, url: r.full_url, thumb_url: r.thumb_url, link_url: r.link_url, credit: r.credit, width: r.width, height: r.height, track_url: r.track_url }
}
