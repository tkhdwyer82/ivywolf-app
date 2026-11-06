/// <reference types="jest" />
// B.8a: the saved pill's project name — as it is when it fits, scrolling (a second copy behind it) when it doesn't,
// and still under Reduce Motion.
import { AccessibilityInfo } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Marquee } from '@/components/Marquee'

const measure = async (width: number) => {
  // The first Text is the measure, laid out unconstrained.
  const [m] = screen.getAllByText('Lisa 🖤🖤', { includeHiddenElements: true })
  await act(async () => fireEvent(m, 'layout', { nativeEvent: { layout: { width, height: 20, x: 0, y: 0 } } }))
}
const copies = () => screen.getAllByText('Lisa 🖤🖤', { includeHiddenElements: true }).length - 1

beforeEach(() => jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false))

it('a name that fits is shown once, still', async () => {
  await render(<Marquee text="Lisa 🖤🖤" maxWidth={152} />)
  await measure(80)
  expect(copies()).toBe(1)
})

it('a longer name scrolls: two copies in a row', async () => {
  await render(<Marquee text="Lisa 🖤🖤" maxWidth={152} />)
  await measure(240)
  expect(copies()).toBe(2)
})

it('stays still with Reduce Motion on', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
  await render(<Marquee text="Lisa 🖤🖤" maxWidth={152} />)
  await act(async () => {})
  await measure(240)
  expect(copies()).toBe(1)
})
