// B.5: Ivy's My things line on Home, and the tile's meta without the project.
import { metaLine, thingsSentence, type ActionItem, type CardItem, type Project } from '../home'

const now = new Date(2026, 9, 15, 13, 0)
const todo = (id: string, text: string, over: Partial<ActionItem> = {}): ActionItem =>
  ({ kind: 'action', id, text, done: false, dueDate: null, at: `2026-10-1${id}T09:00:00Z`, projectId: 'things', recordingId: `r${id}`, frameUrl: null, frameStatus: 'none', frameAt: null, ...over }) as ActionItem

describe('Ivy’s My things line', () => {
  it('counts what’s on her plate today and names the oldest first, cited to where she said it', () => {
    const line = thingsSentence([todo('2', 'Get some milk'), todo('3', 'Double check the visa'), todo('4', 'Wipes', { dueDate: '2026-12-01' })], now)
    expect(line).toEqual({ text: '2 things today · get some milk first', cites: [{ recordingId: 'r2', ms: 0 }] })
  })
  it('one thing reads singular', () => {
    expect(thingsSentence([todo('2', 'Get some milk.')], now)?.text).toBe('1 thing today · get some milk first')
  })
  it('says nothing when there isn’t anything to say', () => {
    expect(thingsSentence([], now)).toBeNull()
    expect(thingsSentence([todo('2', 'Done one', { done: true }), todo('3', 'Later', { dueDate: '2026-12-01' })], now)).toBeNull()
  })
})

describe('tile meta', () => {
  it('an idea’s meta is its time only — the project is on the picture', () => {
    const projects: Project[] = [{ id: 'p', name: 'Launch video', kind: 'user', hue: 'coral' }]
    const card = { kind: 'card', id: 'c', projectId: 'p', playFromMs: 31_000, threadSize: 3 } as CardItem
    expect(metaLine(card, projects)).toBe('0:31')
  })
})
