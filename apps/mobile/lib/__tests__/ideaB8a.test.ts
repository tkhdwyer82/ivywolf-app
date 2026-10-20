// B.8a: the idea page's lines — saved, who, the snippet — and More to explore's order; I3's empty thread.
import { duration, savedTo, snippet, whoLine } from '../idea'
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
  it('duration m:ss', () => {
    expect(duration(31_000)).toBe('0:31')
    expect(duration(125_400)).toBe('2:05')
    expect(duration(null)).toBeNull()
  })
  it('who: "{duration} · {project}", the project alone with no recording', () => {
    expect(whoLine({ durationMs: 31_000, project: { id: 'p', name: 'Launch video', kind: 'user' } })).toBe('0:31 · Launch video')
    expect(whoLine({ durationMs: null, project: null })).toBe('My things')
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
    expect(threadEmpty({ title: 'Rooftop', ideas: [{ id: 'c2', title: 'Second take' }], directions: [], notes: [] })).toBe(false)
  })
})
