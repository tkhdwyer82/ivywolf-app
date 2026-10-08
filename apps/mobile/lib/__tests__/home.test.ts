/// <reference types="jest" />
// Job B revised: a card made before shapes still renders, and Ivy's line names new cards by their form (227:14)
// with the cite shown after it (162:2).
import { cardPicture, citeLabel, newShapesSentence, shapeOf, type CardItem } from '@/lib/home'

const card = (over: Partial<CardItem>): CardItem =>
  ({
    kind: 'card',
    id: 'c',
    at: '2026-10-01T22:00:00Z', // Fri 2 Oct, 08:00 in Sydney; tests run in the device zone, so only the shape is checked
    playFromMs: 31_000,
    recordingId: 'r1',
    storagePath: 'u/r1.m4a',
    recordingSource: 'phone',
    threadStage: null,
    shape: 'text',
    ...over,
  }) as CardItem

const unsplash = { provider: 'unsplash', photographer: 'A', photographer_url: 'https://u/a', photo_url: 'https://u/p' }

describe('shapeOf', () => {
  it('keeps the shape Ivy or she chose', () => {
    expect(shapeOf({ shape: 'quote', frame_status: 'typographic', frame_url: null, frame_attribution: null })).toBe('quote')
  })
  it('a card from before shapes: photo while its photo is coming or there, else text', () => {
    expect(shapeOf({ shape: null, frame_status: 'done', frame_url: 'https://x/y.jpg', frame_attribution: unsplash })).toBe('photo')
    expect(shapeOf({ shape: null, frame_status: 'queued', frame_url: null, frame_attribution: null })).toBe('photo')
    expect(shapeOf({ shape: null, frame_status: 'typographic', frame_url: null, frame_attribution: null })).toBe('text')
    expect(shapeOf({ shape: null, frame_status: 'failed', frame_url: null, frame_attribution: null })).toBe('text')
  })
  it('a card from before shapes with a generated frame is text, not photo (Job I)', () => {
    expect(shapeOf({ shape: null, frame_status: 'done', frame_url: 'https://x/frames/u/c.jpg', frame_attribution: null, source: 'voice' })).toBe('text')
  })
})

describe('cardPicture (Job I: Unsplash with credit, her own picture, or nothing)', () => {
  const base = { frame_status: 'done' as const, frame_url: 'https://x/frames/u/c.jpg' }
  it('shows a credited Unsplash photo', () => {
    expect(cardPicture({ ...base, frame_attribution: unsplash })).toBe(base.frame_url)
  })
  it('shows her own import', () => {
    expect(cardPicture({ ...base, frame_attribution: null, source: 'import' })).toBe(base.frame_url)
  })
  it('never shows a generated frame or an uncredited pin preview', () => {
    expect(cardPicture({ ...base, frame_attribution: null, source: 'voice' })).toBeNull()
    expect(cardPicture({ ...base, frame_attribution: null, source: 'youtube' })).toBeNull()
    expect(cardPicture({ ...base, frame_attribution: { provider: 'unsplash' }, source: 'voice' })).toBeNull()
  })
  it('shows nothing until the photo is done', () => {
    expect(cardPicture({ ...base, frame_status: 'queued', frame_attribution: unsplash })).toBeNull()
  })
})

describe('newShapesSentence', () => {
  it('is silent when nothing is new', () => {
    expect(newShapesSentence([])).toBeNull()
  })
  it('names each card by its form, and says a ready board is ready (227:14)', () => {
    const s = newShapesSentence([
      card({ id: 'a', shape: 'quote' }),
      card({ id: 'b', shape: 'diagram' }),
      card({ id: 'c', shape: 'board', threadStage: 'ready' }),
    ])
    expect(s?.text).toBe('A quote, a comparison, and the board is ready.')
    expect(s?.cites).toHaveLength(3)
  })
  it('says where they came from when they all came from one place', () => {
    expect(newShapesSentence([card({ shape: 'photo', recordingSource: 'mini' }), card({ id: 'd', shape: 'photo', recordingSource: 'mini' })])?.text).toBe(
      'From your Mini: two photos.'
    )
  })
  it('carries a cite to show and play: the newest card, day and time', () => {
    const s = newShapesSentence([card({ shape: 'text' })])
    expect(s?.cite).toEqual({ label: citeLabel('2026-10-01T22:00:00Z', 31_000), storagePath: 'u/r1.m4a', ms: 31_000 })
    expect(s?.cite?.label).toMatch(/^(Thu|Fri) 0:31$/)
  })
})
