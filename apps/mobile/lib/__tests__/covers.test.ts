// B.12: the cover ladder in the app — where a ladder cover sits in the picture order, its credit, and Change cover.
import { canChangeCover, coverCredit, CoversOff, loadCoverChoices, restorePreviousCover, setCover } from '@/lib/covers'
import { cardPicture, ladderCoverOf, toCardItem, type CardRow } from '@/lib/home'
import { resolvePicture } from '@/lib/picture'

const row = (over: Partial<CardRow> = {}): CardRow =>
  ({
    id: 'c1', recording_id: 'r1', project_id: 'p1', title: 'The box is the brand', gist: 'Unboxing as the ad', play_from_ms: 0,
    confidence: 0.9, frame_url: 'https://x.supabase.co/storage/v1/object/public/frames/u/covers/c1-1.jpg', frame_status: 'done', frame_at: null,
    created_at: '2026-11-08T00:00:00Z', source: null, shape: 'photo', quote: null, diagram: null, board: null,
    frame_attribution: { provider: 'ivy_library', caption: 'Matte black sliding box' }, reference_picture: null, recordings: null,
    ...over,
  }) as CardRow

describe('picture order with a ladder cover', () => {
  const cover = { url: 'https://frames/cover.jpg', from: 'library' as const, caption: 'Black box' }
  const unsplash = { url: 'https://images.unsplash.com/x', photographer: 'Ana', photographerUrl: 'https://u/ana', photoUrl: 'https://u/p' }

  it('her own picture still comes first', () => {
    const p = resolvePicture({ own: [{ uri: 'https://own/p.jpg', kind: 'image', at: '2026-11-08T00:00:00Z', from: 'context' }], cover, unsplash: null, reference: null })
    expect(p.source).toBe('own')
  })
  it('then the cover — ahead of Unsplash and the reference picture', () => {
    const p = resolvePicture({ own: [], cover, unsplash, reference: null })
    expect(p).toMatchObject({ source: 'library', uri: cover.url, credit: null, caption: 'Black box' })
  })
  it('no cover: exactly as before', () => {
    expect(resolvePicture({ own: [], cover: null, unsplash, reference: null }).source).toBe('unsplash')
    expect(resolvePicture({ own: [], unsplash: null, reference: null }).source).toBe('hue')
  })
})

describe('a card row with a ladder cover', () => {
  it('is shown, as library or generated — and never mistaken for her own picture', () => {
    expect(cardPicture(row())).toContain('/covers/')
    expect(toCardItem(row()).picture.source).toBe('library')
    expect(toCardItem(row({ frame_attribution: { provider: 'ivy_generated' } })).picture.source).toBe('generated')
    expect(ladderCoverOf(row({ frame_status: 'queued' }))).toBeNull()
  })
  it('knows when there is a previous cover to restore', () => {
    expect(toCardItem(row()).hasPreviousCover).toBe(false)
    expect(toCardItem(row({ frame_attribution: { provider: 'ivy_generated', previous: { frame_url: null } } })).hasPreviousCover).toBe(true)
  })
  it('an import is still her own picture', () => {
    expect(toCardItem(row({ source: 'import', frame_attribution: null })).picture.source).toBe('own')
  })
})

describe('credit and Change cover', () => {
  it('Photo credit says "Ivy library", with what the picture is', () => {
    expect(coverCredit({ source: 'library', caption: 'Black box' })).toEqual({ title: 'Photo credit', body: 'Ivy library\nBlack box' })
    expect(coverCredit({ source: 'generated' })?.body).toBe('Made by Ivy, styled on Ivy library pictures')
    expect(coverCredit({ source: 'unsplash' })).toBeNull()
  })
  it('Change cover only with the library on, and never over her own picture or take', () => {
    expect(canChangeCover(true, 'unsplash')).toBe(true)
    expect(canChangeCover(true, 'library')).toBe(true)
    expect(canChangeCover(true, 'hue')).toBe(true)
    expect(canChangeCover(false, 'unsplash')).toBe(false)
    expect(canChangeCover(true, 'own')).toBe(false)
    expect(canChangeCover(true, 'created')).toBe(false)
  })
})

describe('the covers API', () => {
  const fetchMock = jest.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })
  it('404 means the library is off', async () => {
    fetchMock.mockResolvedValue({ status: 404, ok: false })
    await expect(loadCoverChoices('tok', 'c1')).rejects.toBeInstanceOf(CoversOff)
  })
  it('lists the choices and sets one by id', async () => {
    fetchMock.mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ items: [{ id: 'i1', url: 'u', caption: 'c', width: 1, height: 1, similarity: 0.4 }] }) })
    expect((await loadCoverChoices('tok', 'c1')).map((c) => c.id)).toEqual(['i1'])
    fetchMock.mockResolvedValueOnce({ status: 200, ok: true })
    await setCover('tok', 'c1', 'i1')
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringMatching(/\/api\/cards\/c1\/covers$/), expect.objectContaining({ method: 'POST', body: JSON.stringify({ item_id: 'i1' }) }))
  })
  it('restore posts to the card; 409 says there is nothing to go back to', async () => {
    fetchMock.mockResolvedValueOnce({ status: 200, ok: true })
    await restorePreviousCover('tok', 'c1')
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringMatching(/\/api\/cards\/c1\/covers\/restore$/), expect.objectContaining({ method: 'POST' }))
    fetchMock.mockResolvedValueOnce({ status: 409, ok: false })
    await expect(restorePreviousCover('tok', 'c1')).rejects.toThrow('There’s no earlier cover to go back to')
  })
  it('409: her own picture is never swapped', async () => {
    fetchMock.mockResolvedValue({ status: 409, ok: false })
    await expect(setCover('tok', 'c1', 'i1')).rejects.toThrow('This idea wears your own picture')
  })
})
