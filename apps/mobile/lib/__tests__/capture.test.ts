// Job B.11 — Capture, one screen: the rules (lib/capture.ts), the words, and the typed-only path.
import {
  attachCapture,
  captureInfo,
  captureMeta,
  captureReducer,
  gotItLine,
  initialCapture,
  mergedText,
  photosLine,
  planCapture,
  statusLine,
  submitTextCapture,
  uploadPhotos,
  type CaptureState,
  type Photo,
} from '../capture'
import { closeDecision } from '../discard'
import { gotItSentence, metaLine, type CardItem } from '../home'
import { addResult, EMPTY_WORDS, endRecognition, split } from '../liveWords'

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {},
  useSpeechRecognitionEvent: () => {},
  AVAudioSessionCategory: {},
  AVAudioSessionCategoryOptions: {},
  AVAudioSessionMode: {},
}))

const photo = (atMs: number): Photo => ({ atMs, uri: `file:///p${atMs}.jpg`, mimeType: 'image/jpeg', fileName: `p${atMs}.jpg` })
const listening = (): CaptureState => captureReducer(initialCapture, { type: 'started' })

describe('the recording state', () => {
  test('opening starts it: starting → listening', () => {
    expect(initialCapture.mic).toBe('starting')
    expect(listening().mic).toBe('listening')
  })

  test('pause and resume are the centre button, and only it', () => {
    const paused = captureReducer(listening(), { type: 'pause' })
    expect(paused.mic).toBe('paused')
    expect(captureReducer(paused, { type: 'resume' }).mic).toBe('listening')
    // Resume when listening, pause when paused: no change.
    expect(captureReducer(listening(), { type: 'resume' }).mic).toBe('listening')
    expect(captureReducer(paused, { type: 'pause' }).mic).toBe('paused')
  })

  test('typing never changes the recording state, listening or paused', () => {
    for (const s of [listening(), captureReducer(listening(), { type: 'pause' })]) {
      let t = captureReducer(s, { type: 'typing', atMs: 31000 })
      t = captureReducer(t, { type: 'typing', atMs: 33000 })
      t = captureReducer(t, { type: 'send', text: 'fee — check' })
      t = captureReducer(t, { type: 'typing', atMs: 40000 })
      t = captureReducer(t, { type: 'cleared' })
      expect(t.mic).toBe(s.mic)
    }
  })

  test('a note is stamped when she started typing it, not when she sent it', () => {
    let s = captureReducer(listening(), { type: 'typing', atMs: 31000 })
    s = captureReducer(s, { type: 'typing', atMs: 36000 })
    s = captureReducer(s, { type: 'send', text: '  …and the colour is one red detail.  ' })
    expect(s.notes).toEqual([{ atMs: 31000, text: '…and the colour is one red detail.' }])
    expect(s.draftAt).toBeNull()
    // Emptying the bar forgets the stamp: the next note is stamped afresh.
    s = captureReducer(s, { type: 'typing', atMs: 50000 })
    s = captureReducer(s, { type: 'cleared' })
    s = captureReducer(s, { type: 'typing', atMs: 52000 })
    s = captureReducer(s, { type: 'send', text: 'second' })
    expect(s.notes[1]).toEqual({ atMs: 52000, text: 'second' })
    // Sending nothing keeps nothing.
    expect(captureReducer(s, { type: 'send', text: '   ' }).notes).toHaveLength(2)
  })

  test('adding a photo never pauses, and is stamped with the time it was added', () => {
    const s = captureReducer(captureReducer(listening(), { type: 'photo', photo: photo(38000) }), { type: 'photo', photo: photo(42000) })
    expect(s.mic).toBe('listening')
    expect(s.photos.map((p) => p.atMs)).toEqual([38000, 42000])
  })
})

describe('Done', () => {
  const quiet = -62
  const loud = -20
  test('speech goes up as audio, with its notes and photos', () => {
    expect(planCapture({ peakDb: loud, tookMs: 12000, notes: [{ atMs: 1, text: 'x' }], photos: [photo(2)] })).toEqual({ kind: 'voice' })
  })
  test('typed only (no speech) goes the text way, notes merged in time order', () => {
    const plan = planCapture({
      peakDb: quiet,
      tookMs: 20000,
      notes: [{ atMs: 9000, text: 'Shoot it Tuesday.' }, { atMs: 1000, text: 'Pen-in-motion opener.' }],
      photos: [],
    })
    expect(plan).toEqual({ kind: 'text', text: 'Pen-in-motion opener.\n\nShoot it Tuesday.' })
  })
  test('photos only (no speech, nothing typed) still makes a card: the text way, no words', () => {
    expect(planCapture({ peakDb: quiet, tookMs: 20000, notes: [], photos: [photo(5)] })).toEqual({ kind: 'text', text: '' })
  })
  test('nothing said, typed or added: nothing to save', () => {
    expect(planCapture({ peakDb: quiet, tookMs: 20000, notes: [], photos: [] })).toEqual({ kind: 'nothing' })
    expect(planCapture({ peakDb: loud, tookMs: 800, notes: [], photos: [] })).toEqual({ kind: 'nothing' })
  })
  test('no level from the mic is not silence; an import always goes up', () => {
    expect(planCapture({ peakDb: null, tookMs: 5000, notes: [], photos: [] })).toEqual({ kind: 'voice' })
    expect(planCapture({ peakDb: quiet, tookMs: 500, notes: [], photos: [], imported: true })).toEqual({ kind: 'voice' })
  })
  test('merge order is by time; equal stamps keep the order typed', () => {
    expect(mergedText([{ atMs: 5, text: 'b' }, { atMs: 1, text: 'a' }, { atMs: 5, text: 'c' }])).toBe('a\n\nb\n\nc')
  })
})

describe('× (discard) is unchanged, and counts what she typed or added', () => {
  test('silence with nothing added drops; speech asks; an import asks', () => {
    expect(closeDecision({ peakDb: -62, imported: false })).toBe('drop')
    expect(closeDecision({ peakDb: -20, imported: false })).toBe('ask')
    expect(closeDecision({ peakDb: null, imported: false })).toBe('ask')
    expect(closeDecision({ peakDb: -62, imported: true })).toBe('ask')
  })
  test('a typed note or a photo asks, even in silence', () => {
    expect(closeDecision({ peakDb: -62, imported: false, added: true })).toBe('ask')
    expect(closeDecision({ peakDb: -62, imported: false, added: false })).toBe('drop')
  })
})

describe('the words', () => {
  test('status line', () => {
    expect(statusLine('listening', 12_400)).toBe('Listening · 0:12')
    expect(statusLine('paused', 31_000)).toBe('Paused · 0:31')
  })
  test('photos line (C3)', () => {
    expect(photosLine([])).toBeNull()
    expect(photosLine([{ atMs: 38000 }])).toBe('1 photo · added at 0:38')
    expect(photosLine([{ atMs: 38000 }, { atMs: 42000 }])).toBe('2 photos · added at 0:38 and 0:42')
    expect(photosLine([{ atMs: 1000 }, { atMs: 2000 }, { atMs: 63000 }])).toBe('3 photos · added at 0:01, 0:02 and 1:03')
  })
  test('meta line reflects how it came in (C4); voice only keeps the time', () => {
    expect(captureMeta({ said: true, notes: 2, photos: 2 })).toBe('typed + said · 2 photos')
    expect(captureMeta({ said: false, notes: 1, photos: 0 })).toBe('typed')
    expect(captureMeta({ said: true, notes: 0, photos: 1 })).toBe('said · 1 photo')
    expect(captureMeta({ said: false, notes: 0, photos: 3 })).toBe('3 photos')
    expect(captureMeta({ said: true, notes: 0, photos: 0 })).toBeNull()
    expect(captureMeta(null)).toBeNull()
    expect(captureInfo({ kind: 'text', meta_capture: { notes: 2, photos: 0 } })).toEqual({ said: false, notes: 2, photos: 0 })
    expect(captureInfo({ kind: 'memo', meta_capture: null })).toBeNull()
  })
  test("Ivy's line on Home (C4), counts adapt", () => {
    expect(gotItLine(1, 2)).toBe('Got it — one idea, two photos.')
    expect(gotItLine(1, 0)).toBe('Got it — one idea.')
    expect(gotItLine(2, 1)).toBe('Got it — two ideas, one photo.')
  })
  test('live words: settled ink, the last few words of a running recognition grey', () => {
    let w = addResult(EMPTY_WORDS, 'Okay so the Nothing launch idea', false)
    expect(split(w)).toEqual({ sure: 'Okay so the', unsure: 'Nothing launch idea' })
    w = addResult(w, 'Okay so the Nothing launch idea — see-through case', true)
    expect(split(w)).toEqual({ sure: 'Okay so the Nothing launch idea — see-through case', unsure: '' })
    w = addResult(endRecognition(w), 'the parts showing', false)
    expect(split(w)).toEqual({ sure: 'Okay so the Nothing launch idea — see-through case', unsure: 'the parts showing' })
  })
})

describe('Home', () => {
  const card = (over: Partial<CardItem>): CardItem =>
    ({ kind: 'card', id: 'c1', recordingId: 'r1', projectId: 'p', playFromMs: 31000, at: '2026-11-08T01:00:00Z', storagePath: null, ...over }) as CardItem
  test('Got it waits for the capture’s cards, then cites them', () => {
    expect(gotItSentence([card({ recordingId: 'other' })], { recordingId: 'r1', photos: 2 })).toBeNull()
    const line = gotItSentence([card({})], { recordingId: 'r1', photos: 2 })
    expect(line?.text).toBe('Got it — one idea, two photos.')
    expect(line?.cites).toEqual([{ recordingId: 'r1', ms: 31000 }])
  })
  test('the tile meta line', () => {
    expect(metaLine(card({ capture: { said: true, notes: 1, photos: 2 } }), [])).toBe('typed + said · 2 photos')
    expect(metaLine(card({ capture: { said: true, notes: 0, photos: 0 } }), [])).toBe('0:31')
    expect(metaLine(card({}), [])).toBe('0:31')
  })
})

/** A stand-in client that logs every write in order. */
function fake(fail?: string) {
  const log: string[] = []
  const rows: Record<string, unknown[]> = {}
  const from = (table: string) => ({
    upsert: async () => ({ error: null }),
    insert: async (v: unknown) => {
      log.push(`insert ${table}`)
      rows[table] = [...(rows[table] ?? []), ...(Array.isArray(v) ? v : [v])]
      return { error: fail === table ? { message: 'no' } : null }
    },
  })
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string) => {
        log.push(`upload ${bucket} ${path}`)
        return { error: null }
      },
    }),
  }
  return { client: { from, storage } as never, log, rows }
}

describe('typed-only capture creates a card through the text path', () => {
  test('a text recording with meta.text, then its notes, then processing', async () => {
    const { client, log, rows } = fake()
    const asked: string[] = []
    await submitTextCapture({
      supabase: client,
      userId: 'u1',
      recordingId: 'rec1',
      text: 'Pen-in-motion opener.',
      notes: [{ atMs: 1000, text: 'Pen-in-motion opener.' }],
      photos: [],
      recordedAt: new Date('2026-11-08T01:00:00Z'),
      projectId: null,
      requestProcessing: async (id) => {
        log.push(`process ${id}`)
        asked.push(id)
      },
    })
    expect(log).toEqual(['insert recordings', 'insert capture_notes', 'process rec1'])
    expect(rows.recordings[0]).toMatchObject({
      id: 'rec1',
      kind: 'text',
      storage_path: null,
      source: 'phone',
      meta: { text: 'Pen-in-motion opener.', capture: { notes: 1, photos: 0 } },
    })
    expect(rows.capture_notes[0]).toEqual({ capture_id: 'rec1', creator_id: 'u1', at_ms: 1000, text: 'Pen-in-motion opener.' })
  })

  test('a failed notes write stops before processing is asked for', async () => {
    const { client, log } = fake('capture_notes')
    await expect(
      submitTextCapture({
        supabase: client,
        userId: 'u1',
        recordingId: 'rec1',
        text: 'x',
        notes: [{ atMs: 0, text: 'x' }],
        photos: [],
        recordedAt: new Date(),
        projectId: null,
        requestProcessing: async () => {
          log.push('process')
        },
      })
    ).rejects.toThrow('notes: no')
    expect(log).not.toContain('process')
  })
})

describe('photos', () => {
  test('each goes to imports (original) and frames/<her id>/imports (poster); rows carry the time added', async () => {
    const { client, log, rows } = fake()
    let n = 0
    const up = await uploadPhotos(client, 'u1', [photo(38000), photo(42000)], { read: async () => new ArrayBuffer(1), id: () => `id${++n}` })
    expect(log).toEqual([
      'upload imports u1/captures/id1.jpg',
      'upload frames u1/imports/id1.jpg',
      'upload imports u1/captures/id2.jpg',
      'upload frames u1/imports/id2.jpg',
    ])
    await attachCapture(client, 'u1', 'rec1', [], up)
    expect(rows.capture_photos).toEqual([
      { capture_id: 'rec1', creator_id: 'u1', at_ms: 38000, storage_path: 'u1/captures/id1.jpg', poster_path: 'u1/imports/id1.jpg' },
      { capture_id: 'rec1', creator_id: 'u1', at_ms: 42000, storage_path: 'u1/captures/id2.jpg', poster_path: 'u1/imports/id2.jpg' },
    ])
  })
})
