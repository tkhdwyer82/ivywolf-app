// B.12: the cover ladder — her photo, else the Ivy library above the bar, else generated from library references,
// else what there was. The live path (copy, fal, writes) is scripts/backfill-covers.ts.
//   npm test -w @ivywolf/pipeline
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIBRARY_THRESHOLD, STYLE_REFS, libraryThreshold, chooseCover, coverPrompt, coverQuery, coverSubject, ladderCover, type LibraryMatch } from '../covers'

const m = (id: string, similarity: number, kind: 'photo' | 'video' = 'photo'): LibraryMatch => ({ id, path: `box/${id}.jpeg`, kind, caption: id, similarity })
const card = { source: null }

test('the threshold is 0.45, and the server can tune it without a deploy', () => {
  assert.equal(LIBRARY_THRESHOLD, 0.45)
  assert.equal(libraryThreshold(undefined), 0.45)
  assert.equal(libraryThreshold('0.42'), 0.42)
  assert.equal(libraryThreshold('nonsense'), 0.45)
  assert.equal(libraryThreshold('4'), 0.45)
})

test('a. her photo from the capture is the cover; nothing below runs', () => {
  assert.deepEqual(chooseCover({ source: 'import' }, [m('a', 0.9)]), { step: 'own' })
})

test('b. the best library photo at or above the bar', () => {
  const c = chooseCover(card, [m('low', 0.2), m('best', 0.53), m('next', 0.46)])
  assert.equal(c.step, 'library')
  assert.equal(c.step === 'library' && c.item.id, 'best')
  assert.equal(chooseCover(card, [m('edge', 0.45)]).step, 'library', 'the bar itself counts')
  assert.equal(chooseCover(card, [m('under', 0.44)]).step, 'generate')
})

test('b. a clip is never a cover, however close', () => {
  const c = chooseCover(card, [m('clip', 0.6, 'video'), m('photo', 0.47)])
  assert.equal(c.step === 'library' && c.item.id, 'photo')
})

test('c. below the bar: generate, styled on the top 2–3 library photos', () => {
  const c = chooseCover(card, [m('p1', 0.43), m('p4', 0.1), m('p2', 0.25), m('v', 0.44, 'video'), m('p3', 0.2)])
  assert.equal(c.step, 'generate')
  assert.deepEqual(c.step === 'generate' && c.refs.map((r) => r.id), ['p1', 'p2', 'p3'])
  assert.equal(STYLE_REFS, 3)
  assert.equal(chooseCover(card, [m('p1', 0.1, 'photo'), m('p2', 0.05)], 0.3).step, 'generate')
})

test('d. no library photos at all: what there was before', () => {
  assert.deepEqual(chooseCover(card, []), { step: 'fallback' })
  assert.deepEqual(chooseCover(card, [m('v', 0.9, 'video')]), { step: 'fallback' })
})

test('a tuned threshold moves the line', () => {
  assert.equal(chooseCover(card, [m('p', 0.33)], 0.35).step, 'generate')
})

test('what leaves: the idea\'s words for search; for fal only its subject, names heard taken out', () => {
  assert.equal(coverQuery({ title: 'The box is the brand', gist: 'Unboxing  as the ad.' }), 'The box is the brand. Unboxing as the ad.')
  assert.equal(coverQuery({ title: 'Untitled', gist: null }), 'Untitled.')
  assert.equal(coverSubject({ visual_query: 'matte black gift box', title: 'x' }, []), 'matte black gift box')
  assert.equal(coverSubject({ visual_query: null, title: 'Arabella rooftop chase' }, ['Arabella']), 'rooftop chase')
  const p = coverPrompt('matte black gift box.')
  assert.match(p, /^A photograph of: matte black gift box\./)
  assert.match(p, /No text, no lettering, no logos/)
})

test('a ladder cover is told apart from Unsplash and her own', () => {
  assert.ok(ladderCover({ frame_attribution: { provider: 'ivy_library' } }))
  assert.ok(ladderCover({ frame_attribution: { provider: 'ivy_generated' } }))
  assert.ok(!ladderCover({ frame_attribution: { provider: 'unsplash' } }))
  assert.ok(!ladderCover({ frame_attribution: null }))
})

// ─── Undoable covers ────────────────────────────────────────────────────────────────────────────────────────────
import { COVER_USD, DRAWS, drawChecked, droppedFiles, ladderFile, snapshot } from '../covers'
import { cardFramePaths } from '../../schema/deletion'
import { keepPicture, referencePath } from '../references/picture'

const F = 'https://x.supabase.co/storage/v1/object/public/frames/'
const unsplash = { provider: 'unsplash', photo_id: 'p1', photographer: 'Ana', photographer_url: 'u', photo_url: 'u', download_location: 'd' }

test('the previous picture is kept whole — link, status, credit — and only one step back', () => {
  const slot = { frame_url: 'https://images.unsplash.com/x', frame_status: 'done', frame_at: '2026-10-20T00:00:00Z', frame_attribution: { ...unsplash, previous: { frame_url: 'old' } as never } }
  const prev = snapshot(slot)
  assert.deepEqual(prev, { frame_url: 'https://images.unsplash.com/x', frame_status: 'done', frame_at: '2026-10-20T00:00:00Z', frame_attribution: unsplash })
  assert.deepEqual(snapshot({ frame_url: null, frame_status: 'typographic', frame_at: null, frame_attribution: null }).frame_attribution, null)
})

test('a replacement deletes only the step that falls out of history, never the picture now kept as previous', () => {
  const before = (prev: string | null) => ({
    frame_url: `${F}u/covers/c1-2.jpg`, frame_status: 'done', frame_at: null,
    frame_attribution: { provider: 'ivy_library', previous: { frame_url: prev, frame_status: 'done', frame_at: null, frame_attribution: null } },
  })
  assert.deepEqual(droppedFiles(before(`${F}u/covers/c1-1.jpg`), `${F}u/covers/c1-3.jpg`), ['u/covers/c1-1.jpg'])
  assert.deepEqual(droppedFiles(before('https://images.unsplash.com/x'), `${F}u/covers/c1-3.jpg`), [], 'a hotlink has no file')
  assert.deepEqual(droppedFiles(before(`${F}u/imports/her.jpg`), `${F}u/covers/c1-3.jpg`), [], 'never her poster')
  assert.deepEqual(droppedFiles(before(null), `${F}u/covers/c1-3.jpg`), [])
  assert.equal(ladderFile(`${F}u/covers/a.jpg`), 'u/covers/a.jpg')
  assert.equal(ladderFile(`${F}u/imports/a.jpg`), null)
})

test('deleting a card takes its picture, its kept previous cover and its Pixabay copy; never a hotlink', () => {
  assert.deepEqual(
    cardFramePaths({
      frame_url: `${F}u/covers/c1-2.jpg`, media_path: null,
      frame_attribution: { previous: { frame_url: `${F}u/covers/c1-1.jpg` } },
      reference_picture: { url: `${F}u/references/c1-99.jpg` },
    }).sort(),
    ['u/covers/c1-1.jpg', 'u/covers/c1-2.jpg', 'u/references/c1-99.jpg']
  )
  assert.deepEqual(cardFramePaths({ frame_url: 'https://images.unsplash.com/x', media_path: null, frame_attribution: { previous: { frame_url: 'https://images.unsplash.com/y' } }, reference_picture: { url: 'https://pixabay.com/get/abc' } }), [])
})

// ─── Lettering check ────────────────────────────────────────────────────────────────────────────────────────────

const jpeg = (n: number) => Buffer.from([n])
test('a clean first draw is kept: one draw, one charge', async () => {
  const r = await drawChecked(async () => jpeg(1), async () => ({ lettering: false, what: '' }))
  assert.deepEqual([r.jpeg?.[0], r.attempts, r.spent, r.rejected], [1, 1, COVER_USD, []])
})

test('lettering on the first draw: rejected, drawn once more, the clean second kept — both paid for', async () => {
  let n = 0
  const seen: string[] = []
  const r = await drawChecked(
    async () => jpeg(++n),
    async (j) => (j[0] === 1 ? { lettering: true, what: 'brand name on the box lid' } : { lettering: false, what: '' }),
    async (what) => void seen.push(what)
  )
  assert.equal(r.jpeg?.[0], 2)
  assert.equal(r.attempts, 2)
  assert.equal(r.spent, 2 * COVER_USD)
  assert.deepEqual(seen, ['brand name on the box lid'])
})

test('lettering twice: no cover (the idea stays at d); never a third draw', async () => {
  let n = 0
  const r = await drawChecked(async () => jpeg(++n), async () => ({ lettering: true, what: 'NEW HORIZONS' }))
  assert.equal(r.jpeg, null)
  assert.equal(n, DRAWS)
  assert.deepEqual(r.rejected, ['NEW HORIZONS', 'NEW HORIZONS'])
})

test('the prompt keeps her subject and takes only light, palette and material from the references', () => {
  const p = coverPrompt('a gym floor')
  assert.match(p, /Keep the idea’s subject; take only light, palette and material from the references/)
  assert.doesNotMatch(p, /framing — but make/)
})

// ─── Pixabay kept ───────────────────────────────────────────────────────────────────────────────────────────────

test('Unsplash stays a hotlink: nothing fetched or copied', async () => {
  const pic = { source: 'unsplash' as const, id: 'u1', url: 'https://images.unsplash.com/u1', thumb_url: 't', link_url: 'l', credit: { name: 'Ana', url: 'u' }, width: 1, height: 1 }
  let fetched = false
  const kept = await keepPicture('u', 'c1', pic, (async () => { fetched = true; throw new Error('no') }) as unknown as typeof fetch)
  assert.equal(kept, pic)
  assert.equal(fetched, false)
})

test('a Pixabay copy lives in her frames folder, one per card and picture', () => {
  assert.equal(referencePath('user_1', 'c1', '12345'), 'user_1/references/c1-12345.jpg')
})
