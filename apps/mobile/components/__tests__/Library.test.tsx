/// <reference types="jest" />
// Inspiration demo (the Ivy library): the hidden way in (holding the IVY wordmark), the test screen — search field,
// mic, people filter, masonry, the newest on open, "off" when the flag is — and a tile's page with More like this.
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Wordmark, LIBRARY_HOLD_MS } from '@/components/Wordmark'
import LibraryScreen from '@/app/inspiration/index'
import LibraryItemPage from '@/app/inspiration/[id]'
import { __forget, __remember, type InspirationItem } from '@/lib/inspiration'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ id: 'a' })),
}))
jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ getToken: async () => 'tok' }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' } }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('expo-symbols', () => ({ SymbolView: () => null }))
jest.mock('expo-blur', () => {
  const { View } = require('react-native')
  return { BlurView: View }
})
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setAudioModeAsync: jest.fn(async () => {}),
  useAudioRecorder: () => ({ isRecording: false, prepareToRecordAsync: jest.fn(), record: jest.fn(), stop: jest.fn(), uri: null }),
}))
jest.mock('expo-video', () => {
  const { View } = require('react-native')
  return { useVideoPlayer: () => ({}), VideoView: () => <View testID="clip" /> }
})
jest.mock('@/lib/inspiration', () => ({
  ...jest.requireActual('@/lib/inspiration'),
  searchLibrary: jest.fn(),
  moreLikeThis: jest.fn(),
  listen: jest.fn(),
}))

const { router, useLocalSearchParams } = jest.requireMock('expo-router') as { router: { push: jest.Mock }; useLocalSearchParams: jest.Mock }
const { searchLibrary, moreLikeThis, LibraryOff } = jest.requireMock('@/lib/inspiration') as {
  searchLibrary: jest.Mock
  moreLikeThis: jest.Mock
  LibraryOff: new () => Error
}

const pic = (id: string, over: Partial<InspirationItem> = {}): InspirationItem => ({
  id, path: `nothing/${id}.jpeg`, kind: 'photo', folder: 'nothing', width: 1000, height: 1000, caption: `Caption ${id}`,
  keywords: ['transparent', 'earbuds'], colours: ['matte black', 'signal red'], shot: 'flat_lay', people: 'none', url: `https://x/${id}`, ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  __forget()
})

describe('the hidden way in', () => {
  it('holding IVY opens the library; a tap does nothing', async () => {
    await render(<Wordmark />)
    expect(screen.getByText('IVY')).toBeTruthy()
    await fireEvent.press(screen.getByTestId('wordmark'))
    expect(router.push).not.toHaveBeenCalled()
    await fireEvent(screen.getByTestId('wordmark'), 'longPress')
    expect(router.push).toHaveBeenCalledWith('/inspiration')
    expect(screen.getByTestId('wordmark').props.delayLongPress ?? LIBRARY_HOLD_MS).toBe(LIBRARY_HOLD_MS)
  })
})

describe('the test screen', () => {
  it('opens on the newest — pictures first, never an empty list', async () => {
    searchLibrary.mockResolvedValue([pic('a'), pic('v', { kind: 'video', width: 720, height: 1280 })])
    await render(<LibraryScreen />)
    expect(await screen.findByTestId('library-tile-a')).toBeTruthy()
    expect(searchLibrary).toHaveBeenCalledWith('tok', '', { people: undefined })
    expect(screen.getByTestId('clip')).toBeTruthy() // the clip plays in its tile
  })

  it('searches what she types, once she pauses, and the people filter narrows it', async () => {
    jest.useFakeTimers()
    searchLibrary.mockResolvedValue([pic('a')])
    await render(<LibraryScreen />)
    await act(async () => {
      jest.advanceTimersByTime(0)
    })
    await fireEvent.changeText(screen.getByTestId('library-search'), 'clear case')
    await act(async () => {
      jest.advanceTimersByTime(300)
    })
    expect(searchLibrary).toHaveBeenLastCalledWith('tok', 'clear case', { people: undefined })
    await fireEvent.press(screen.getByText('Hands'))
    await act(async () => {
      jest.advanceTimersByTime(300)
    })
    expect(searchLibrary).toHaveBeenLastCalledWith('tok', 'clear case', { people: 'hands' })
    jest.useRealTimers()
  })

  it('a tile opens its own page', async () => {
    searchLibrary.mockResolvedValue([pic('a')])
    await render(<LibraryScreen />)
    await fireEvent.press(await screen.findByTestId('library-tile-a'))
    expect(router.push).toHaveBeenCalledWith('/inspiration/a')
  })

  it('has a mic in the field', async () => {
    searchLibrary.mockResolvedValue([])
    await render(<LibraryScreen />)
    expect(screen.getByLabelText('Search by voice')).toBeTruthy()
  })

  it('flag off: says the library is off, shows nothing else', async () => {
    searchLibrary.mockRejectedValue(new LibraryOff())
    await render(<LibraryScreen />)
    expect(await screen.findByText('The Ivy library is off.')).toBeTruthy()
    expect(screen.queryByTestId(/library-tile-/)).toBeNull()
  })
})

describe('a tile’s page', () => {
  it('the picture, what it is, then More like this — never the item itself', async () => {
    __remember({ items: [pic('a')], expires_in: 3600 })
    moreLikeThis.mockResolvedValue([pic('b'), pic('c')])
    await render(<LibraryItemPage />)
    expect(screen.getByTestId('library-picture')).toBeTruthy()
    expect(screen.getByText('Caption a')).toBeTruthy()
    expect(screen.getByText('Ivy library · Flat lay')).toBeTruthy()
    expect(screen.getByText('transparent')).toBeTruthy()
    expect(screen.getByText('signal red')).toBeTruthy()
    expect(screen.getByText('More like this')).toHaveStyle({ fontSize: 20, fontWeight: '600', marginTop: 36, marginBottom: 12 })
    expect(await screen.findByTestId('library-tile-b')).toBeTruthy()
    expect(screen.queryByTestId('library-tile-a')).toBeNull()
    expect(moreLikeThis).toHaveBeenCalledWith('tok', 'a')
  })

  it('a clip plays as the hero', async () => {
    __remember({ items: [pic('a', { kind: 'video', width: 720, height: 1280 })], expires_in: 3600 })
    moreLikeThis.mockResolvedValue([])
    await render(<LibraryItemPage />)
    expect(screen.getByTestId('library-clip')).toBeTruthy()
    expect(await screen.findByText('Nothing else looks like this yet.')).toBeTruthy()
  })

  it('opened past the hour (or never fetched): asks her to search again, no dead picture', async () => {
    useLocalSearchParams.mockReturnValueOnce({ id: 'gone' })
    moreLikeThis.mockResolvedValue([])
    await render(<LibraryItemPage />)
    expect(screen.getByText('This picture’s link has expired. Go back and search again.')).toBeTruthy()
    expect(screen.queryByTestId('library-picture')).toBeNull()
  })
})
