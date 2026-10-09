/// <reference types="jest" />
// Job H (Figma 165:423): a direction tile is the cite pill, the title and the lime + (Save) — no row of buttons; under
// it the 3-up references strip. A Pinterest pin is shown whole, never cropped (Pinterest terms).
import { render, screen, fireEvent } from '@testing-library/react-native'
import { DirectionTile } from '@/components/DirectionTile'
import type { Direction, Reference } from '@/lib/directions'

jest.mock('expo-symbols', () => ({ SymbolView: () => null }))
jest.mock('expo-linear-gradient', () => {
  const { View } = jest.requireActual('react-native')
  return { LinearGradient: View }
})
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }))
jest.mock('expo-image', () => {
  const { View } = jest.requireActual('react-native')
  return { Image: (p: { contentFit?: string }) => <View testID={`image-${p.contentFit}`} /> }
})

const ref = (source: Reference['source'], id: string): Reference => ({
  source, id, thumb_url: `https://img/${id}.jpg`, full_url: `https://img/${id}-l.jpg`, link_url: `https://src/${id}`,
  credit: { name: source === 'pixabay' ? 'via Pixabay' : `Photo by ${id}`, url: 'https://c' }, width: 600, height: 800,
})
const d: Direction = {
  id: 'd1', title: 'Cold open on the radio line', gist: 'Start on black with only the radio crackle.', format: 'board',
  why: 'from Tue 0:05: “radios through and says, I’ve got it.”', visual_query: 'black frame, radio static', hearted_at: null,
  generated_at: '2026-10-09T00:00:00Z', cite_card_ids: ['c1'], references: [ref('unsplash', 'u1'), ref('pixabay', 'p1'), ref('pinterest', 'pin1')],
}

describe('DirectionTile', () => {
  it('shows the cite pill and the title, and + saves', async () => {
    const onSave = jest.fn()
    await render(<DirectionTile direction={d} gradient="ember" width={180} onSave={onSave} />)
    expect(screen.getByText(/^From Tue 0:05 · “radios through/)).toBeTruthy()
    expect(screen.getByText('Cold open on the radio line')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Save Cold open on the radio line'))
    expect(onSave).toHaveBeenCalledWith(d)
  })
  it('has no row of buttons: ♥ and Not this live in the hold arc', async () => {
    await render(<DirectionTile direction={d} gradient="ember" width={180} onSave={() => {}} />)
    expect(screen.queryByLabelText(/^Like/)).toBeNull()
    expect(screen.queryByLabelText(/^Not this/)).toBeNull()
    expect(screen.queryByLabelText(/^Dismiss/)).toBeNull()
  })
  it('puts 3 references under it; a Pinterest pin is never cropped', async () => {
    await render(<DirectionTile direction={d} gradient="ember" width={180} onSave={() => {}} />)
    expect(screen.getAllByLabelText(/^Reference: /)).toHaveLength(3)
    expect(screen.getAllByTestId('image-cover')).toHaveLength(2)
    expect(screen.getAllByTestId('image-contain')).toHaveLength(1)
  })
  it('tap shows the gist', async () => {
    await render(<DirectionTile direction={d} gradient="ember" width={180} onSave={() => {}} />)
    expect(screen.queryByText(/radio crackle/)).toBeNull()
    await fireEvent.press(screen.getByLabelText(/^Cold open on the radio line\./))
    expect(await screen.findByText(/radio crackle/)).toBeTruthy()
  })
})
