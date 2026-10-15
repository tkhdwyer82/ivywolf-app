// Job B.4 — My things v4.6 (Figma 1797:2): the groups and the meta line.
import { groupOf, groupTodos, metaLine, saidLabel, type Todo } from '../things'

// Thursday 15 October 2026, 1 pm, her clock.
const now = new Date(2026, 9, 15, 13, 0)
const at = (day: number, h: number, m = 0, month = 9) => new Date(2026, month, day, h, m).toISOString()

const todo = (id: string, over: Partial<Todo> = {}): Todo => ({
  id, text: id, dueDate: null, done: false, doneAt: null, saidAt: at(15, 7, 40), project: 'Home', picture: null, hue: '#DBE3EB', ...over,
})

describe('meta line', () => {
  it('is when she said it and the project: "Today 7:40 · Home"', () => {
    expect(metaLine(todo('milk'), now)).toEqual({ text: 'Today 7:40 · Home', overdue: false })
  })
  it('uses the weekday for the past week, and her 12-hour clock', () => {
    expect(metaLine(todo('boxes', { saidAt: at(14, 12, 5), project: 'Kickstarter' }), now).text).toBe('Wed 12:05 · Kickstarter')
    expect(saidLabel(at(12, 21, 10), now)).toBe('Mon 9:10')
  })
  it('uses the date once it is a week or more back', () => {
    expect(saidLabel(at(30, 9, 0, 8), now)).toBe('Wed 30 Sep')
  })
  it('overdue is the whole line, with the due day in it', () => {
    expect(metaLine(todo('visa', { dueDate: '2026-09-30', saidAt: at(28, 9, 0, 8) }), now)).toEqual({ text: 'Overdue · Wed 30 Sep · Home', overdue: true })
  })
  it('due today or later is not overdue; a done to-do never is', () => {
    expect(metaLine(todo('a', { dueDate: '2026-10-15' }), now).overdue).toBe(false)
    expect(metaLine(todo('b', { dueDate: '2026-09-30', done: true }), now).overdue).toBe(false)
  })
  it('carries no work/personal tag', () => {
    expect(metaLine(todo('milk'), now).text).not.toMatch(/work|personal/)
  })
})

describe('groups', () => {
  it('Today, Yesterday, a day each for the past week, then by week', () => {
    expect(groupOf(at(15, 7), now).title).toBe('TODAY')
    expect(groupOf(at(14, 23), now).title).toBe('YESTERDAY')
    expect(groupOf(at(9, 10), now).title).toBe('FRI 9 OCT')
    expect(groupOf(at(8, 10), now).title).toBe('WEEK OF 5 OCT')
    expect(groupOf(at(30, 9, 0, 8), now).title).toBe('WEEK OF 28 SEP')
  })

  it('orders groups and rows newest first, and puts Done at the bottom with this week’s count', () => {
    const groups = groupTodos(
      [
        todo('old', { saidAt: at(30, 9, 0, 8) }),
        todo('milk', { saidAt: at(15, 7, 40) }),
        todo('carlos', { saidAt: at(15, 12, 21) }),
        todo('boxes', { saidAt: at(14, 12, 5) }),
        todo('wipes', { done: true, doneAt: at(13, 9) }),
        todo('last-week', { done: true, doneAt: at(9, 9) }),
      ],
      new Set(),
      now
    )
    expect(groups.map((g) => [g.title, g.rows.map((r) => r.id)])).toEqual([
      ['TODAY', ['carlos', 'milk']],
      ['YESTERDAY', ['boxes']],
      ['WEEK OF 28 SEP', ['old']],
      ['DONE', ['wipes', 'last-week']],
    ])
    expect(groups[3].note).toBe('1 this week')
  })

  it('a row ticked a moment ago stays in its group until it settles', () => {
    const list = [todo('milk', { done: true, doneAt: at(15, 12, 59) })]
    expect(groupTodos(list, new Set(['milk']), now).map((g) => g.title)).toEqual(['TODAY'])
    expect(groupTodos(list, new Set(), now).map((g) => g.title)).toEqual(['DONE'])
  })

  it('shows no empty groups', () => {
    expect(groupTodos([], new Set(), now)).toEqual([])
  })
})
