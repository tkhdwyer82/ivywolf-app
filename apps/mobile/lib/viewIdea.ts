// apps/mobile/lib/viewIdea.ts
// View idea (B.8a, I3 2151:106): her full words (lib/transcript.ts, chaptered as the transcript is), then the Ivy
// thread under them — the other ideas in her thread, the directions that cite this idea, and Ivy's notes that cite its
// recording. All read under her RLS; nothing new on the backend, nothing written.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ThreadIdea {
  id: string
  title: string
}
export interface DirectionNote {
  id: string
  title: string
  gist: string | null
  why: string | null
}
export interface IvyNote {
  id: string
  text: string
  at: string
}
export interface IvyThread {
  title: string | null
  ideas: ThreadIdea[]
  directions: DirectionNote[]
  notes: IvyNote[]
}

export async function loadIvyThread(supabase: SupabaseClient, cardId: string, recordingId: string | null): Promise<IvyThread> {
  const { data: tc } = await supabase.from('thread_cards').select('threads(id, title)').eq('card_id', cardId).maybeSingle()
  const thread = (tc?.threads as unknown as { id: string; title: string } | null) ?? null
  const [ideas, directions, notes] = await Promise.all([
    thread
      ? supabase.from('thread_cards').select('cards(id, title, trashed_at)').eq('thread_id', thread.id)
      : Promise.resolve({ data: [] as unknown[], error: null }),
    supabase.from('suggestions').select('id, title, gist, why, status').eq('kind', 'direction').contains('cite_card_ids', [cardId]).neq('status', 'dismissed').order('generated_at', { ascending: false }).limit(5),
    recordingId
      ? supabase.from('ivy_utterances').select('id, text, created_at').contains('cites', [{ recording_id: recordingId }]).order('created_at').limit(10)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ])
  return {
    title: thread?.title ?? null,
    ideas: ((ideas.data ?? []) as { cards: { id: string; title: string; trashed_at: string | null } | null }[])
      .map((r) => r.cards)
      .filter((c): c is { id: string; title: string; trashed_at: string | null } => !!c && c.id !== cardId && !c.trashed_at)
      .map((c) => ({ id: c.id, title: c.title })),
    directions: ((directions.data ?? []) as { id: string; title: string; gist: string | null; why: string | null }[]).map((d) => ({ id: d.id, title: d.title, gist: d.gist, why: d.why })),
    notes: ((notes.data ?? []) as { id: string; text: string; created_at: string }[]).map((n) => ({ id: n.id, text: n.text, at: n.created_at })),
  }
}

/** True when there's nothing for the Ivy thread to show — the section isn't drawn (never an empty list). */
export const threadEmpty = (t: IvyThread) => !t.ideas.length && !t.directions.length && !t.notes.length
