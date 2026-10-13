// Job B.3: the pipeline stops when a take is discarded, and the 30-day purge.
//   npm test -w @ivywolf/pipeline
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Discarded, isDiscarded, stillWanted } from '../discard'
import { purgeCutoff, purgePlan, purgeTrash } from '../trash'

/** A stand-in client: each awaited query resolves to `answer(table, ops)`; every call is logged in order. */
function fake(answer: (table: string, ops: string[]) => { data?: unknown; error?: { message: string } | null } = () => ({})) {
  const log: string[] = []
  const query = (table: string) => {
    const ops: string[] = []
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'update', 'delete', 'eq', 'neq', 'not', 'is', 'in', 'or', 'lt', 'order', 'maybeSingle']) {
      b[m] = (...args: unknown[]) => {
        ops.push(`${m}${m === 'in' || m === 'eq' ? `(${JSON.stringify(args[1])})` : ''}`)
        return b
      }
    }
    b.then = (resolve: (v: unknown) => void) => {
      log.push(`${table}: ${ops.join(' ')}`)
      resolve({ data: null, error: null, count: ops.includes('delete') ? 1 : 0, ...answer(table, ops) })
    }
    return b
  }
  const client = {
    from: query,
    rpc: async (fn: string) => ({ data: [], error: null, ...answer(`rpc ${fn}`, []) }),
    storage: { from: (bucket: string) => ({ remove: async (paths: string[]) => (log.push(`storage ${bucket}: ${paths.join(',')}`), { error: null }) }) },
  }
  return { client: client as never, log }
}

test('the pipeline carries on while the take is wanted', async () => {
  const { client } = fake(() => ({ data: { discarded_at: null } }))
  await stillWanted(client, 'r1')
})

test('Undo stops the pipeline: a discarded take throws Discarded', async () => {
  const { client } = fake(() => ({ data: { discarded_at: '2026-10-13T09:00:00Z' } }))
  await assert.rejects(stillWanted(client, 'r1'), (e) => isDiscarded(e) && (e as Discarded).recordingId === 'r1')
})

test('a take already deleted counts as discarded', async () => {
  const { client } = fake(() => ({ data: null }))
  await assert.rejects(stillWanted(client, 'r1'), Discarded)
})

test('a failed check is an error, not a discard', async () => {
  const { client } = fake(() => ({ error: { message: 'timeout' } }))
  await assert.rejects(stillWanted(client, 'r1'), (e) => !isDiscarded(e) && /timeout/.test((e as Error).message))
})

test('the cutoff is 30 days back', () => {
  assert.equal(purgeCutoff(new Date('2026-10-13T00:00:00Z')).toISOString(), '2026-09-13T00:00:00.000Z')
})

test('purge plan: discarded takes go whole; a recording goes whole once everything from it is expired', () => {
  const plan = purgePlan({
    discarded: ['rd'],
    expiredCards: [
      { id: 'c1', recording_id: 'r1' }, // r1: everything expired → whole
      { id: 'c2', recording_id: 'r2' }, // r2: a live sibling → this card alone
      { id: 'c3', recording_id: null }, // a pinned card with no recording → alone
    ],
    expiredActions: [
      { id: 'a1', recording_id: 'r1' },
      { id: 'a2', recording_id: 'r2' },
    ],
    liveRecordings: new Set(['r2']),
  })
  assert.deepEqual(plan.recordings.sort(), ['r1', 'rd'])
  assert.deepEqual(plan.cards.sort(), ['c2', 'c3'])
  assert.deepEqual(plan.actions, ['a2'])
})

test('purge plan: nothing expired, nothing discarded — nothing goes', () => {
  assert.deepEqual(purgePlan({ discarded: [], expiredCards: [], expiredActions: [], liveRecordings: new Set() }), { recordings: [], cards: [], actions: [] })
})

test('purgeTrash deletes the whole recording, files first, and the lone card; it never touches credits', async () => {
  const { client, log } = fake((table, ops) => {
    if (table === 'recordings' && ops.includes('not')) return { data: [] } // no discarded takes
    if (table === 'cards' && ops.includes('lt')) return { data: [{ id: 'c1', recording_id: 'r1' }, { id: 'c2', recording_id: 'r2' }] }
    if (table === 'actions' && ops.includes('lt')) return { data: [] }
    if (table === 'cards' && ops.includes('or')) return { data: [{ recording_id: 'r2' }] } // r2 still has a live idea
    if (table === 'actions' && ops.includes('or')) return { data: [] }
    if (table === 'recordings' && ops.some((o) => o.startsWith('in'))) return { data: [{ id: 'r1', storage_path: 'u/r1.m4a' }] }
    if (table === 'cards' && ops.includes('maybeSingle')) return { data: { frame_url: null, media_path: null } }
    if (table === 'cards' || table === 'actions') return { data: [] }
    return {}
  })
  const result = await purgeTrash(new Date('2026-10-13T00:00:00Z'), client)
  assert.deepEqual(result, { recordings: 1, cards: 1, actions: 0, errors: [] })
  const audio = log.indexOf('storage recordings: u/r1.m4a')
  const row = log.findIndex((l) => l.startsWith('recordings: delete eq("r1")'))
  assert.ok(audio >= 0 && row > audio, 'audio removed before the row')
  assert.ok(log.some((l) => l.startsWith('cards: delete eq("c2")')), 'the lone card deleted')
  assert.ok(!log.some((l) => l.includes('c1') && l.includes('delete')), 'c1 goes with its recording, not on its own')
  assert.ok(!log.some((l) => l.includes('credit')))
})
