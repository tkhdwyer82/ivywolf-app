/// <reference types="jest" />
// Job B revised (Figma 227:5): an idea tile takes the form Ivy picked — photo, quote, diagram, board or text. This
// supersedes Job G §5.7's "no text on idea tiles": a photo now carries its title and its Unsplash credit.
import { fireEvent, render, screen } from '@testing-library/react-native'
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
    title: 'Rooftop chase, night',
    gist: 'She leaps the roof and radios through.',
    playFromMs: 760_000,
    confidence: 0.9,
    frameUrl: 'https://images.unsplash.com/photo-1',
    frameStatus: 'done',
    storagePath: 'u/r1.m4a',
    threadSize: 2,
    shape: 'photo',
    quote: null,
    diagram: null,
    board: null,
    credit: { photographer: 'Ana Ruiz', photographerUrl: 'https://unsplash.com/@ana?utm_source=ivywolf&utm_medium=referral', photoUrl: 'https://unsplash.com/photos/1?utm_source=ivywolf&utm_medium=referral' },
    recordingSource: 'mini',
    threadStage: 'ready',
    ...over,
  }) as CardItem
const todo: ActionItem = { ...base, kind: 'action', id: 'a1', text: 'Get milk for the office', done: false, dueDate: '2026-10-02', frameUrl: null, frameStatus: 'none' } as ActionItem

describe('Tile', () => {
  it('photo: the PHOTO pill, the title, and the Unsplash credit', async () => {
    await render(<Tile item={idea()} onOpen={() => {}} />)
    expect(screen.getByText('PHOTO')).toBeTruthy()
    expect(screen.getByText('Rooftop chase, night')).toBeTruthy()
    expect(screen.getByText('Photo by Ana Ruiz on Unsplash')).toBeTruthy()
  })

  it('photo still on its way: the shimmer, and no credit until there is a photo', async () => {
    await render(<Tile item={idea({ frameUrl: null, frameStatus: 'queued', credit: null })} />)
    expect(screen.getByTestId('shimmer')).toBeTruthy()
    expect(screen.queryByText(/Unsplash/)).toBeNull()
  })

  it('quote: the exact line, who said it, and a ▶ chip that plays from play_from_ms', async () => {
    const onPlay = jest.fn()
    const card = idea({ shape: 'quote', quote: { text: 'We scaled the apology.', speaker: 'Arabella' } })
    await render(<Tile item={card} onPlay={onPlay} />)
    expect(screen.getByText('We scaled the apology.')).toBeTruthy()
    expect(screen.getByText('— Arabella')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Play from Mini · 12:40'))
    expect(onPlay).toHaveBeenCalledWith(card)
  })

  it('diagram: the title and each row, from → to', async () => {
    await render(<Tile item={idea({ shape: 'diagram', diagram: { title: 'Old vs new', rows: [{ from: '5am', to: '7am' }, { from: 'Daily', to: 'Batch' }] } })} />)
    expect(screen.getByText('OLD VS NEW')).toBeTruthy()
    for (const w of ['5am', '7am', 'Daily', 'Batch']) expect(screen.getByText(w)).toBeTruthy()
  })

  it('board: the hook, the beats, and the thread’s stage as the pill', async () => {
    await render(<Tile item={idea({ shape: 'board', board: { hook: 'Launch video', beats: ['Hook', 'Turn', 'Reveal'] } })} />)
    for (const w of ['Launch video', 'Hook', 'Turn', 'Reveal', 'BOARD · READY']) expect(screen.getByText(w)).toBeTruthy()
  })

  it('text: the title and gist — and a shape whose payload is missing falls back to it', async () => {
    await render(<Tile item={idea({ shape: 'quote', quote: null })} />)
    expect(screen.getByText('Rooftop chase, night')).toBeTruthy()
    expect(screen.getByText('She leaps the roof and radios through.')).toBeTruthy()
  })

  it('an unsure idea is greyed and says so to VoiceOver (the idea page says "Ivy isn’t sure")', async () => {
    await render(<Tile item={idea({ shape: 'text', confidence: 0.4 })} />)
    expect(screen.getByLabelText(/Ivy isn’t sure/)).toBeTruthy()
  })

  it('reads a to-do: its title and meta', async () => {
    await render(<Tile item={todo} meta="My things · Thu" />)
    expect(screen.getByText('Get milk for the office')).toBeTruthy()
    expect(screen.getByText('My things · Thu')).toBeTruthy()
  })
})
