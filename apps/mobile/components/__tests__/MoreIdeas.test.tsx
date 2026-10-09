/// <reference types="jest" />
// Job G §5.7: the tab doesn't render below 3 returns (not greyed); a suggestion tile has no text, one pin.
import { render, screen } from '@testing-library/react-native'
import { ProjectTabs } from '@/components/ProjectTabs'
import { SuggestionTile } from '@/components/SuggestionTile'
import type { Suggestion } from '@/lib/suggestions'

jest.mock('expo-symbols', () => ({ SymbolView: () => null }))

const s: Suggestion = {
  id: 's1', threadId: 't1', nearCardId: null, field: 'format', source: 'youtube', sourceUrl: 'https://example.com/v', sourceHandle: '@example-cuts',
  sourceScore: 12, title: 'Open on the box, not your face', why: null, whyRecordingId: null, whyMs: null, frameUrl: null, rank: 1, createdAt: '2026-09-29T00:00:00Z',
}

type Node = { type: string; children: (Node | string)[] | null }
const count = (type: string) => {
  let n = 0
  const walk = (x: Node | Node[] | string | null) => {
    if (!x || typeof x === 'string') return
    if (Array.isArray(x)) return x.forEach(walk)
    if (x.type === type) n++
    x.children?.forEach(walk)
  }
  walk(screen.toJSON() as Node | null)
  return n
}

describe('More ideas', () => {
  it('always has both tabs (Job I, 165:5), never greyed', async () => {
    await render(<ProjectTabs tab="all" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'All ideas' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'More ideas' })).toBeTruthy()
  })
  it('draws a suggestion as a frame and one pin — no text', async () => {
    await render(<SuggestionTile suggestion={s} onOpen={() => {}} onLongPress={() => {}} />)
    expect(count('Text')).toBe(0)
    expect(screen.getAllByTestId('suggestion-pin')).toHaveLength(1)
    expect(screen.getByLabelText('Open on the box, not your face')).toBeTruthy()
  })
})
