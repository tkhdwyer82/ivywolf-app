/// <reference types="jest" />
// Job G §5.7: an idea tile renders no text nodes — v3.4b, ideas are looked at; to-dos are read.
import { render, screen } from '@testing-library/react-native'
import { Tile } from '@/components/Tile'
import type { ActionItem, CardItem } from '@/lib/home'

jest.mock('expo-symbols', () => ({ SymbolView: () => null }))
jest.mock('@ivywolf/schema', () => ({ LOW_CONFIDENCE: 0.6 }))

const base = { at: '2026-09-28T02:00:00Z', projectId: 'p-things', recordingId: 'r1', frameAt: null }
const idea = (over: Partial<CardItem> = {}): CardItem =>
  ({
    ...base,
    kind: 'card',
    id: 'c1',
    title: 'Restock day — the box tips over first',
    gist: 'The box tips over before the reveal.',
    playFromMs: 31_000,
    confidence: 0.9,
    frameUrl: 'https://example.com/frame.jpg',
    frameStatus: 'done',
    storagePath: 'u/r1.m4a',
    threadSize: 2,
    ...over,
  }) as CardItem
const todo: ActionItem = { ...base, kind: 'action', id: 'a1', text: 'Get milk for the office', done: false, dueDate: '2026-10-02', frameUrl: null, frameStatus: 'none' } as ActionItem

type Node = { type: string; children: (Node | string)[] | null }
/** Every host Text node in what was drawn. */
function texts(): Node[] {
  const out: Node[] = []
  const walk = (n: Node | Node[] | string | null) => {
    if (!n || typeof n === 'string') return
    if (Array.isArray(n)) return n.forEach(walk)
    if (n.type === 'Text') out.push(n)
    n.children?.forEach(walk)
  }
  walk(screen.toJSON() as Node | Node[] | null)
  return out
}

describe('Tile', () => {
  it('draws no text on an idea with a frame', async () => {
    await render(<Tile item={idea()} onOpen={() => {}} />)
    expect(texts()).toHaveLength(0)
    expect(screen.queryByText(/Restock day/)).toBeNull()
    expect(screen.getByLabelText('Restock day — the box tips over first')).toBeTruthy() // VoiceOver still reads it
  })

  it('draws no text on an idea still waiting for its frame — the shimmer, not the title', async () => {
    await render(<Tile item={idea({ frameUrl: null, frameStatus: 'queued' })} />)
    expect(texts()).toHaveLength(0)
    expect(screen.getByTestId('shimmer')).toBeTruthy()
  })

  it('draws no text on an unsure idea (the idea page says "Ivy isn’t sure")', async () => {
    await render(<Tile item={idea({ confidence: 0.4 })} />)
    expect(texts()).toHaveLength(0)
    expect(screen.getByLabelText(/Ivy isn’t sure/)).toBeTruthy()
  })

  it('reads a to-do: its title and meta', async () => {
    await render(<Tile item={todo} meta="My things · Thu" />)
    expect(screen.getByText('Get milk for the office')).toBeTruthy()
    expect(screen.getByText('My things · Thu')).toBeTruthy()
    expect(texts().length).toBeGreaterThan(0) // the counter works: it finds text where there is some
  })
})
