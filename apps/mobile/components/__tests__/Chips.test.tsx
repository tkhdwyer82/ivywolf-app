/// <reference types="jest" />
// B.5: the project chips — all ink 17 pt, the selected one with a 2-pt ink underline, no My things chip.
import { render, screen } from '@testing-library/react-native'
import { ProjectChips } from '@/components/HomeChrome'
import type { Project } from '@/lib/home'

const projects: Project[] = [
  { id: 'things', name: 'My things', kind: 'things', hue: 'cool-grey' },
  { id: 'launch', name: 'Launch video', kind: 'user', hue: 'coral' },
  { id: 'restock', name: 'Restock Reel', kind: 'user', hue: 'sage' },
]

describe('Project chips', () => {
  it('are All and her projects — no My things chip', async () => {
    await render(<ProjectChips projects={projects} selected={null} onSelect={() => {}} />)
    expect(screen.getByText('All')).toBeTruthy()
    expect(screen.getByText('Launch video')).toBeTruthy()
    expect(screen.queryByText('My things')).toBeNull()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('every chip is ink #1D1D1F at 17 pt, selected or not — no grey', async () => {
    await render(<ProjectChips projects={projects} selected="launch" onSelect={() => {}} />)
    for (const name of ['All', 'Launch video', 'Restock Reel']) expect(screen.getByText(name)).toHaveStyle({ color: '#1D1D1F', fontSize: 17 })
  })

  it('only the selected chip is underlined, with a 2-pt ink rule', async () => {
    await render(<ProjectChips projects={projects} selected="launch" onSelect={() => {}} />)
    const rules = screen.getAllByTestId('chip-rule')
    expect(rules).toHaveLength(1)
    expect(rules[0]).toHaveStyle({ height: 2, backgroundColor: '#1D1D1F' })
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('Launch video')
  })
})
