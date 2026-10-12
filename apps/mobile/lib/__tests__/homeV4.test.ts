// Home v4 (Job B.2, Figma 1737:2): the picture every idea carries and the order it's found in; My things as a row,
// not tiles; one direction a day. (Hue cycling is the database's: scripts/test-0039.sql.)
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }))
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }))
jest.mock('expo-file-system', () => ({ File: class {} }))

import { feedItems, thingsLine, thingsRow, type ActionItem, type CardItem, type Item } from '@/lib/home'
import { findingPicture, resolvePicture, type OwnPicture, type ReferencePicture, type UnsplashFrame } from '@/lib/picture'
import { directionMeta, doneForToday, pickDirection, type HomeDirection } from '@/lib/directionOfDay'

const own = (from: OwnPicture['from'], at: string, uri = `https://own/${from}`): OwnPicture => ({ uri, kind: from === 'created' ? 'video' : 'image', at, from })
const unsplash: UnsplashFrame = { url: 'https://images.unsplash.com/1', photographer: 'Ana', photographerUrl: 'https://unsplash.com/@ana', photoUrl: 'https://unsplash.com/photos/1' }
const reference = (source: 'unsplash' | 'pixabay' | 'pinterest'): ReferencePicture =>
  ({ source, id: '9', url: `https://${source}/full`, thumb_url: 't', link_url: `https://${source}/page`, credit: { name: 'Lee', url: 'https://lee' }, width: 1, height: 1, track_url: 'https://track' }) as ReferencePicture

describe('card picture resolution order', () => {
  it('1. her own picture comes first — the newest of Add context and the Create flow', () => {
    const p = resolvePicture({ own: [own('context', '2026-10-01T00:00:00Z'), own('created', '2026-10-02T00:00:00Z')], unsplash, reference: reference('unsplash') })
    expect(p.source).toBe('created')
    expect(p.kind).toBe('video')
    expect(p.credit).toBeNull()
    const q = resolvePicture({ own: [own('context', '2026-10-03T00:00:00Z'), own('created', '2026-10-02T00:00:00Z')], unsplash, reference: null })
    expect(q.source).toBe('own')
  })
  it('2. then the credited Unsplash photo, whose download event was sent when it was chosen', () => {
    const p = resolvePicture({ own: [], unsplash, reference: reference('pixabay') })
    expect(p).toMatchObject({ source: 'unsplash', uri: unsplash.url, credit: { line: 'Photo by Ana on Unsplash' }, trackUrl: null })
  })
  it('3. then the reference picture, credited per source; only an Unsplash one is tracked, on use', () => {
    expect(resolvePicture({ own: [], unsplash: null, reference: reference('unsplash') })).toMatchObject({
      source: 'reference',
      credit: { line: 'Photo by Lee on Unsplash' },
      trackUrl: 'https://track',
    })
    expect(resolvePicture({ own: [], unsplash: null, reference: reference('pixabay') })).toMatchObject({
      source: 'reference',
      credit: { line: 'Image by Lee on Pixabay', provider: 'Pixabay' },
      trackUrl: null,
    })
  })
  it('never a Pinterest pin', () => {
    expect(resolvePicture({ own: [], unsplash: null, reference: reference('pinterest') }).source).toBe('hue')
  })
  it('4. else the project hue, "finding a picture…" only while the card is new', () => {
    const p = resolvePicture({ own: [], unsplash: null, reference: null })
    expect(p).toMatchObject({ source: 'hue', uri: null })
    const now = Date.parse('2026-10-12T10:00:00Z')
    expect(findingPicture(p, '2026-10-12T09:58:00Z', now)).toBe(true)
    expect(findingPicture(p, '2026-10-12T09:00:00Z', now)).toBe(false)
  })
})

const todo = (id: string, over: Partial<ActionItem> = {}): ActionItem =>
  ({ kind: 'action', id, text: id, done: false, dueDate: null, at: `2026-10-12T0${id.length}:00:00Z`, projectId: 'things', recordingId: null, frameUrl: null, frameStatus: 'none', frameAt: null, ...over }) as ActionItem
const card = { kind: 'card', id: 'c', projectId: 'p', at: '2026-10-12T00:00:00Z' } as CardItem

describe('My things row', () => {
  const now = new Date('2026-10-12T12:00:00')
  it('is hidden when there are no open to-dos', () => {
    expect(thingsRow([card], now)).toBeNull()
    expect(thingsRow([card, todo('milk', { done: true })], now)).toBeNull()
  })
  it('shows how many are on today and the first three', () => {
    const items: Item[] = [todo('milk'), todo('visa', { dueDate: '2026-10-12' }), todo('wipes', { dueDate: '2026-10-01' }), todo('tax', { dueDate: '2026-11-01' }), todo('rent')]
    const row = thingsRow(items, now)!
    expect(row.today).toBe(4)
    expect(row.first).toHaveLength(3)
    expect(thingsLine(row, 5)).toMatch(/^4 today · /)
  })
  it('with nothing due yet, says how many are open', () => {
    const row = thingsRow([todo('tax', { dueDate: '2026-11-01' })], now)!
    expect(thingsLine(row, 1)).toBe('1 open')
  })
  it('to-dos never render as tiles in the feed', () => {
    expect(feedItems([card, todo('milk')], null)).toEqual([card])
    expect(feedItems([card, todo('milk')], 'things')).toEqual([])
  })
})

const dir = (id: string, generatedAt: string): HomeDirection => ({ id, projectId: 'p', projectName: 'Restock Reel', hue: 'sage', title: id, why: 'from Thu 0:31: “open on the box”', generatedAt })

describe('direction tile, once a day', () => {
  const a = dir('a', '2026-10-12T01:00:00Z')
  const b = dir('b', '2026-10-12T02:00:00Z')
  it('a new day takes the newest direction', () => {
    const { direction, state } = pickDirection(null, [a, b], '2026-10-12')
    expect(direction?.id).toBe('b')
    expect(state).toEqual({ day: '2026-10-12', id: 'b', gone: false })
  })
  it('the same day keeps the same one, even when a newer one arrives', () => {
    const c = dir('c', '2026-10-12T05:00:00Z')
    expect(pickDirection({ day: '2026-10-12', id: 'b', gone: false }, [a, b, c], '2026-10-12').direction?.id).toBe('b')
  })
  it('saved or dismissed, none until tomorrow — the next one doesn’t step in', () => {
    const gone = doneForToday({ day: '2026-10-12', id: 'b', gone: false })
    expect(pickDirection(gone, [a], '2026-10-12').direction).toBeNull()
    expect(pickDirection(gone, [a], '2026-10-13').direction?.id).toBe('a')
  })
  it('no new directions, no tile', () => {
    expect(pickDirection(null, [], '2026-10-12').direction).toBeNull()
  })
  it('its cite line: when she said it, and the project', () => {
    expect(directionMeta(a)).toBe('from Thu 0:31 · Restock Reel')
  })
})

import { filterTools, TOOLS } from '@/lib/explore'
import { rankPickable, pickableLine, type Pickable } from '@/lib/pickIdea'

describe('Explore', () => {
  it('chips and search filter the tools; only live ones are tryable', () => {
    expect(filterTools(TOOLS, 'Video', '').map((t) => t.key)).toEqual(['kling-3', 'kling'])
    expect(filterTools(TOOLS, 'All', 'reel').map((t) => t.key)).toEqual(['capcut'])
    expect(TOOLS.filter((t) => t.live).map((t) => t.via)).toEqual(['Higgsfield'])
  })
  it('Pick an idea: ideas with frames first, newest first within each', () => {
    const p = (id: string, at: string, frames: number) => ({ card: { id, at, projectName: 'Launch video' } as CardItem, frames }) as Pickable
    expect(rankPickable([p('a', '2026-10-01', 0), p('b', '2026-09-01', 2), p('c', '2026-10-02', 1)]).map((x) => x.card.id)).toEqual(['c', 'b', 'a'])
    expect(pickableLine(p('a', '2026-10-01', 3))).toBe('Launch video · has 3 frames')
    expect(pickableLine(p('a', '2026-10-01', 0))).toBe('Launch video · no frames yet')
  })
})
