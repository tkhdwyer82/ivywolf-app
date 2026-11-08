// B.12: the cover ladder — her photo, else the Ivy library above the bar, else generated from library references,
// else what there was. The live path (copy, fal, writes) is scripts/backfill-covers.ts.
//   npm test -w @ivywolf/pipeline
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIBRARY_THRESHOLD, STYLE_REFS, libraryThreshold, chooseCover, coverPrompt, coverQuery, coverSubject, ladderCover, type LibraryMatch } from '../covers'

const m = (id: string, similarity: number, kind: 'photo' | 'video' = 'photo'): LibraryMatch => ({ id, path: `box/${id}.jpeg`, kind, caption: id, similarity })
const card = { source: null }

test('the threshold starts at 0.30, and the server can tune it without a deploy', () => {
  assert.equal(LIBRARY_THRESHOLD, 0.3)
  assert.equal(libraryThreshold(undefined), 0.3)
  assert.equal(libraryThreshold('0.42'), 0.42)
  assert.equal(libraryThreshold('nonsense'), 0.3)
  assert.equal(libraryThreshold('4'), 0.3)
})

test('a. her photo from the capture is the cover; nothing below runs', () => {
  assert.deepEqual(chooseCover({ source: 'import' }, [m('a', 0.9)]), { step: 'own' })
})

test('b. the best library photo at or above the bar', () => {
  const c = chooseCover(card, [m('low', 0.2), m('best', 0.41), m('next', 0.35)])
  assert.equal(c.step, 'library')
  assert.equal(c.step === 'library' && c.item.id, 'best')
  assert.equal(chooseCover(card, [m('edge', 0.3)]).step, 'library', 'the bar itself counts')
})

test('b. a clip is never a cover, however close', () => {
  const c = chooseCover(card, [m('clip', 0.6, 'video'), m('photo', 0.31)])
  assert.equal(c.step === 'library' && c.item.id, 'photo')
})

test('c. below the bar: generate, styled on the top 2–3 library photos', () => {
  const c = chooseCover(card, [m('p1', 0.29), m('p4', 0.1), m('p2', 0.25), m('v', 0.28, 'video'), m('p3', 0.2)])
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
