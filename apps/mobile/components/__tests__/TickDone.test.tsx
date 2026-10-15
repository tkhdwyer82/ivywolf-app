/// <reference types="jest" />
// Job B.4 M3: tick a My things row → it stays in place, faded, with "Done · Undo" for 6 s → then it's in Done.
import { useCallback, useState } from 'react'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import { useTicks, SETTLE_MS } from '@/lib/ticks'
import { groupTodos, type Todo } from '@/lib/things'
import { TodoRow } from '@/app/things'

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }, useFocusEffect: jest.fn() }))
jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ userId: 'u1' }) }))
jest.mock('@/lib/supabase', () => ({ useSupabase: () => ({}) }))
jest.mock('expo-image', () => ({ Image: () => null }))
jest.mock('expo-symbols', () => ({ SymbolView: () => null }))

const now = new Date(2026, 9, 15, 13, 0)
const milk: Todo = {
  id: 'milk', text: 'Get milk', dueDate: null, done: false, doneAt: null, saidAt: new Date(2026, 9, 15, 7, 40).toISOString(),
  project: 'Home', picture: null, hue: '#DBE3EB',
}

/** My things' list state with the tick hook, as the screen wires it. */
function useList(save: jest.Mock) {
  const [todos, setTodos] = useState<Todo[]>([milk])
  const apply = useCallback(
    ({ id, done }: { id: string; done: boolean }) => setTodos((t) => t.map((x) => (x.id === id ? { ...x, done, doneAt: done ? now.toISOString() : null } : x))),
    []
  )
  const ticks = useTicks({ apply, save })
  return { todos, ticks, groups: groupTodos(todos, ticks.settling, now) }
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('Tick → Done', () => {
  it('stays in Today, faded, with Undo for 6 s, then moves to Done', async () => {
    const save = jest.fn(() => Promise.resolve())
    const { result } = await renderHook(() => useList(save))

    const row = await render(<TodoRow todo={result.current.todos[0]} now={now} fading={false} onTick={() => result.current.ticks.tick(result.current.todos[0])} />)
    await act(async () => fireEvent.press(screen.getByTestId('tick-milk')))

    expect(save).toHaveBeenCalledWith({ id: 'milk', done: true })
    expect(result.current.groups.map((g) => [g.title, g.rows.map((r) => r.id)])).toEqual([['TODAY', ['milk']]])
    expect(result.current.ticks.settling.has('milk')).toBe(true)
    expect(result.current.ticks.undoable).toBe('milk')

    // Faded to 40 % in place while it settles.
    await row.rerender(<TodoRow todo={result.current.todos[0]} now={now} fading={result.current.ticks.settling.has('milk')} onTick={() => {}} />)
    expect(screen.getByTestId('todo-milk')).toHaveStyle({ opacity: 0.4 })

    await act(async () => jest.advanceTimersByTime(SETTLE_MS))
    expect(result.current.groups.map((g) => [g.title, g.rows.map((r) => r.id)])).toEqual([['DONE', ['milk']]])
    expect(result.current.ticks.undoable).toBeNull()
  })

  it('Undo within 6 s puts it back, undone, where it was', async () => {
    const save = jest.fn(() => Promise.resolve())
    const { result } = await renderHook(() => useList(save))
    await act(async () => result.current.ticks.tick(result.current.todos[0]))
    await act(async () => jest.advanceTimersByTime(SETTLE_MS - 1000))
    await act(async () => result.current.ticks.undo())
    expect(save).toHaveBeenLastCalledWith({ id: 'milk', done: false })
    expect(result.current.todos[0].done).toBe(false)
    await act(async () => jest.advanceTimersByTime(2000))
    expect(result.current.groups.map((g) => g.title)).toEqual(['TODAY'])
  })

  it('a failed save flips the row back', async () => {
    const save = jest.fn(() => Promise.reject(new Error('offline')))
    const { result } = await renderHook(() => useList(save))
    await act(async () => result.current.ticks.tick(result.current.todos[0]))
    expect(result.current.todos[0].done).toBe(false)
  })
})
