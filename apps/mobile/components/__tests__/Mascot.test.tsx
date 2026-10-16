/// <reference types="jest" />
// B.6: Ivy as the My things icon — plays once per launch at 12 fps then holds still; Reduce Motion is the still only;
// a still that won't load is the ☰; the 44 pt slot opens My things.
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { AccessibilityInfo } from 'react-native'
import { router } from 'expo-router'
import { Asset } from 'expo-asset'
import { MyThingsIcon, MY_THINGS_ICON, resetMascotForTests } from '@/components/MyThingsIcon'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('expo-asset', () => ({ Asset: { loadAsync: jest.fn(() => Promise.resolve([])) } }))
jest.mock('expo-image', () => {
  const { View } = require('react-native')
  return { Image: ({ testID, onError, style }: { testID?: string; onError?: () => void; style?: object }) => <View testID={testID} style={style} onError={onError} /> }
})

const reduceMotion = (on: boolean) => jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(on)
const settle = () => act(async () => {})

beforeEach(() => {
  jest.useFakeTimers()
  resetMascotForTests()
  jest.mocked(Asset.loadAsync).mockClear()
  jest.mocked(router.push).mockClear()
})
afterEach(() => jest.useRealTimers())

describe('Ivy as My things', () => {
  it('preloads every frame, plays 36 at 12 fps, then holds the still', async () => {
    reduceMotion(false)
    await render(<MyThingsIcon />)
    await settle()
    expect(jest.mocked(Asset.loadAsync).mock.calls[0][0]).toHaveLength(37)
    expect(screen.getByTestId('mascot-frame-0')).toBeTruthy()
    await act(async () => jest.advanceTimersByTime(1000)) // a second in: frame 12
    expect(screen.getByTestId('mascot-frame-12')).toBeTruthy()
    await act(async () => jest.advanceTimersByTime(2100)) // 3 s: done
    expect(screen.getByTestId('mascot-still')).toBeTruthy()
  })

  it('plays once per launch: Home again shows the still at once', async () => {
    reduceMotion(false)
    const first = await render(<MyThingsIcon />)
    await settle()
    await act(async () => jest.advanceTimersByTime(3100))
    await first.unmount()
    await render(<MyThingsIcon />)
    expect(screen.getByTestId('mascot-still')).toBeTruthy()
    expect(Asset.loadAsync).toHaveBeenCalledTimes(1)
  })

  it('with Reduce Motion on, is the still only', async () => {
    reduceMotion(true)
    await render(<MyThingsIcon />)
    await settle()
    expect(screen.getByTestId('mascot-still')).toBeTruthy()
    await act(async () => jest.advanceTimersByTime(500))
    expect(screen.queryByTestId(/mascot-frame/)).toBeNull()
  })

  it('falls back to ☰ when the still fails to load', async () => {
    reduceMotion(true)
    await render(<MyThingsIcon />)
    await settle()
    await act(async () => fireEvent(screen.getByTestId('mascot-still'), 'error'))
    expect(screen.getByTestId('mascot-fallback')).toHaveTextContent('☰')
  })

  it('is a 44 pt "My things" button that opens /things', async () => {
    reduceMotion(true)
    await render(<MyThingsIcon />)
    await settle()
    const slot = screen.getByRole('button', { name: 'My things' })
    expect(slot).toHaveStyle({ width: 44, height: 44 })
    expect(MY_THINGS_ICON).toBe(44)
    fireEvent.press(slot)
    expect(router.push).toHaveBeenCalledWith('/things')
  })
})
