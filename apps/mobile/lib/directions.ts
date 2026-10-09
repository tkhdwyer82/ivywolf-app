// apps/mobile/lib/directions.ts
// More ideas, free (Job H): her project's directions, through apps/web (GET /api/projects/[id]/directions), and what
// she does to one — Save (+), ♥ and Not this (the hold arc) — through 0038's functions under her own token.
// References come with each direction, looked up live; they steer and are never stored or made into anything.

import type { SupabaseClient } from '@supabase/supabase-js'

const API_URL = process.env.EXPO_PUBLIC_API_URL!

export interface Reference {
  source: 'unsplash' | 'pixabay' | 'pinterest'
  id: string
  thumb_url: string
  full_url: string
  link_url: string
  credit: { name: string; url: string }
  width: number
  height: number
  track_url?: string
}

export interface Direction {
  id: string
  title: string
  gist: string | null
  /** One cited line of her words: from Thu 0:31: “…” */
  why: string
  format: 'photo' | 'quote' | 'board' | 'diagram' | 'text' | 'video'
  visual_query: string | null
  hearted_at: string | null
  generated_at: string
  cite_card_ids: string[]
  references: Reference[]
}

export interface Directions {
  /** The project has the cards More ideas needs (≥ 3): the tab and the bar's More ideas appear. */
  unlocked: boolean
  /** New directions are being written; the ones here are the previous set. */
  generating: boolean
  ivy_line: string | null
  directions: Direction[]
}

export async function loadDirections(token: string, projectId: string, withReferences = true): Promise<Directions> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/directions${withReferences ? '' : '?references=0'}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(res.status === 404 ? 'This project has gone.' : 'More ideas didn’t load')
  return (await res.json()) as Directions
}

/** + : a real card in the project, cite carried, form kept. Returns the card's id. */
export async function saveDirection(supabase: SupabaseClient, id: string): Promise<string> {
  const { data, error } = await supabase.rpc('save_direction', { p_suggestion: id })
  if (error) throw new Error(error.message)
  return data as string
}

export async function heartDirection(supabase: SupabaseClient, id: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc('heart_direction', { p_suggestion: id, p_on: on })
  if (error) throw new Error(error.message)
}

/** Not this: gone for good, and the next set avoids it. */
export async function dismissDirection(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.rpc('dismiss_direction', { p_suggestion: id })
  if (error) throw new Error(error.message)
}

/** She opened a reference: Unsplash's download event (on use, never on display). Never blocks; never throws. */
export function referenceUsed(token: string, r: Reference): void {
  if (r.source !== 'unsplash' || !r.track_url) return
  fetch(`${API_URL}/api/references/use`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: r.source, track_url: r.track_url }),
  }).catch(() => {})
}
