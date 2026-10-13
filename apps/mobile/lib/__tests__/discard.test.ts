// Job B.3 — Discard: × on the listening screen, Undo on Home, and Move to trash.
import { closeDecision, DISCARD_SILENT_MS, justRecorded, onJustRecorded, setJustRecorded, undoLeft, UNDO_MS } from '../discard'
import { discardRecording } from '../deleteRecording'
import { purgeLine, restore, trashAction, trashCard } from '../trash'

/**
 * A stand-in Supabase client that logs every call in order. Each awaited query resolves to `result(table, ops)`.
 */
function fakeSupabase(result: (table: string, ops: string[]) => { data?: unknown; error?: null | { message: string }; count?: number } = () => ({})) {
  const log: string[] = []
  const query = (table: string) => {
    const ops: string[] = []
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'update', 'delete', 'insert', 'eq', 'neq', 'not', 'is', 'in', 'or', 'order', 'limit', 'maybeSingle', 'single']) {
      builder[m] = (...args: unknown[]) => {
        ops.push(m === 'update' ? `update ${Object.keys(args[0] as object).join(',')}` : m)
        return builder
      }
    }
    builder.then = (resolve: (v: unknown) => void) => {
      log.push(`${table}: ${ops.join(' ')}`)
      resolve({ data: null, error: null, count: 1, ...result(table, ops) })
    }
    return builder
  }
  const client = {
    from: (table: string) => query(table),
    rpc: async (fn: string, args?: object) => {
      log.push(`rpc ${fn} ${JSON.stringify(args ?? {})}`)
      return { data: null, error: null, ...result(`rpc ${fn}`, []) }
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          log.push(`storage ${bucket}: remove ${paths.join(',')}`)
          return { data: [], error: null }
        },
      }),
    },
  }
  return { client: client as never, log }
}

describe('× on the listening screen', () => {
  it('drops a take under 5 s silently', () => {
    expect(closeDecision({ tookMs: DISCARD_SILENT_MS - 1, peakDb: -20, imported: false })).toBe('drop')
  })
  it('drops a take with no speech, however long', () => {
    expect(closeDecision({ tookMs: 30_000, peakDb: -60, imported: false })).toBe('drop')
  })
  it('asks (Keep / Discard) for 5 s or more with speech', () => {
    expect(closeDecision({ tookMs: DISCARD_SILENT_MS, peakDb: -25, imported: false })).toBe('ask')
  })
  it('asks when the mic never reported a level — no level isn’t silence', () => {
    expect(closeDecision({ tookMs: 8000, peakDb: null, imported: false })).toBe('ask')
  })
  it('always asks for an import: its picture is already uploaded', () => {
    expect(closeDecision({ tookMs: 500, peakDb: -70, imported: true })).toBe('ask')
  })
})

describe('Undo on Home', () => {
  afterEach(() => setJustRecorded(null))

  it('hands the take from Record to Home, for 6 s from stop', () => {
    const seen: (string | null)[] = []
    const off = onJustRecorded((j) => seen.push(j?.recordingId ?? null))
    setJustRecorded({ recordingId: 'r1', storagePath: 'u/r1.m4a', stoppedAt: 1000 })
    expect(justRecorded()?.recordingId).toBe('r1')
    expect(undoLeft(justRecorded(), 1000)).toBe(UNDO_MS)
    expect(undoLeft(justRecorded(), 1000 + UNDO_MS - 1)).toBe(1)
    expect(undoLeft(justRecorded(), 1000 + UNDO_MS)).toBe(0)
    off()
    setJustRecorded(null)
    expect(seen).toEqual(['r1'])
  })

  it('stamps discarded_at first (the pipeline’s stop signal), then deletes audio, transcript and the row — and logs nothing to credits', async () => {
    const { client, log } = fakeSupabase((table) => (table === 'cards' || table === 'actions' || table === 'rpc trashed_items' ? { data: [] } : {}))
    await discardRecording(client, { id: 'r1', storage_path: 'u/r1.m4a' })
    expect(log[0]).toBe('recordings: update discarded_at eq')
    expect(log).toContain('storage recordings: remove u/r1.m4a')
    // The transcript and segments live on and under the row: deleting it takes them (0007 cascade).
    expect(log[log.length - 1]).toBe('recordings: delete eq')
    expect(log.some((l) => l.includes('credit'))).toBe(false)
  })

  it('also removes what the pipeline had already made, trashed rows included', async () => {
    const { client, log } = fakeSupabase((table) => {
      if (table === 'cards') return { data: [{ frame_url: 'https://x.supabase.co/storage/v1/object/public/frames/u/cards/c1.jpg', media_path: null }] }
      if (table === 'rpc trashed_items')
        return { data: [{ kind: 'idea', recording_id: 'r1', frame_url: 'https://x.supabase.co/storage/v1/object/public/frames/u/cards/c2.jpg', media_path: 'u/c2.mov' }] }
      if (table === 'actions') return { data: [] }
      return {}
    })
    await discardRecording(client, { id: 'r1', storage_path: 'u/r1.m4a' })
    expect(log).toContain('storage frames: remove u/cards/c1.jpg,u/cards/c2.jpg')
    expect(log).toContain('storage imports: remove u/c2.mov')
  })

  it('stops if the stamp fails, deleting nothing', async () => {
    const { client, log } = fakeSupabase((table, ops) => (table === 'recordings' && ops[0]?.startsWith('update') ? { error: { message: 'offline' } } : {}))
    await expect(discardRecording(client, { id: 'r1', storage_path: 'u/r1.m4a' })).rejects.toThrow('discard: offline')
    expect(log.some((l) => l.startsWith('storage'))).toBe(false)
  })
})

describe('Move to trash', () => {
  it('trashes an idea through trash_card and reports the to-dos it carried', async () => {
    const { client, log } = fakeSupabase(() => ({ data: { card: 'c1', actions: 2 } }))
    expect(await trashCard(client, 'c1')).toEqual({ actions: 2 })
    expect(log).toEqual(['rpc trash_card {"p_card":"c1"}'])
  })
  it('says so when the idea has already gone', async () => {
    const { client } = fakeSupabase(() => ({ data: null }))
    await expect(trashCard(client, 'c1')).rejects.toThrow('This idea has gone.')
  })
  it('trashes a to-do through trash_action', async () => {
    const { client, log } = fakeSupabase(() => ({ data: true }))
    await trashAction(client, 't1')
    expect(log).toEqual(['rpc trash_action {"p_action":"t1"}'])
  })
  it('restores each kind through its own function', async () => {
    const { client, log } = fakeSupabase(() => ({ data: true }))
    await restore(client, { kind: 'idea', id: 'c1' })
    await restore(client, { kind: 'to-do', id: 't1' })
    expect(log).toEqual(['rpc restore_card {"p_card":"c1"}', 'rpc restore_action {"p_action":"t1"}'])
  })
  it('counts down to the purge in whole days', () => {
    const now = new Date('2026-10-13T09:00:00Z')
    expect(purgeLine('2026-11-12T09:00:00Z', now)).toBe('Deletes in 30 days')
    expect(purgeLine('2026-10-14T08:00:00Z', now)).toBe('Deletes tomorrow')
    expect(purgeLine('2026-10-13T08:00:00Z', now)).toBe('Deletes today')
  })
})
