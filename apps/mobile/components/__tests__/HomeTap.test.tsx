/// <reference types="jest" />
// Job B.3 item 4: Home in the nav. On Home it goes back to All and the top, animated, with no reload; from another
// room it just switches.
import { useRef, useState } from 'react'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { Nav } from '@/components/Nav'
import { useBackToTop } from '@/lib/backToTop'

jest.mock('expo-router', () => ({ router: { dismissTo: jest.fn(), push: jest.fn() } }))
jest.mock('@clerk/clerk-expo', () => ({ useAuth: () => ({ userId: 'u1' }) }))
jest.mock('@/lib/supabase', () => ({ useSupabase: () => ({}) }))
jest.mock('expo-image', () => ({ Image: () => null }))

/** Home's chip and list: a list scrolled to `offset`, which logs each scroll with the chip it ran under. */
function useHome(start: string | null, offset: number) {
  const [project, setProject] = useState<string | null>(start)
  const state = useRef({ offset, animated: false, scrolls: [] as (string | null)[] }).current
  const projectNow = useRef(project)
  projectNow.current = project
  const list = useRef({
    scrollToOffset: (to: { offset: number; animated: boolean }) => {
      state.offset = to.offset
      state.animated = to.animated
      state.scrolls.push(projectNow.current)
    },
  })
  const onHome = useBackToTop(project, setProject, list)
  return { project, state, onHome }
}

beforeEach(() => jest.clearAllMocks())

describe('Home in the nav', () => {
  it('on the Launch video chip scrolled 800 pt, tapping Home → All, offset 0, animated, after All has rendered', async () => {
    const { result } = await renderHook(() => useHome('launch-video', 800))
    await render(<Nav room="home" onHome={() => result.current.onHome()} />)
    await act(async () => fireEvent.press(screen.getByTestId('nav-home')))
    expect(result.current.project).toBeNull()
    expect(result.current.state.offset).toBe(0)
    expect(result.current.state.animated).toBe(true)
    // One scroll, made once the chip was All — not against the Launch video list.
    expect(result.current.state.scrolls).toEqual([null])
    expect(router.dismissTo).not.toHaveBeenCalled()
  })

  it('already on All, it just glides to the top', async () => {
    const { result } = await renderHook(() => useHome(null, 1200))
    await act(async () => result.current.onHome())
    expect(result.current.state).toMatchObject({ offset: 0, animated: true, scrolls: [null] })
  })

  it('from another room, Home just switches', async () => {
    const onHome = jest.fn()
    await render(<Nav room="explore" onHome={onHome} />)
    fireEvent.press(screen.getByTestId('nav-home'))
    expect(router.dismissTo).toHaveBeenCalledWith('/')
    expect(onHome).not.toHaveBeenCalled()
  })
})
