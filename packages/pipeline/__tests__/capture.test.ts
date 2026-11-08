// Job B.11: Capture, one screen — typed notes merge into the transcript by time; the best photo is the picture.
//   npm test -w @ivywolf/pipeline
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Utterance } from '@ivywolf/schema'
import { bestPhoto, mergeNotes, photoAsImport, type CapturePhoto } from '../capture'

const said = (start_ms: number, end_ms: number, text: string): Utterance => ({ start_ms, end_ms, speaker: '0', text })
const photo = (at_ms: number): CapturePhoto => ({ at_ms, storage_path: `u/captures/${at_ms}.jpg`, poster_path: `u/imports/${at_ms}.jpg` })

test('notes merge into the transcript in time order', () => {
  const spoken = [said(0, 4000, 'Okay so the launch idea.'), said(12000, 15000, 'A dot-matrix line.'), said(40000, 43000, 'That refraction.')]
  const merged = mergeNotes(spoken, [
    { at_ms: 31000, text: 'One red detail, like a switch.' },
    { at_ms: 2000, text: 'fee — check' },
  ])
  assert.deepEqual(
    merged.map((u) => u.text),
    ['Okay so the launch idea.', 'fee — check', 'A dot-matrix line.', 'One red detail, like a switch.', 'That refraction.']
  )
  // Starts stay ordered: a note stamped mid-sentence goes after that sentence ends.
  for (let i = 1; i < merged.length; i++) assert.ok(merged[i].start_ms >= merged[i - 1].start_ms, `order at ${i}`)
  assert.equal(merged[1].start_ms, 4000)
  assert.equal(merged[3].start_ms, 31000)
})

test('notes with the same stamp keep the order she typed them', () => {
  const merged = mergeNotes([], [
    { at_ms: 5000, text: 'first' },
    { at_ms: 5000, text: 'second' },
    { at_ms: 1000, text: 'earliest' },
  ])
  assert.deepEqual(merged.map((u) => u.text), ['earliest', 'first', 'second'])
})

test('a typed-only capture is utterances on its own; blank notes are dropped', () => {
  const merged = mergeNotes([], [{ at_ms: 0, text: 'Pen-in-motion opener. Shoot it Tuesday.' }, { at_ms: 900, text: '   ' }])
  assert.deepEqual(merged.map((u) => u.text), ['Pen-in-motion opener.', 'Shoot it Tuesday.'])
  assert.ok(merged.every((u) => u.end_ms > u.start_ms))
})

test('no notes leaves the transcript exactly as heard', () => {
  const spoken = [said(0, 1000, 'hi')]
  assert.equal(mergeNotes(spoken, []), spoken)
})

test('the best photo is the one added nearest the idea; ties go to the earlier', () => {
  const photos = [photo(42000), photo(38000), photo(5000)]
  assert.equal(bestPhoto(photos, 40000)?.at_ms, 38000)
  assert.equal(bestPhoto(photos, 6000)?.at_ms, 5000)
  assert.equal(bestPhoto(photos, null)?.at_ms, 5000)
  assert.equal(bestPhoto([], 1000), null)
})

test('the best photo goes on the card through the import lane', () => {
  assert.deepEqual(photoAsImport(photo(38000)), { kind: 'image', originalPath: 'u/captures/38000.jpg', posterPath: 'u/imports/38000.jpg' })
})
