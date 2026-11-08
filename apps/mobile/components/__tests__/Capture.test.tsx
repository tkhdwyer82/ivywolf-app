/// <reference types="jest" />
// Job B.11 — the capture screen itself (app/record.tsx) against a stand-in mockRecorder: it starts on open; the centre
// button is the only thing that pauses; typing and adding photos never touch the mockRecorder; × with nothing said,
// typed or added closes with "Nothing saved", as before.
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { ActionSheetIOS } from 'react-native'
import Record from '@/app/record'

const mockRecorder = {
  prepareToRecordAsync: jest.fn(async () => {}),
  record: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(async () => {}),
  uri: 'file:///take.m4a',
  currentTime: 0,
}
let mockMetering = -20

jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: async () => ({ granted: true }),
  setAudioModeAsync: async () => {},
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ durationMillis: mockRecorder.currentTime * 1000, metering: mockMetering }),
}))
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    supportsOnDeviceRecognition: () => false,
    requestSpeechRecognizerPermissionsAsync: async () => ({ granted: false }),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
  useSpeechRecognitionEvent: () => {},
  AVAudioSessionCategory: {},
  AVAudioSessionCategoryOptions: {},
  AVAudioSessionMode: {},
}))
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
}))
jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: async () => 'tok', userId: 'u1' }),
  useUser: () => ({ user: { fullName: 'Tim Dwyer', hasImage: false } }),
}))
jest.mock('@/lib/supabase', () => {
  const client = {}
  return { useSupabase: () => client }
})
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('expo-symbols', () => ({ SymbolView: () => null }))
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: ({ children, style }: { children: React.ReactNode; style: unknown }) => <View style={style}>{children}</View> }
})
jest.mock('expo-file-system', () => ({ File: class { delete() {} async arrayBuffer() { return new ArrayBuffer(1) } } }))
jest.mock('expo-crypto', () => ({ randomUUID: () => 'rec-1' }))
jest.mock('expo-media-library/legacy', () => ({ getPermissionsAsync: async () => ({ granted: false }), getAssetsAsync: jest.fn() }))
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: async () => ({ granted: true }),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileName: 'a.jpg' }] })),
}))
jest.mock('@/lib/record', () => ({ submitRecording: jest.fn(), requestProcessing: jest.fn() }))
jest.mock('@/components/LiveWaveform', () => ({ LiveWaveform: () => null }))
jest.mock('@/components/Sheet', () => {
  const { View } = require('react-native')
  return { Sheet: ({ children }: { children: React.ReactNode }) => <View testID="ask-sheet">{children}</View> }
})

const flush = () => act(async () => {})

beforeEach(() => {
  jest.clearAllMocks()
  mockRecorder.currentTime = 0
  mockMetering = -20
})

test('opening starts recording — no start button', async () => {
  await render(<Record />)
  await flush()
  expect(mockRecorder.record).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('capture-status').props.children).toBe('Listening · 0:00')
})

test('the centre button pauses and resumes', async () => {
  await render(<Record />)
  await flush()
  await fireEvent.press(screen.getByTestId('capture-pause'))
  expect(mockRecorder.pause).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('capture-status').props.children).toMatch(/^Paused/)
  await fireEvent.press(screen.getByTestId('capture-pause'))
  expect(mockRecorder.record).toHaveBeenCalledTimes(2) // open, then resume
  expect(screen.getByTestId('capture-status').props.children).toMatch(/^Listening/)
})

test('typing never pauses: open the bar, type, send', async () => {
  await render(<Record />)
  await flush()
  await fireEvent.press(screen.getByTestId('capture-bar'))
  await flush()
  mockRecorder.currentTime = 31
  await fireEvent.changeText(screen.getByTestId('capture-input'), '…and the colour is one red detail')
  mockRecorder.currentTime = 36
  await fireEvent.changeText(screen.getByTestId('capture-input'), '…and the colour is one red detail, like a switch.')
  await fireEvent.press(screen.getByTestId('capture-send'))
  await flush()
  expect(mockRecorder.pause).not.toHaveBeenCalled()
  expect(mockRecorder.stop).not.toHaveBeenCalled()
  // Kept, stamped when she started typing.
  expect(screen.getByText(/0:31/)).toBeTruthy()
  expect(screen.getByText(/like a switch\./)).toBeTruthy()
})

test('the small pause above the keyboard pauses while typing', async () => {
  await render(<Record />)
  await flush()
  await fireEvent.press(screen.getByTestId('capture-bar'))
  await flush()
  await fireEvent(screen.getByTestId('capture-input'), 'focus')
  await fireEvent.press(screen.getByTestId('capture-pause-small'))
  expect(mockRecorder.pause).toHaveBeenCalledTimes(1)
})

test('adding a photo never pauses, and shows the time it was added', async () => {
  jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_o, cb) => cb(1))
  await render(<Record />)
  await flush()
  mockRecorder.currentTime = 38
  await fireEvent.press(screen.getByTestId('capture-photo'))
  await flush()
  expect(mockRecorder.pause).not.toHaveBeenCalled()
  expect(mockRecorder.stop).not.toHaveBeenCalled()
  expect(screen.getByText('1 photo · added at 0:38')).toBeTruthy()
})

test('× in silence with nothing typed or added closes, as before', async () => {
  mockMetering = -70
  const { router } = require('expo-router')
  await render(<Record />)
  await flush()
  await fireEvent.press(screen.getByTestId('capture-close'))
  expect(screen.queryByTestId('ask-sheet')).toBeNull()
  expect(router.back).toHaveBeenCalled()
})

test('× with something typed asks, even in silence', async () => {
  mockMetering = -70
  await render(<Record />)
  await flush()
  await fireEvent.press(screen.getByTestId('capture-bar'))
  await flush()
  await fireEvent.changeText(screen.getByTestId('capture-input'), 'fee — check')
  await fireEvent.press(screen.getByTestId('capture-close'))
  expect(screen.getByTestId('ask-sheet')).toBeTruthy()
})
