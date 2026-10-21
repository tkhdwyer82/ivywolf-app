/// <reference types="jest" />
// B.8a I2 (build 26: the sheet span forever): Save to lists her projects as soon as they load, New project at the top.
import { render, screen } from '@testing-library/react-native'
import SaveTo from '@/app/idea/save/[id]'

let mockParams: Record<string, string> = { id: 'c1', projectId: 'p-things' }
jest.mock('expo-router', () => {
  const React = require('react')
  return { router: { back: jest.fn() }, useLocalSearchParams: () => mockParams, useFocusEffect: (f: () => void) => React.useEffect(f, [f]) }
})
jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ userId: 'u1', getToken: async () => 'tok' }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('expo-symbols', () => ({ SymbolView: () => null }))

/** A Supabase stand-in: each table's rows, as the picker reads them. */
const ROWS: Record<string, unknown[]> = {
  projects: [
    { id: 'p-things', name: 'My things', kind: 'things', hue: null, created_at: '2026-10-01T00:00:00Z' },
    { id: 'p-launch', name: 'Launch video', kind: 'user', hue: 'coral', created_at: '2026-10-02T00:00:00Z' },
    { id: 'p-jars', name: 'Restock', kind: 'user', hue: 'sage', created_at: '2026-10-03T00:00:00Z' },
  ],
  cards: [{ project_id: 'p-launch', frame_url: null, frame_status: 'none', created_at: '2026-10-20T00:00:00Z' }],
  actions: [],
}
jest.mock('@/lib/supabase', () => {
  const query = (table: string) => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'eq']) b[m] = () => b
    b.then = (resolve: (v: unknown) => void) => resolve({ data: ROWS[table] ?? [], error: null })
    return b
  }
  const client = { from: query }
  return { useSupabase: () => client }
})

it('lists her projects straight away, with New project at the top', async () => {
  await render(<SaveTo />)
  expect(await screen.findByText('Launch video')).toBeTruthy()
  expect(screen.getByText('Restock')).toBeTruthy()
  expect(screen.getAllByText('My things').length).toBeGreaterThan(0)
  expect(screen.getByTestId('save-new-project')).toHaveTextContent('New project')
  // New project comes before the list.
  const tree = JSON.stringify(screen.toJSON())
  expect(tree.indexOf('New project')).toBeLessThan(tree.indexOf('Launch video'))
})

it('from the saved pill: where it lives first under Top choices, and Remove from it', async () => {
  mockParams = { id: 'c1', projectId: 'p-launch' }
  await render(<SaveTo />)
  expect(await screen.findByTestId('save-remove')).toHaveTextContent('Remove from Launch video')
  const tree = JSON.stringify(screen.toJSON())
  expect(tree.indexOf('Top choices')).toBeLessThan(tree.indexOf('saved here'))
  expect(tree.indexOf('saved here')).toBeLessThan(tree.indexOf('Your projects'))
  mockParams = { id: 'c1', projectId: 'p-things' }
})

it('no Remove when it lives in My things', async () => {
  await render(<SaveTo />)
  await screen.findByText('Launch video')
  expect(screen.queryByTestId('save-remove')).toBeNull()
})
