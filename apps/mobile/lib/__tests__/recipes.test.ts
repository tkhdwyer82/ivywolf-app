// Job B.10: recipes in the app — private drafts never on Explore, author pages only for accepted authors, the price
// shown first, the sheet's order.
import { applyLabel, authorVisible, fromLine, isPrivateDraft, priceOf, removeLabel, sheetList, shelf, type Recipe } from '../recipes'

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r',
  title: 'The 3-second hook',
  shape: 'playbook',
  status: 'draft_private',
  handle: 'maya',
  sourceUrl: 'https://www.tiktok.com/@maya/video/1',
  uses: 0,
  createdBy: 'u1',
  author: null,
  steps: [
    { id: 's1', ordinal: 1, title: 'Hook', verb: 'Write the hook', why: 'First second.', makeKind: 'write' },
    { id: 's2', ordinal: 2, title: 'Open', verb: 'Make a 9-second opener', why: 'Motion.', makeKind: 'video' },
    { id: 's3', ordinal: 3, title: 'Cut', verb: 'Cut it to 15s', why: 'Short.', makeKind: 'cut' },
  ],
  ...over,
})
const accepted = { id: 'a1', handle: 'maya', name: 'Maya', acceptedAt: '2026-10-01', payoutShare: 0.15 }

describe('Explore never shows a private draft', () => {
  it('keeps published only', () => {
    const list = [recipe({ id: 'd', status: 'draft_private' }), recipe({ id: 'i', status: 'invited' }), recipe({ id: 'p', status: 'published', author: accepted }), recipe({ id: 'x', status: 'retired' })]
    expect(shelf(list).map((r) => r.id)).toEqual(['p'])
  })
})

describe('author page', () => {
  it('only for an author who has accepted', () => {
    expect(authorVisible({ accepted_at: null })).toBe(false)
    expect(authorVisible({ accepted_at: '2026-10-01' })).toBe(true)
  })
})

describe('price first', () => {
  it('her own draft: model cost only', () => {
    expect(priceOf(recipe())).toEqual({ model: 4, author: 0, total: 4 })
    expect(applyLabel(recipe())).toBe('Apply · 4 credits')
  })
  it('published with an accepted author: model cost + author share', () => {
    const p = priceOf(recipe({ status: 'published', author: accepted }))
    expect(p.author).toBeGreaterThan(0)
    expect(p.total).toBe(p.model + p.author)
  })
})

describe('labels', () => {
  it('private to her until published', () => {
    expect(isPrivateDraft(recipe({ status: 'invited' }))).toBe(true)
    expect(fromLine(recipe())).toBe('From @maya · private to you')
    expect(fromLine(recipe({ status: 'published', uses: 12, author: accepted }))).toBe('From @maya · 12 used')
  })
  it('Undo names the count', () => {
    expect(removeLabel(4)).toBe('Remove these 4 cards')
    expect(removeLabel(1)).toBe('Remove this card')
  })
})

describe('the recipe sheet', () => {
  it('drafts first, then published by fit for the idea kind', () => {
    const stills = recipe({ id: 'stills', status: 'published', uses: 50, author: accepted, steps: [{ id: 'a', ordinal: 1, title: 'A', verb: 'Pick three stills', why: '.', makeKind: 'still' }] })
    const video = recipe({ id: 'video', status: 'published', uses: 1, author: accepted, steps: [{ id: 'b', ordinal: 1, title: 'B', verb: 'Make the opener', why: '.', makeKind: 'video' }] })
    const s = sheetList([recipe({ id: 'mine' })], [stills, video], 'video')
    expect(s.drafts.map((r) => r.id)).toEqual(['mine'])
    expect(s.published.map((r) => r.id)).toEqual(['video', 'stills'])
  })
})
