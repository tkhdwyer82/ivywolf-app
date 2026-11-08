// B.12: ••• → Change cover — six library photos; tap one and it becomes the cover.
import { fireEvent, render, screen } from '@testing-library/react-native'
import { CoverSheet } from '@/components/CoverSheet'

jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ getToken: async () => 'tok' }) }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('@/lib/covers', () => ({ ...jest.requireActual('@/lib/covers'), loadCoverChoices: jest.fn(), setCover: jest.fn() }))
const { loadCoverChoices, setCover } = jest.requireMock('@/lib/covers') as { loadCoverChoices: jest.Mock; setCover: jest.Mock }

const choice = (id: string) => ({ id, url: `https://lib/${id}.jpg`, caption: `Caption ${id}`, width: 800, height: 1000, similarity: 0.4 })

it('shows the six choices and sets the one she taps', async () => {
  loadCoverChoices.mockResolvedValue(['a', 'b', 'c', 'd', 'e', 'f'].map(choice))
  setCover.mockResolvedValue(undefined)
  const onChanged = jest.fn()
  await render(<CoverSheet cardId="c1" onClose={jest.fn()} onChanged={onChanged} />)
  expect(await screen.findByTestId('cover-grid')).toBeTruthy()
  expect(screen.getAllByLabelText(/^Use as cover:/)).toHaveLength(6)
  expect(screen.getByText('From the Ivy library')).toBeTruthy()
  await fireEvent.press(screen.getByTestId('cover-c'))
  expect(setCover).toHaveBeenCalledWith('tok', 'c1', 'c')
  expect(onChanged).toHaveBeenCalled()
})

it('a failed change says so and keeps the sheet open', async () => {
  loadCoverChoices.mockResolvedValue([choice('a')])
  setCover.mockRejectedValue(new Error('That cover didn’t change'))
  const onChanged = jest.fn()
  await render(<CoverSheet cardId="c1" onClose={jest.fn()} onChanged={onChanged} />)
  await fireEvent.press(await screen.findByTestId('cover-a'))
  expect(await screen.findByText('That cover didn’t change')).toBeTruthy()
  expect(onChanged).not.toHaveBeenCalled()
})

it('nothing in the library for this idea: says so', async () => {
  loadCoverChoices.mockResolvedValue([])
  await render(<CoverSheet cardId="c1" onClose={jest.fn()} onChanged={jest.fn()} />)
  expect(await screen.findByText('Nothing in the Ivy library for this one yet.')).toBeTruthy()
})
