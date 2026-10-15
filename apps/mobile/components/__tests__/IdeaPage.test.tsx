/// <reference types="jest" />
// B.5: the idea page in the to-do page's layout — picture full-bleed, title, her words, More in this thread. No grey
// summary block (the card face and its byline) and no project pill; Move to project is under •••.
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import IdeaPage from '@/app/idea/[id]'
import { resolvePicture } from '@/lib/picture'
import type { Idea } from '@/lib/idea'

jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
    useLocalSearchParams: () => ({ id: 'c1' }),
    useFocusEffect: (f: () => void) => React.useEffect(f, [f]),
  }
})
jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ getToken: async () => null, userId: 'u1' }) }))
jest.mock('@/lib/supabase', () => ({ useSupabase: () => ({}) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ pause: jest.fn(), play: jest.fn(), replace: jest.fn(), seekTo: jest.fn() }) }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('expo-symbols', () => ({ SymbolView: () => null }))
jest.mock('@ivywolf/schema', () => ({ LOW_CONFIDENCE: 0.6 }))
jest.mock('@/components/ShareSheet', () => ({ ShareSheet: () => null }))
jest.mock('@/components/AddContextSheet', () => ({ AddContextSheet: () => null }))
jest.mock('@/components/CardFace', () => {
  const { Text } = require('react-native')
  return { CardFace: ({ card }: { card: { shape: string } }) => <Text>{`FORM:${card.shape}`}</Text>, Credit: () => null, SHAPE_NAME: {} }
})
jest.mock('expo-video', () => {
  const { View } = require('react-native')
  return { useVideoPlayer: () => ({ status: 'idle', duration: 0 }), VideoView: View }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: View }
})
jest.mock('@/components/IdeaTile', () => {
  const { Text } = require('react-native')
  return {
    ...jest.requireActual('@/components/IdeaTile'),
    ThreeUp: ({ pictures }: { pictures: { uri: string }[] }) => <Text>{`GRID:${pictures.map((p) => p.uri).join(',')}`}</Text>,
  }
})
jest.mock('@/lib/idea', () => ({
  ...jest.requireActual('@/lib/idea'),
  loadIdea: jest.fn(),
}))

const { loadIdea } = jest.requireMock('@/lib/idea') as { loadIdea: jest.Mock }

const idea = {
  id: 'c1',
  title: 'Rooftop chase, night',
  gist: 'She leaps the roof and radios through.',
  confidence: 0.9,
  playFromMs: 31_000,
  frameUrl: null,
  frameStatus: 'none',
  source: 'voice',
  sourceUrl: null,
  createdAt: '2026-10-14T09:00:00Z',
  viaMuse: false,
  heartedAt: null,
  recordingId: 'r1',
  storagePath: 'u/r1.m4a',
  recordedAt: '2026-10-14T09:00:00Z',
  project: { id: 'p-launch', name: 'Launch video', kind: 'user' },
  thread: { id: 't1', title: 'Rooftop', returnCount: 3 },
  siblings: [{ id: 'c2', title: 'Second take', frameUrl: null, frameStatus: 'typographic', playFromMs: 0, storagePath: null, recordedAt: null }],
  card: { kind: 'card', id: 'c1', title: 'Rooftop chase, night', shape: 'photo', hue: 'coral', picture: resolvePicture({ own: [], unsplash: null, reference: null }), credit: null, pinnedAt: null, sharedAt: null } ,
  shapeSetBy: null,
  hasVisualQuery: false,
  said: 'So the chase ends on the roof. She leaps and radios through.',
} as unknown as Idea

beforeEach(() => loadIdea.mockResolvedValue(idea))

describe('Idea page (B.5)', () => {
  it('has the picture, the title in Bold 28, her words and More in this thread', async () => {
    await render(<IdeaPage />)
    expect(await screen.findByTestId('idea-picture')).toBeTruthy()
    expect(screen.getByText('Rooftop chase, night')).toHaveStyle({ fontSize: 28, fontWeight: '700' })
    expect(screen.getByText(/So the chase ends on the roof/)).toHaveStyle({ fontSize: 17, lineHeight: 24 })
    expect(screen.getByText('More in this thread')).toBeTruthy()
  })

  it('a photo card: the picture fills the slot — no grey summary block, no project pill', async () => {
    await render(<IdeaPage />)
    await screen.findByTestId('idea-picture')
    expect(screen.queryByText(/^FORM:/)).toBeNull()
    expect(screen.queryByLabelText('Open Launch video')).toBeNull()
    expect(screen.queryByLabelText('Save to another project')).toBeNull()
  })

  it.each(['quote', 'text', 'board'] as const)('a %s card draws its form in the slot instead of a picture', async (shape) => {
    loadIdea.mockResolvedValue({ ...idea, card: { ...idea.card, shape } })
    await render(<IdeaPage />)
    expect(await screen.findByTestId('idea-form')).toBeTruthy()
    expect(screen.getByText(`FORM:${shape}`)).toBeTruthy()
    expect(screen.queryByTestId('idea-picture')).toBeNull()
  })

  it('a board whose thread has three different pictures draws its grid, as its tile does', async () => {
    const own = resolvePicture({ own: [{ uri: 'https://x/own.jpg', kind: 'image', at: '2026-10-14T09:00:00Z', from: 'context' }], unsplash: null, reference: null })
    loadIdea.mockResolvedValue({
      ...idea,
      card: { ...idea.card, shape: 'board', picture: own },
      siblings: [
        { ...idea.siblings[0], id: 'c2', frameUrl: 'https://x/b.jpg' },
        { ...idea.siblings[0], id: 'c3', frameUrl: 'https://x/c.jpg' },
      ],
    })
    await render(<IdeaPage />)
    expect(await screen.findByTestId('idea-grid')).toBeTruthy()
    expect(screen.getByText('GRID:https://x/own.jpg,https://x/b.jpg,https://x/c.jpg')).toBeTruthy()
    expect(screen.queryByText('FORM:board')).toBeNull()
  })

  it('keeps heart and share over the picture; Move to project sits under ••• beside Move to trash', async () => {
    await render(<IdeaPage />)
    await screen.findByTestId('idea-picture')
    expect(screen.getByLabelText('Heart')).toBeTruthy()
    expect(screen.getByText('Share')).toBeTruthy()
    await act(async () => fireEvent.press(screen.getByLabelText('More')))
    const labels = screen.getAllByText(/Move to (project|trash)/).map((t) => t.props.children)
    expect(labels).toEqual(['Move to project', 'Move to trash'])
  })
})
