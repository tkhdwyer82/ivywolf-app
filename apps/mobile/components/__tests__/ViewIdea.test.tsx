/// <reference types="jest" />
// B.8a I3: View idea — her full words, chaptered as the transcript is, then the Ivy thread, on one scroll.
import { render, screen, within } from '@testing-library/react-native'
import ViewIdea from '@/app/idea/view/[id]'

jest.mock('expo-router', () => {
  const React = require('react')
  return { router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({ id: 'c1' }), useFocusEffect: (f: () => void) => React.useEffect(f, [f]) }
})
jest.mock('@clerk/clerk-expo', () => ({ useUser: () => ({ user: { firstName: 'Tim' } }) }))
// One client for every render, as the real hook gives (a new one each render would reload forever).
jest.mock('@/lib/supabase', () => {
  const client = {}
  return { useSupabase: () => client }
})
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-symbols', () => ({ SymbolView: () => null }))
jest.mock('@/lib/idea', () => ({ loadIdea: jest.fn(async () => ({ id: 'c1', title: 'Rooftop chase, night', recordingId: 'r1', said: null, gist: '' })) }))
jest.mock('@/lib/transcript', () => ({
  loadTranscript: jest.fn(async () => ({
    plain: '',
    turns: [
      { speaker: '0', spans: [{ kind: 'idea', text: 'So the chase ends on the roof.' }] },
      { speaker: '1', spans: [{ kind: 'plain', text: 'And then?' }] },
    ],
  })),
}))
jest.mock('@/lib/viewIdea', () => ({
  ...jest.requireActual('@/lib/viewIdea'),
  loadIvyThread: jest.fn(async () => ({
    title: 'Rooftop',
    ideas: [{ id: 'c2', title: 'Second take', thumbUrl: 'https://x/frame.jpg' }],
    directions: [{ id: 's1', title: 'Open on the stairwell', gist: 'Burst out of the door.', why: null }],
    notes: [{ id: 'n1', text: 'You came back to the roof three times.', at: '2026-10-14T09:00:00Z' }],
  })),
}))

it('her words, a chapter per turn, then the Ivy thread', async () => {
  await render(<ViewIdea />)
  expect(await screen.findByText('So the chase ends on the roof.')).toBeTruthy()
  expect(screen.getAllByTestId('chapter')).toHaveLength(2)
  expect(screen.getByText('Tim')).toBeTruthy()
  expect(await screen.findByTestId('ivy-thread')).toBeTruthy()
  expect(screen.getByText('Ivy')).toBeTruthy()
  expect(screen.getByText('Open on the stairwell')).toBeTruthy()
  expect(screen.getByText('Second take')).toBeTruthy()
  expect(screen.getByText('You came back to the roof three times.')).toBeTruthy()
})

it("Pinterest's comments sheet: × · Her words · ↑ header, the title, then the Ivy rows", async () => {
  await render(<ViewIdea />)
  await screen.findByTestId('ivy-thread')
  expect(screen.getByText('Her words')).toBeTruthy()
  expect(screen.getByTestId('view-close')).toBeTruthy()
  expect(screen.getByTestId('view-share')).toBeTruthy()
  expect(screen.getByText('Rooftop chase, night')).toHaveStyle({ fontSize: 22, fontWeight: '700' })
})

it('each Ivy row is a thumbnail and one title — no subtitle, no gist', async () => {
  await render(<ViewIdea />)
  await screen.findByTestId('ivy-thread')
  const rows = screen.getAllByTestId('ivy-row')
  expect(rows).toHaveLength(3)
  for (const r of rows) {
    expect(r).toHaveStyle({ height: 56 })
    expect(within(r).getAllByTestId('ivy-row-thumb')).toHaveLength(1)
    // One line of text per row: its title.
    expect(within(r).getAllByText(/./)).toHaveLength(1)
  }
  expect(screen.queryByText('Burst out of the door.')).toBeNull()
  expect(screen.queryByText('DIRECTION')).toBeNull()
})
