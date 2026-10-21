/// <reference types="jest" />
// B.8a I2 (build 26: the sheet span forever): Save to lists her projects as soon as they load, New project at the top.
import { act, render, screen, within } from '@testing-library/react-native'
import SaveTo, { PSST_MS } from '@/app/idea/save/[id]'

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

it('lists her projects straight away, with New project at the foot', async () => {
  await render(<SaveTo />)
  expect(await screen.findByText('Launch video')).toBeTruthy()
  expect(screen.getByText('Restock')).toBeTruthy()
  expect(screen.getAllByText('My things').length).toBeGreaterThan(0)
  expect(screen.getByTestId('save-new-project')).toHaveTextContent('New project')
  // Pinterest's Create new board: after the list, never above it.
  const tree = JSON.stringify(screen.toJSON())
  expect(tree.indexOf('New project')).toBeGreaterThan(tree.indexOf('Restock'))
})

it('rows are a thumbnail and a name — no subtitle lines', async () => {
  await render(<SaveTo />)
  await screen.findByText('Launch video')
  for (const id of ['p-things', 'p-launch', 'p-jars']) {
    const r = screen.getByTestId(`save-row-${id}`)
    expect(r).toHaveStyle({ height: 50 })
    expect(within(r).getAllByText(/./)).toHaveLength(1)
  }
  for (const gone of [/saved here/, /\d+ ideas?/, /to-dos, loose ends, life/]) expect(screen.queryByText(gone)).toBeNull()
})

it('from the saved pill: where it lives first under Top choices with a ✓, My things second; no Remove row', async () => {
  mockParams = { id: 'c1', projectId: 'p-launch' }
  await render(<SaveTo />)
  await screen.findByText('Launch video')
  const tree = JSON.stringify(screen.toJSON())
  const at = (s: string) => tree.indexOf(s)
  expect(at('Top choices')).toBeLessThan(at('save-row-p-launch'))
  expect(at('save-row-p-launch')).toBeLessThan(at('save-row-p-things'))
  expect(at('save-row-p-things')).toBeLessThan(at('Your projects'))
  expect(within(screen.getByTestId('save-row-p-launch')).getByTestId('save-here')).toBeTruthy()
  expect(within(screen.getByTestId('save-row-p-jars')).queryByTestId('save-here')).toBeNull()
  expect(screen.queryByText(/Remove from/)).toBeNull()
  mockParams = { id: 'c1', projectId: 'p-things' }
})

it('Psst! sits under the search field, points at Top choices for 4 s, then goes', async () => {
  jest.useFakeTimers()
  mockParams = { id: 'c1', projectId: 'p-launch' }
  await render(<SaveTo />)
  await screen.findByText('Launch video')
  expect(screen.getByTestId('save-psst')).toHaveTextContent('Psst! This idea already lives in Launch video')
  // Under the search field, never over it: in the list's flow, 12 below the field, before Top choices.
  const tree = JSON.stringify(screen.toJSON())
  expect(tree.indexOf('Search projects')).toBeLessThan(tree.indexOf('Psst!'))
  expect(tree.indexOf('Psst!')).toBeLessThan(tree.indexOf('Top choices'))
  expect(screen.getByTestId('save-psst').parent?.parent).not.toHaveStyle({ position: 'absolute' })
  expect(screen.getByText('Top choices')).toHaveStyle({ marginTop: 12 })
  await act(async () => jest.advanceTimersByTime(PSST_MS + 500))
  expect(screen.queryByTestId('save-psst')).toBeNull()
  expect(screen.getByText('Top choices')).toHaveStyle({ marginTop: 28 })
  jest.useRealTimers()
  mockParams = { id: 'c1', projectId: 'p-things' }
})
