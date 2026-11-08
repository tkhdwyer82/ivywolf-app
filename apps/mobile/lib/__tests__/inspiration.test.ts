/// <reference types="jest" />
// Inspiration demo (the Ivy library): tile shapes, the masonry, the idea page's query, the item cache's hour, and
// "flag off" — a 404 from search — becoming LibraryOff so the app hides the library instead of showing an error.
import {
  LibraryOff, PORTRAIT, QUERY_MAX, TALLEST, __forget, __remember, ideaQuery, libraryColumns, moreLikeThis, recall,
  searchLibrary, shotLabel, tileRatio, type InspirationItem,
} from '../inspiration'

const item = (id: string, width: number | null, height: number | null, kind: 'photo' | 'video' = 'photo'): InspirationItem => ({
  id, path: `nothing/${id}.jpeg`, kind, folder: 'nothing', width, height, caption: id, keywords: [], colours: [], shot: 'product',
  people: 'none', url: `https://x.supabase.co/storage/v1/object/sign/inspiration-test/nothing/${id}?token=t`,
})

describe('tile shape: portrait first, cropped to 4:5', () => {
  it('landscape and square are cropped to 4:5', () => {
    expect(tileRatio(item('wide', 1600, 900))).toBe(PORTRAIT)
    expect(tileRatio(item('square', 720, 720))).toBe(PORTRAIT)
  })
  it('a taller portrait keeps its shape, up to 9:16', () => {
    expect(tileRatio(item('3x4', 900, 1200))).toBeCloseTo(4 / 3)
    expect(tileRatio(item('9x16', 720, 1280))).toBeCloseTo(TALLEST)
    expect(tileRatio(item('strip', 500, 2000))).toBe(TALLEST)
  })
  it('no size yet is 4:5', () => {
    expect(tileRatio(item('unknown', null, null))).toBe(PORTRAIT)
  })
})

describe('library masonry', () => {
  it('each tile goes to the shorter column, so a tall clip balances two crops', () => {
    const [left, right] = libraryColumns([item('clip', 720, 1280, 'video'), item('a', 1000, 1000), item('b', 1000, 1000), item('c', 1000, 1000)])
    expect(left.map((i) => i.id)).toEqual(['clip', 'c'])
    expect(right.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('the idea page searches with the idea’s words', () => {
  it('title, then gist, one line, capped at the API’s limit', () => {
    expect(ideaQuery({ title: 'Clear case reveal', gist: 'Open the case\nslowly, in hard light' })).toBe('Clear case reveal. Open the case slowly, in hard light')
    expect(ideaQuery({ title: 't', gist: 'x'.repeat(500) }).length).toBe(QUERY_MAX)
  })
})

describe('items are remembered for their URLs’ hour, less a margin', () => {
  beforeEach(() => __forget())
  it('a tile page opens from what search fetched, until the link is about to expire', () => {
    const now = 1_000_000
    __remember({ items: [item('a', 1, 1)], expires_in: 3600 }, now)
    expect(recall('a', now + 30 * 60_000)?.id).toBe('a')
    expect(recall('a', now + 56 * 60_000)).toBeNull() // inside the 5-minute margin
    expect(recall('never-fetched', now)).toBeNull()
  })
})

describe('flag off', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const answer = (status: number, body: unknown = {}) => {
    globalThis.fetch = jest.fn(async () => ({ status, ok: status < 400, json: async () => body })) as unknown as typeof fetch
  }
  it('search answering 404 is LibraryOff, so the app hides the library', async () => {
    answer(404)
    await expect(searchLibrary('tok', 'earbuds')).rejects.toBeInstanceOf(LibraryOff)
  })
  it('any other failure is an ordinary error', async () => {
    answer(502)
    await expect(searchLibrary('tok', 'earbuds')).rejects.not.toBeInstanceOf(LibraryOff)
  })
  it('a 404 from more like this means the item has gone, not that the flag is off', async () => {
    answer(404)
    await expect(moreLikeThis('tok', 'abc')).rejects.toThrow('That picture has gone')
  })
  it('search sends the words, the limit and the people filter, and remembers what came back', async () => {
    __forget()
    answer(200, { items: [item('p1', 1, 1)], expires_in: 3600 })
    const items = await searchLibrary('tok', 'clear case', { limit: 6, people: 'hands' })
    expect(items.map((i) => i.id)).toEqual(['p1'])
    const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('/api/inspiration/search?q=clear+case&limit=6&people=hands')
    expect(recall('p1')?.id).toBe('p1')
  })
})

it('shot labels read as words', () => {
  expect(shotLabel('flat_lay')).toBe('Flat lay')
  expect(shotLabel('product')).toBe('Product')
})
