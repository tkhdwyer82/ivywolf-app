/// <reference types="jest" />
// Home v4 (Figma 1737:5): every idea is a picture with the form on it, the title and meta under it, the credit on tap.
// Supersedes Job B revised's forms-as-tiles (227:5): the forms now render on top of the picture.
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Tile } from '@/components/Tile'
import type { ActionItem, CardItem } from '@/lib/home'
import { resolvePicture, type Picture } from '@/lib/picture'

jest.mock('expo-symbols', () => ({ SymbolView: () => null }))
jest.mock('@ivywolf/schema', () => ({ LOW_CONFIDENCE: 0.6 }))
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: View }
})
jest.mock('expo-video', () => {
  const { View } = require('react-native')
  return { useVideoPlayer: () => ({ status: 'idle', duration: 0 }), VideoView: View }
})
jest.mock('expo', () => ({ ...jest.requireActual('expo'), useEvent: (_p: unknown, _e: string, initial: unknown) => initial }))

const unsplash: Picture = resolvePicture({
  own: [],
  unsplash: { url: 'https://images.unsplash.com/photo-1', photographer: 'Ana Ruiz', photographerUrl: 'https://unsplash.com/@ana', photoUrl: 'https://unsplash.com/photos/1' },
  reference: null,
})
const hue: Picture = resolvePicture({ own: [], unsplash: null, reference: null })

const base = { at: '2026-09-28T02:00:00Z', projectId: 'p-launch', recordingId: 'r1', frameAt: null }
const idea = (over: Partial<CardItem> = {}): CardItem =>
  ({
    ...base,
    kind: 'card',
    id: 'c1',
    title: 'Rooftop chase, night',
    gist: 'She leaps the roof and radios through.',
    playFromMs: 31_000,
    confidence: 0.9,
    frameUrl: 'https://images.unsplash.com/photo-1',
    frameStatus: 'done',
    storagePath: 'u/r1.m4a',
    threadSize: 2,
    shape: 'photo',
    quote: null,
    diagram: null,
    board: null,
    credit: null,
    picture: unsplash,
    recordingSource: 'mini',
    threadStage: 'ready',
    projectName: 'Launch video',
    hue: 'butter',
    createdAt: '2026-09-28T02:00:00Z',
    links: 0,
    ...over,
  }) as CardItem
const todo: ActionItem = { ...base, kind: 'action', id: 'a1', text: 'Get milk for the office', done: false, dueDate: '2026-10-02', frameUrl: null, frameStatus: 'none' } as ActionItem

describe('Tile', () => {
  it('a picture, then the title and the meta (time · project) under it', async () => {
    await render(<Tile item={idea()} onOpen={() => {}} />)
    expect(screen.getByText('Rooftop chase, night')).toBeTruthy()
    expect(screen.getByText('0:31 · Launch video')).toBeTruthy()
  })

  it('the credit shows on tap, and opening it is the use', async () => {
    const onCredit = jest.fn()
    const onOpen = jest.fn()
    await render(<Tile item={idea()} onOpen={onOpen} onCredit={onCredit} />)
    expect(screen.queryByText('Ana Ruiz')).toBeNull()
    await fireEvent.press(screen.getByHintText('Shows who made the picture.'))
    await fireEvent.press(screen.getByText('Ana Ruiz'))
    expect(onCredit).toHaveBeenCalledWith(unsplash)
  })

  it('quote: the line in white on the picture, no title under it', async () => {
    await render(<Tile item={idea({ shape: 'quote', quote: { text: 'The names read as a poem.', speaker: null } })} />)
    expect(screen.getByText('“The names read as a poem.”')).toBeTruthy()
    expect(screen.queryByText('Rooftop chase, night')).toBeNull()
  })

  it('no picture yet: the project hue block carries the title, and the meta says a picture is being found', async () => {
    const now = new Date().toISOString()
    await render(<Tile item={idea({ picture: hue, shape: 'text', createdAt: now })} />)
    expect(screen.getByText('Rooftop chase, night')).toBeTruthy()
    expect(screen.getByText('0:31 · Launch video · finding a picture…')).toBeTruthy()
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
