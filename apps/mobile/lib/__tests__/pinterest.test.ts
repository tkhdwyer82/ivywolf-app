/// <reference types="jest" />
// Pinterest terms, rule 2 (packages/schema/pinterest.ts): a Pinterest signal never reaches style_signals.
import { writeStyleSignal } from '@/lib/styleSignals'

describe('writeStyleSignal and Pinterest', () => {
  it('drops a signal whose source is Pinterest without calling Postgres', async () => {
    const rpc = jest.fn()
    expect(await writeStyleSignal({ rpc } as never, 'suggestion_pin', { source: 'pinterest', field: 'aesthetic' })).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('writes any other source', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 7, error: null })
    expect(await writeStyleSignal({ rpc } as never, 'suggestion_pin', { source: 'youtube' })).toBe(7)
    expect(rpc).toHaveBeenCalledWith('write_style_signal', { p_kind: 'suggestion_pin', p_payload: { source: 'youtube' } })
  })
})
