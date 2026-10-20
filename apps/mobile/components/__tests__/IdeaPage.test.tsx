/// <reference types="jest" />
// B.8a: the idea page, Pinterest-clean (Figma v5.0 I1 2151:5). Top to bottom: the picture with only back and •••
// over it; ♥ · ◯ · ↑ and Save; who; the snippet and View idea; Make with (✦ Recipe, its badge); More to explore.
// Gone: More in this thread, the thread pill, the credit line under the picture (••• → Photo credit), the Talk bar.
// Snapshots for a video idea, a text idea, the saved state, and the to-do page (a to-do opens its own page, unchanged).
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import IdeaPage from '@/app/idea/[id]'
import TodoPage from '@/app/todo/[id]'
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
jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: async () => 'tok', userId: 'u1' }),
  useUser: () => ({ user: { fullName: 'Tim Dwyer', firstName: 'Tim', imageUrl: null } }),
}))
jest.mock('@/lib/supabase', () => ({ useSupabase: () => ({}) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ pause: jest.fn(), play: jest.fn(), replace: jest.fn(), seekTo: jest.fn() }) }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('expo-symbols', () => ({ SymbolView: () => null }))
jest.mock('@ivywolf/schema', () => ({ LOW_CONFIDENCE: 0.6 }))
jest.mock('@/components/ShareSheet', () => ({ ShareSheet: () => null }))
jest.mock('@/components/AddContextSheet', () => ({ AddContextSheet: () => null }))
jest.mock('@/components/RecipeSheet', () => {
  const { Text } = require('react-native')
  return { RecipeSheet: () => <Text>RECIPE SHEET</Text> }
})
jest.mock('@/components/CardFace', () => {
  const { Text } = require('react-native')
  return { CardFace: ({ card }: { card: { shape: string } }) => <Text>{`FORM:${card.shape}`}</Text>, Credit: () => null, SHAPE_NAME: {} }
})
jest.mock('@/components/Tile', () => {
  const { Pressable, Text } = require('react-native')
  return {
    Tile: ({ item, onOpen }: { item: { id: string; title: string }; onOpen: (i: unknown) => void }) => (
      <Pressable onPress={() => onOpen(item)} testID={`tile-${item.id}`}>
        <Text>{`TILE:${item.title}`}</Text>
      </Pressable>
    ),
  }
})
jest.mock('expo-video', () => {
  const { View } = require('react-native')
  return { useVideoPlayer: () => ({ status: 'idle', duration: 0 }), VideoView: () => <View testID="poster" />, useEvent: () => ({ status: 'idle' }) }
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
jest.mock('@/lib/idea', () => ({ ...jest.requireActual('@/lib/idea'), loadIdea: jest.fn() }))
jest.mock('@/lib/related', () => ({ loadRelated: jest.fn() }))
jest.mock('@/lib/recipes', () => ({
  MAKE_LABEL: { write: 'Make words', still: 'Make stills', video: 'Make video', cut: 'Make a cut' },
  loadStepCard: jest.fn(async () => null),
  draftCount: jest.fn(async () => 0),
}))
jest.mock('@/lib/todo', () => ({ ...jest.requireActual('@/lib/todo'), loadTodo: jest.fn() }))
jest.mock('@/components/Nav', () => ({ Nav: () => null }))

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } }
const { loadIdea } = jest.requireMock('@/lib/idea') as { loadIdea: jest.Mock }
const { loadRelated } = jest.requireMock('@/lib/related') as { loadRelated: jest.Mock }
const { draftCount, loadStepCard } = jest.requireMock('@/lib/recipes') as { draftCount: jest.Mock; loadStepCard: jest.Mock }
const { loadTodo } = jest.requireMock('@/lib/todo') as { loadTodo: jest.Mock }

const card = (over: Record<string, unknown> = {}) => ({
  kind: 'card',
  id: 'c1',
  title: 'Rooftop chase, night',
  shape: 'photo',
  hue: 'coral',
  picture: resolvePicture({ own: [], unsplash: null, reference: null }),
  credit: null,
  pinnedAt: null,
  sharedAt: null,
  ...over,
})

const base = {
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
  durationMs: 31_000,
  project: { id: 'things', name: 'My things', kind: 'things' },
  thread: { id: 't1', title: 'Rooftop', returnCount: 3 },
  siblings: [{ id: 'c2', title: 'Second take', frameUrl: null, frameStatus: 'typographic', playFromMs: 0, storagePath: null, recordedAt: null }],
  card: card(),
  shapeSetBy: null,
  hasVisualQuery: false,
  said: 'So the chase ends on the roof. She leaps and radios through.',
}
const idea = (over: Record<string, unknown> = {}) => ({ ...base, ...over }) as unknown as Idea

const VIDEO = idea({
  card: card({ picture: { source: 'created', uri: 'https://x/take.mp4', kind: 'video', credit: null, linkUrl: null, trackUrl: null } }),
})
const TEXT = idea({ card: card({ shape: 'text' }) })
const SAVED = idea({ project: { id: 'p-launch', name: 'Launch video', kind: 'user' } })

async function open(i: Idea) {
  loadIdea.mockResolvedValue(i)
  const r = await render(<IdeaPage />)
  await screen.findByTestId('idea-save')
  // Let the related ideas and the draft count land too.
  await act(async () => {})
  return r
}

beforeEach(() => {
  jest.clearAllMocks()
  loadRelated.mockResolvedValue([])
  draftCount.mockResolvedValue(0)
  loadStepCard.mockResolvedValue(null)
})

describe('Idea page (B.8a)', () => {
  it('has only back and ••• over the picture — no heart, Share pill or Talk bar', async () => {
    await open(base as unknown as Idea)
    expect(screen.getByTestId('idea-back')).toBeTruthy()
    expect(screen.getByTestId('idea-more')).toBeTruthy()
    expect(screen.queryByText('Share')).toBeNull() // the ink Share pill is gone; ↑ is an icon in the row
    expect(screen.queryByLabelText('Correct by voice')).toBeNull()
    expect(screen.queryByText('Talk')).toBeNull()
  })

  it('drops More in this thread and the thread pill', async () => {
    await open(base as unknown as Idea)
    expect(screen.queryByText('More in this thread')).toBeNull()
    expect(screen.queryByText(/×3/)).toBeNull()
    expect(screen.queryByText('Second take')).toBeNull()
  })

  it('one action row: ♥ ◯ ↑ and a lime Save; ◯ opens View idea', async () => {
    await open(base as unknown as Idea)
    expect(screen.getByTestId('idea-like')).toBeTruthy()
    expect(screen.getByTestId('idea-share')).toBeTruthy()
    expect(screen.getByTestId('idea-save')).toHaveTextContent('Save')
    await fireEvent.press(screen.getByTestId('idea-thread'))
    expect(router.push).toHaveBeenCalledWith('/idea/view/c1')
  })

  it('saved: ink "Saved · {project}"', async () => {
    await open(SAVED)
    expect(screen.getByTestId('idea-save')).toHaveTextContent('Saved · Launch video')
  })

  it('who: her name and "{duration} · {project}"', async () => {
    await open(SAVED)
    expect(screen.getByText('Tim Dwyer')).toBeTruthy()
    expect(screen.getByTestId('idea-who')).toHaveTextContent('0:31 · Launch video')
  })

  it('the snippet is her words in quotes, two lines, then View idea', async () => {
    await open(base as unknown as Idea)
    const s = screen.getByTestId('idea-snippet')
    expect(s).toHaveTextContent('“So the chase ends on the roof. She leaps and radios through.”')
    expect(s.props.numberOfLines).toBe(2)
    await fireEvent.press(screen.getByTestId('idea-view'))
    expect(router.push).toHaveBeenCalledWith('/idea/view/c1')
  })

  it('Make with: ✦ Recipe with her drafts as its badge, opening the recipe sheet', async () => {
    draftCount.mockResolvedValue(2)
    await open(base as unknown as Idea)
    expect(screen.getByText('Make with')).toBeTruthy()
    expect(screen.getByTestId('make-recipe-badge')).toHaveTextContent('2')
    await fireEvent.press(screen.getByTestId('make-recipe'))
    expect(await screen.findByText('RECIPE SHEET')).toBeTruthy()
  })

  it('More to explore: each tile opens its own idea page', async () => {
    loadRelated.mockResolvedValue([card({ id: 'c7', title: 'Stairwell burst' }), card({ id: 'c8', title: 'City behind her' })])
    await open(base as unknown as Idea)
    expect(await screen.findByText('More to explore')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('tile-c8'))
    expect(router.push).toHaveBeenCalledWith('/idea/c8')
  })

  it('no related ideas → no More to explore section (never an empty list)', async () => {
    await open(base as unknown as Idea)
    expect(screen.queryByTestId('more-to-explore')).toBeNull()
  })

  it('a video idea shows its poster, not a playing video or a Talk bar', async () => {
    await open(VIDEO)
    expect(screen.getByTestId('idea-video')).toBeTruthy()
    expect(screen.getByTestId('poster')).toBeTruthy()
  })

  it('an Unsplash photo: one 11pt grey credit line under the picture, and ••• → Photo credit', async () => {
    const credit = { photographer: 'Ana Lee', photographerUrl: 'https://unsplash.com/@ana', photoUrl: 'https://unsplash.com/photos/x' }
    await open(
      idea({ card: card({ credit, picture: { source: 'unsplash', uri: 'https://images/x.jpg', kind: 'image', credit: null, linkUrl: null, trackUrl: null } }) })
    )
    const line = screen.getByTestId('idea-credit')
    expect(line).toHaveTextContent('Photo by Ana Lee on Unsplash')
    expect(line).toHaveStyle({ fontSize: 11, color: '#6E6E73' })
    await fireEvent.press(screen.getByTestId('idea-more'))
    expect(await screen.findByText('Photo credit')).toBeTruthy()
  })

  it('her own photo or a render: no credit line', async () => {
    await open(idea({ card: card({ picture: { source: 'own', uri: 'https://x/mine.jpg', kind: 'image', credit: null, linkUrl: null, trackUrl: null } }) }))
    expect(screen.queryByTestId('idea-credit')).toBeNull()
    await open(idea({ card: card({ picture: { source: 'created', uri: 'https://x/render.png', kind: 'image', credit: null, linkUrl: null, trackUrl: null } }) }))
    expect(screen.queryByTestId('idea-credit')).toBeNull()
  })
})

describe('snapshots', () => {
  it('video idea', async () => {
    const r = await open(VIDEO)
    expect(r.toJSON()).toMatchSnapshot()
  })
  it('text idea', async () => {
    const r = await open(TEXT)
    expect(r.toJSON()).toMatchSnapshot()
  })
  it('saved state', async () => {
    const r = await open(SAVED)
    expect(r.toJSON()).toMatchSnapshot()
  })
  it('to-do (its own page, unchanged by B.8a)', async () => {
    loadTodo.mockResolvedValue({
      id: 't1',
      text: 'Get some milk',
      scope: 'personal',
      priority: 'normal',
      dueDate: '2026-10-21',
      done: false,
      heartedAt: null,
      remindAt: null,
      syncedReminderId: null,
      frameUrl: null,
      frameStatus: 'none',
      project: null,
      recordingId: 'r1',
      recordingTitle: null,
      recordedAt: '2026-10-21T07:40:00Z',
      storagePath: 'u/r1.m4a',
      said: { startMs: 4000, text: 'get some milk on the way back' },
    })
    const r = await render(<TodoPage />)
    await screen.findByText('Get some milk')
    expect(r.toJSON()).toMatchSnapshot()
  })
})
