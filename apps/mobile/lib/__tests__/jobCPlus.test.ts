// Job C+: links both ways, the link lines' geometry, context lines, the hue fallback (v4) and the pinned order.
import { hueOf, HUE_NAMES, hues } from '@ivywolf/ui'
import { linkedLine, pair, toLinks } from '@/lib/links'
import { contextLines, type ContextItem } from '@/lib/context'
import { edgeToEdge } from '@/components/LinkMode'
import { pinnedOf } from '@/components/PinnedRow'

describe('links', () => {
  it('stores a pair one way and reads it both ways', () => {
    expect(pair('b', 'a')).toEqual(['a', 'b'])
    const links = toLinks([{ card_a: 'a', card_b: 'b' }, { card_a: 'a', card_b: 'c' }])
    expect([...links.get('a')!]).toEqual(['b', 'c'])
    expect([...links.get('b')!]).toEqual(['a'])
    expect([...links.get('c')!]).toEqual(['a'])
  })
  it('says how many were linked', () => {
    expect(linkedLine(1)).toBe('1 idea linked')
    expect(linkedLine(2)).toBe('2 ideas linked')
  })
  it('draws a line from edge to edge, not centre to centre', () => {
    const [p, q] = edgeToEdge({ x: 0, y: 0, w: 100, h: 100 }, { x: 200, y: 0, w: 100, h: 100 })
    expect(p).toEqual({ x: 100, y: 50 })
    expect(q).toEqual({ x: 200, y: 50 })
  })
})

describe('hues', () => {
  it('has the four project hues and My things’ cool-grey, flat colours, and falls back to cool-grey', () => {
    expect(HUE_NAMES).toEqual(['coral', 'sage', 'butter', 'slate', 'cool-grey'])
    for (const name of HUE_NAMES) expect(hues[name]).toMatch(/^#[0-9A-F]{6}$/)
    expect(hueOf('butter')).toBe('#F2E3B2')
    expect(hueOf('nope')).toBe(hues['cool-grey'])
    expect(hueOf(null)).toBe(hues['cool-grey'])
  })
})

describe('pinned', () => {
  it('keeps only pinned cards, newest pin first', () => {
    const items = [
      { kind: 'card', id: '1', pinnedAt: '2026-10-01T00:00:00Z' },
      { kind: 'card', id: '2', pinnedAt: null },
      { kind: 'action', id: '3', pinnedAt: '2026-10-05T00:00:00Z' },
      { kind: 'card', id: '4', pinnedAt: '2026-10-03T00:00:00Z' },
    ]
    expect(pinnedOf(items).map((i) => i.id)).toEqual(['4', '1'])
  })
})

describe('context lines', () => {
  const now = new Date('2026-10-07T15:00:00')
  const base = { id: 'x', url: null, cite: {}, createdAt: '2026-10-07T14:14:00' }
  it('reads a voice note as Figma 1461:2 does', () => {
    const v: ContextItem = { ...base, kind: 'voice', content: 'land on the third roof, not the second', meta: { status: 'done', duration_ms: 12000 } }
    expect(contextLines(v, now)).toEqual({ title: '“land on the third roof, not the second”', meta: 'Voice note · Today 2:14 · 0:12' })
  })
  it('says Ivy is still writing a note down', () => {
    const v: ContextItem = { ...base, kind: 'voice', content: null, meta: { status: 'transcribing' } }
    expect(contextLines(v, now).title).toBe('Ivy is writing it down…')
  })
  it('names a link by its host', () => {
    const l: ContextItem = { ...base, kind: 'link', content: 'Rooftop parkour in one take', url: 'https://www.youtube.com/watch?v=1', meta: { host: 'youtube.com' } }
    expect(contextLines(l, now)).toEqual({ title: 'Rooftop parkour in one take', meta: 'Link · youtube.com' })
  })
  it('says what an image is for', () => {
    const i: ContextItem = { ...base, kind: 'image', content: 'IMG_1.jpg', meta: { role: 'style' }, cite: { source: 'Camera roll' } }
    expect(contextLines(i, now).meta).toBe('Image · Your style · Camera roll')
  })
})
