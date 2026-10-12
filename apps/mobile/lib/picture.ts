// apps/mobile/lib/picture.ts
// Every idea carries a picture (Home v4, Figma 1737:2). cards.picture resolves in this order:
//   1. her own — an image she added with Add context (card_context, for this idea or both), an import's picture, or a
//      take from the Create flow (generation_runs); the newest of them;
//   2. the credited Unsplash photo Job B found for it (frame_attribution);
//   3. its reference picture (0039): the first Unsplash or Pixabay result of findReferences, never Pinterest;
//   4. the project hue, as a flat block, while a picture is being found.
// Credits are shown on tap; Unsplash's download event is sent only when she uses the picture (opens its source).
// Pure, so the order can be tested without a device.

export interface Credit {
  /** "Photo by Jane on Unsplash", "Image by jdoe on Pixabay". */
  line: string
  name: string
  url: string
  provider: 'Unsplash' | 'Pixabay'
}

export type PictureSource = 'own' | 'created' | 'unsplash' | 'reference' | 'hue'

export interface Picture {
  source: PictureSource
  /** Null only for the hue block. */
  uri: string | null
  kind: 'image' | 'video'
  credit: Credit | null
  /** Where its source page is (credit tap). */
  linkUrl: string | null
  /** Unsplash's download_location, hit once when she uses it. */
  trackUrl: string | null
}

/** An image or take that is hers. */
export interface OwnPicture {
  uri: string
  kind: 'image' | 'video'
  at: string
  /** 'context' (Add context or an import) or 'created' (the Create flow). */
  from: 'context' | 'created'
}

export interface UnsplashFrame {
  url: string
  photographer: string
  photographerUrl: string
  photoUrl: string
}

export interface ReferencePicture {
  source: 'unsplash' | 'pixabay'
  id: string
  url: string
  thumb_url: string
  link_url: string
  credit: { name: string; url: string }
  width: number
  height: number
  track_url?: string
}

export interface PictureInputs {
  own: OwnPicture[]
  unsplash: UnsplashFrame | null
  reference: ReferencePicture | null
}

const unsplashCredit = (name: string, url: string): Credit => ({ line: `Photo by ${name} on Unsplash`, name, url, provider: 'Unsplash' })

export function resolvePicture({ own, unsplash, reference }: PictureInputs): Picture {
  const mine = [...own].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))[0]
  if (mine) return { source: mine.from === 'created' ? 'created' : 'own', uri: mine.uri, kind: mine.kind, credit: null, linkUrl: null, trackUrl: null }
  if (unsplash)
    return {
      source: 'unsplash',
      uri: unsplash.url,
      kind: 'image',
      credit: unsplashCredit(unsplash.photographer, unsplash.photographerUrl),
      linkUrl: unsplash.photoUrl,
      // Job B's photo was put to use when it became the card's picture; its download event was sent then (frames.ts).
      trackUrl: null,
    }
  if (reference && (reference.source === 'unsplash' || reference.source === 'pixabay'))
    return {
      source: 'reference',
      uri: reference.url,
      kind: 'image',
      credit:
        reference.source === 'unsplash'
          ? unsplashCredit(reference.credit.name, reference.credit.url)
          : { line: `Image by ${reference.credit.name} on Pixabay`, name: reference.credit.name, url: reference.credit.url, provider: 'Pixabay' },
      linkUrl: reference.link_url,
      trackUrl: reference.source === 'unsplash' ? reference.track_url ?? null : null,
    }
  return { source: 'hue', uri: null, kind: 'image', credit: null, linkUrl: null, trackUrl: null }
}

/** How long after a card lands its hue block still says "finding a picture…" (the pipeline is still looking). */
export const FINDING_MS = 5 * 60 * 1000
export const findingPicture = (p: Picture, createdAt: string | undefined, now = Date.now()) =>
  p.source === 'hue' && !!createdAt && now - new Date(createdAt).getTime() < FINDING_MS

/** A take's still, its length: "0:03". */
export const takeLength = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
