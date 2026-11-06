// B.8a: the idea page's lines — saved, who, the snippet — and More to explore's order; I3's empty thread.
import { savedTo, snippet, when, whoLine } from '../idea'
import { inOrder } from '../related'
import { threadEmpty } from '../viewIdea'
import type { CardItem } from '../home'

describe('idea page lines', () => {
  it('saved only when filed in one of her projects', () => {
    expect(savedTo({ project: { id: 'p', name: 'Launch video', kind: 'user' } })).toBe('Launch video')
    expect(savedTo({ project: { id: 't', name: 'My things', kind: 'things' } })).toBeNull()
    expect(savedTo({ project: { id: 'm', name: 'Ivy Mini', kind: 'mini' } })).toBeNull()
    expect(savedTo({ project: null })).toBeNull()
  })
  // Local times, so the day and hour hold in any time zone. 19 Oct 2026 is a Monday.
  const MON_740 = new Date(2026, 9, 19, 7, 40).toISOString()
  const SUN_1905 = new Date(2026, 9, 18, 19, 5).toISOString()
  it('when: "{day} {h:mm}", 12-hour, no am/pm', () => {
    expect(when(MON_740)).toBe('Mon 7:40')
    expect(when(SUN_1905)).toBe('Sun 7:05')
    expect(when(new Date(2026, 9, 19, 0, 15).toISOString())).toBe('Mon 12:15')
    expect(when(null)).toBeNull()
  })
  it('who: "{day} {time} · {project}" — when she said it, else when it was made; no duration', () => {
    expect(whoLine({ recordedAt: MON_740, createdAt: SUN_1905, project: { id: 'p', name: 'Lisa 🖤🖤', kind: 'user' } })).toBe('Mon 7:40 · Lisa 🖤🖤')
    expect(whoLine({ recordedAt: null, createdAt: SUN_1905, project: null })).toBe('Sun 7:05 · My things')
  })
  it('snippet: her words in quotes, else the gist; nothing for neither', () => {
    expect(snippet({ said: 'So the chase ends on the roof.', gist: 'x' })).toBe('“So the chase ends on the roof.”')
    expect(snippet({ said: null, gist: 'A rooftop chase' })).toBe('“A rooftop chase”')
    expect(snippet({ said: '  ', gist: '' })).toBeNull()
  })
})

describe('More to explore', () => {
  it('keeps the route’s order and drops cards that went missing', () => {
    const c = (id: string) => ({ id }) as CardItem
    expect(inOrder(['b', 'x', 'a'], [c('a'), c('b')]).map((x) => x.id)).toEqual(['b', 'a'])
  })
})

describe('View idea', () => {
  it('no thread section when there is nothing in it', () => {
    expect(threadEmpty({ title: null, ideas: [], directions: [], notes: [] })).toBe(true)
    expect(threadEmpty({ title: 'Rooftop', ideas: [{ id: 'c2', title: 'Second take', thumbUrl: null }], directions: [], notes: [] })).toBe(false)
  })
})
