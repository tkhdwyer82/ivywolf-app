/// <reference types="jest" />
// Job G §5.7: the More ideas gate — below 3 returns there's no tab.
import { gateThread, GATE_RETURNS } from '@/lib/suggestions'

const t = (id: string, returnCount: number, lastSeen = '2026-09-28T00:00:00Z') => ({ id, title: id, returnCount, lastSeen })

describe('gateThread', () => {
  it('is closed with no threads', () => expect(gateThread([])).toBeNull())
  it('is closed below 3 returns', () => expect(gateThread([t('a', 0), t('b', 1), t('c', GATE_RETURNS - 1)])).toBeNull())
  it('opens at exactly 3', () => expect(gateThread([t('a', 2), t('b', GATE_RETURNS)])?.id).toBe('b'))
  it('picks the thread she comes back to most, then the most recent', () => {
    expect(gateThread([t('a', 3), t('b', 5), t('c', 4)])?.id).toBe('b')
    expect(gateThread([t('a', 4, '2026-09-20T00:00:00Z'), t('b', 4, '2026-09-27T00:00:00Z')])?.id).toBe('b')
  })
})
