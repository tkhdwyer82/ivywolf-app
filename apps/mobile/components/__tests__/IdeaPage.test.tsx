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
  // A new getToken every render, as Clerk's — the page must not reload because of it.
  useAuth: () => ({ getToken: async () => 'tok', userId: 'u1' }),
  // No photo of her own: Clerk still hands out an imageUrl — its generated purple placeholder — with hasImage false.
  useUser: () => ({ user: { fullName: 'Tim Dwyer', firstName: 'Tim', imageUrl: 'https://img.clerk.com/default-purple', hasImage: false } }),
}))
// One client for every render, as the real hook gives (lib/supabase.ts).
jest.mock('@/lib/supabase', () => {
  const client = {}
  return { useSupabase: () => client }
})
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
jest.mock('expo-blur', () => {
  const { View } = require('react-native')
  return { BlurView: (p: object) => <View testID="frost" {...p} /> }
})
jest.mock('@/lib/viewIdea', () => ({ loadIvyThread: jest.fn() }))

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } }
const { loadIdea } = jest.requireMock('@/lib/idea') as { loadIdea: jest.Mock }
const { loadRelated } = jest.requireMock('@/lib/related') as { loadRelated: jest.Mock }
const { draftCount, loadStepCard } = jest.requireMock('@/lib/recipes') as { draftCount: jest.Mock; loadStepCard: jest.Mock }
const { loadTodo } = jest.requireMock('@/lib/todo') as { loadTodo: jest.Mock }
const { loadIvyThread } = jest.requireMock('@/lib/viewIdea') as { loadIvyThread: jest.Mock }

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
  // A fresh object per load, as the real loader returns — a page that reloads on every render never settles.
  loadIdea.mockImplementation(async () => ({ ...i }))
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
  loadIvyThread.mockResolvedValue({ title: null, ideas: [], directions: [], notes: [] })
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

  it("saved: Pinterest's split pill — the name opens the project, ˅ opens Save to", async () => {
    await open(SAVED)
    // Just the name (no colour dot), then ˅.
    expect(screen.getByLabelText('Saved to Launch video. Open it')).toBeTruthy()
    expect(screen.getByTestId('idea-saved-name')).toHaveTextContent(/^Launch video/)
    await fireEvent.press(screen.getByTestId('idea-saved-project'))
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/project/[id]', params: { id: 'p-launch' } })
    await fireEvent.press(screen.getByTestId('idea-save-change'))
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/idea/save/[id]', params: { id: 'c1', projectId: 'p-launch' } })
  })

  it('a count after ◯ only when there is one; none after ♥, even liked', async () => {
    await open(base as unknown as Idea)
    expect(screen.queryByTestId('idea-like-count')).toBeNull()
    expect(screen.queryByTestId('idea-thread-count')).toBeNull()
    loadIvyThread.mockResolvedValue({ title: 'Rooftop', ideas: [{ id: 'c2', title: 'Second take' }], directions: [], notes: [{ id: 'n1', text: 'x', at: '' }] })
    await open(idea({ heartedAt: '2026-10-20T00:00:00Z' }))
    expect(screen.queryByTestId('idea-like-count')).toBeNull()
    expect(screen.getByTestId('idea-thread-count')).toHaveTextContent('2')
  })

  it('back and ••• are frosted: a blur under each', async () => {
    await open(base as unknown as Idea)
    expect(screen.getAllByTestId('frost')).toHaveLength(2)
    // Readable on a white photo: a #F2F2F7 0.85 fill and a 6 % ink hairline, on both.
    for (const id of ['idea-back', 'idea-more']) {
      expect(screen.getByTestId(id)).toHaveStyle({ borderWidth: 1, borderColor: 'rgba(29,29,31,0.06)' })
    }
    expect(JSON.stringify(screen.toJSON()).match(/rgba\(242,242,247,0.85\)/g)).toHaveLength(2)
  })

  it('who: her name and "{day} {time} · {project}" — no duration', async () => {
    await open(idea({ ...SAVED, recordedAt: new Date(2026, 9, 19, 7, 40).toISOString() }))
    expect(screen.getByText('Tim Dwyer')).toBeTruthy()
    expect(screen.getByTestId('idea-who')).toHaveTextContent('Mon 7:40 · Launch video')
    expect(screen.queryByText(/0:31/)).toBeNull()
  })

  it("who-line avatar: her initials on the blue gradient, never Clerk's purple placeholder", async () => {
    await open(base as unknown as Idea)
    expect(screen.getByText('TD', { includeHiddenElements: true })).toBeTruthy()
    expect(JSON.stringify(screen.toJSON())).not.toContain('default-purple')
  })

  it('the snippet is her words in quotes, two lines, then View idea', async () => {
    await open(base as unknown as Idea)
    const s = screen.getByTestId('idea-snippet')
    expect(s).toHaveTextContent('“So the chase ends on the roof. She leaps and radios through.”')
    expect(s.props.numberOfLines).toBe(2)
    await fireEvent.press(screen.getByTestId('idea-view'))
    expect(router.push).toHaveBeenCalledWith('/idea/view/c1')
  })

  it('Make with: Video · Stills · Cut · Recipe (no repeated verb), 13 ink, "Soon" 11 grey under the three placeholders', async () => {
    await open(base as unknown as Idea)
    expect(['make-video', 'make-still', 'make-cut', 'make-recipe'].map((t) => !!screen.getByTestId(t))).toEqual([true, true, true, true])
    for (const label of ['Video', 'Stills', 'Cut', 'Recipe']) expect(screen.getByText(label)).toHaveStyle({ fontSize: 13, color: '#1D1D1F' })
    expect(screen.queryByText('Make video')).toBeNull()
    const soon = screen.getAllByText('Soon')
    expect(soon).toHaveLength(3)
    expect(soon[0]).toHaveStyle({ fontSize: 11, color: '#6E6E73' })
  })

  it('section headers as Pinterest\'s: Semibold 20 ink, 28 above and 12 below', async () => {
    loadRelated.mockResolvedValue([card({ id: 'c7', title: 'Stairwell burst' })])
    await open(base as unknown as Idea)
    const header = { fontSize: 20, fontWeight: '600', color: '#1D1D1F', marginTop: 28, marginBottom: 12 }
    expect(screen.getByText('Make with')).toHaveStyle(header)
    expect(await screen.findByText('More to explore')).toHaveStyle(header)
  })

  it('a Make placeholder only says it is coming, for 2 s — nothing else', async () => {
    jest.useFakeTimers()
    await open(base as unknown as Idea)
    await fireEvent.press(screen.getByTestId('make-video'))
    expect(await screen.findByText('Make video is coming in the next build')).toBeTruthy()
    expect(router.push).not.toHaveBeenCalled()
    await act(async () => {
      jest.advanceTimersByTime(2000)
    })
    expect(screen.queryByTestId('make-toast')).toBeNull()
    jest.useRealTimers()
  })

  it('Make with: ✦ Recipe with her drafts as its badge, opening the recipe sheet', async () => {
    draftCount.mockResolvedValue(2)
    await open(base as unknown as Idea)
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

  it('an Unsplash photo: no line under the picture (deferred); ••• → Photo credit keeps the attribution', async () => {
    const credit = { photographer: 'Ana Lee', photographerUrl: 'https://unsplash.com/@ana', photoUrl: 'https://unsplash.com/photos/x' }
    await open(
      idea({ card: card({ credit, picture: { source: 'unsplash', uri: 'https://images/x.jpg', kind: 'image', credit: null, linkUrl: null, trackUrl: null } }) })
    )
    expect(screen.queryByText(/Photo by/)).toBeNull()
    await fireEvent.press(screen.getByTestId('idea-more'))
    expect(await screen.findByText('Photo credit')).toBeTruthy()
  })
})

describe('More to explore loads once (build 26: it re-fetched on every render)', () => {
  it('one related fetch per idea, and the page settles — no reload loop', async () => {
    loadRelated.mockResolvedValue([card({ id: 'c7', title: 'Stairwell burst' })])
    await open(base as unknown as Idea)
    await screen.findByTestId('tile-c7')
    for (let i = 0; i < 10; i++) await act(async () => {})
    expect(loadRelated).toHaveBeenCalledTimes(1)
    expect(loadIdea).toHaveBeenCalledTimes(1)
  })

  it('a new idea id fetches again, once', async () => {
    loadRelated.mockResolvedValue([])
    const params = jest.requireMock('expo-router') as { useLocalSearchParams: () => { id: string } }
    const r = await open(base as unknown as Idea)
    expect(loadRelated).toHaveBeenCalledTimes(1)
    const spy = jest.spyOn(params, 'useLocalSearchParams').mockReturnValue({ id: 'c9' })
    await r.rerender(<IdeaPage />)
    for (let i = 0; i < 5; i++) await act(async () => {})
    expect(loadRelated).toHaveBeenCalledTimes(2)
    expect(loadRelated.mock.calls[1][2]).toBe('c9')
    spy.mockRestore()
  })

  it('nothing related → no section, no grey tiles', async () => {
    loadRelated.mockResolvedValue([])
    await open(base as unknown as Idea)
    expect(screen.queryByTestId('more-to-explore')).toBeNull()
    expect(screen.queryByText('More to explore')).toBeNull()
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
