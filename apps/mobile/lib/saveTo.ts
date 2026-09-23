// apps/mobile/lib/saveTo.ts
// Save to (P10): her projects, placed for the picker. Top choices are where the idea lives now ("saved here") and
// My things — or, if it already lives in My things, the project she's used most recently. Your projects is the rest,
// most recently used first. Each row carries a thumbnail: the project's newest frame, else a palette block.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PickerProject {
  id: string
  name: string
  kind: 'things' | 'mini' | 'user'
  ideas: number
  thumbUrl: string | null
  /** Newest thing in it (ISO), or when it was made — orders the list. */
  lastUsed: string
}

export interface Picker {
  current: PickerProject | null
  top: PickerProject[]
  yours: PickerProject[]
}

function need<T>(label: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`)
  return r.data
}

type ProjectRow = { id: string; name: string; kind: PickerProject['kind']; created_at: string }
type ItemRow = { project_id: string; frame_url: string | null; frame_status: string; created_at: string }

export async function loadPicker(supabase: SupabaseClient, currentId: string | null): Promise<Picker> {
  const [projects, cards, actions] = await Promise.all([
    supabase.from('projects').select('id, name, kind, created_at'),
    supabase.from('cards').select('project_id, frame_url, frame_status, created_at').order('created_at', { ascending: false }),
    supabase.from('actions').select('project_id, frame_url, frame_status, created_at').order('created_at', { ascending: false }),
  ])
  const cardRows = need('cards', cards) as ItemRow[]
  // Actions count toward recency and thumbnails (My things is mostly to-dos) but not toward "N ideas".
  const items = [...cardRows, ...(need('actions', actions) as ItemRow[])].sort((a, b) => b.created_at.localeCompare(a.created_at))

  const all: PickerProject[] = (need('projects', projects) as ProjectRow[]).map((p) => {
    const newest = items.find((i) => i.project_id === p.id)
    const framed = items.find((i) => i.project_id === p.id && i.frame_status === 'done' && i.frame_url)
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      ideas: cardRows.filter((c) => c.project_id === p.id).length,
      thumbUrl: framed?.frame_url ?? null,
      lastUsed: newest?.created_at ?? p.created_at,
    }
  })
  all.sort((a, b) => b.lastUsed.localeCompare(a.lastUsed))

  const current = all.find((p) => p.id === currentId) ?? null
  const things = all.find((p) => p.kind === 'things') ?? null
  const top: PickerProject[] = []
  if (current) top.push(current)
  if (things && things !== current) top.push(things)
  else {
    const recent = all.find((p) => p.kind === 'user' && p !== current)
    if (recent) top.push(recent)
  }
  // Ivy Mini is where the Mini's sessions land; it's only a choice here once something is in it.
  const yours = all.filter((p) => !top.includes(p) && (p.kind !== 'mini' || p.ideas > 0))
  return { current, top, yours }
}

/** Move the idea. The place_in_project trigger (0011/0016) refuses a project that isn't hers. */
export async function moveCard(supabase: SupabaseClient, cardId: string, projectId: string) {
  const { data, error } = await supabase.from('cards').update({ project_id: projectId }).eq('id', cardId).select('id')
  if (error) throw new Error(`move: ${error.message}`)
  // An update that matches nothing isn't an error to PostgREST — the idea was deleted, or isn't hers.
  if (!data?.length) throw new Error('This idea has gone.')
}

/** Make a project, or return the one she already has by that name (names are unique per creator, ignoring case). */
export async function createProject(supabase: SupabaseClient, creatorId: string, name: string): Promise<string> {
  const clean = name.trim().replace(/\s+/g, ' ')
  const { data, error } = await supabase.from('projects').insert({ creator_id: creatorId, name: clean }).select('id').single()
  if (data) return data.id
  if (error?.code !== '23505') throw new Error(`create: ${error?.message ?? 'no project came back'}`)
  const mine = need('projects', await supabase.from('projects').select('id, name')) as { id: string; name: string }[]
  const existing = mine.find((p) => p.name.trim().toLowerCase() === clean.toLowerCase())
  if (!existing) throw new Error(`create: ${error.message}`)
  return existing.id
}

/** "4 ideas · saved here", "to-dos, loose ends, life", "1 idea". */
export function subtitle(p: PickerProject, savedHere: boolean): string {
  const count = p.kind === 'things' ? 'to-dos, loose ends, life' : `${p.ideas} ${p.ideas === 1 ? 'idea' : 'ideas'}`
  return savedHere ? `${count} · saved here` : count
}

// Figma 83:397 — project blocks without a frame yet: sand, sage, slate, mauve.
const BLOCKS = ['#EDDFC4', '#DCE3D3', '#C9CDD8', '#A69DAE']
export function blockColour(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0
  return BLOCKS[Math.abs(h) % BLOCKS.length]
}
