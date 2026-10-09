// packages/pipeline/references/unsplash.ts
// Unsplash references through the Job B client (../unsplash.ts): hotlinked, credited "Photo by <name> on Unsplash"
// with utm links, and its download event sent only when she uses one (trackReferenceUse), not for showing it.

import { searchPhotos, trackDownload, withUtm } from '../unsplash'
import type { Reference, ReferenceProvider } from './types'

export const unsplashReferences: ReferenceProvider = {
  source: 'unsplash',
  available: () => !!process.env.UNSPLASH_ACCESS_KEY,
  async find(query, { orientation, limit }) {
    const photos = await searchPhotos(query, { orientation: orientation === 'any' ? null : orientation, perPage: limit })
    return photos.map(
      (p): Reference => ({
        source: 'unsplash',
        id: p.id,
        thumb_url: p.urls.small,
        full_url: p.urls.regular,
        link_url: withUtm(p.links.html),
        credit: { name: `Photo by ${p.user.name} on Unsplash`, url: withUtm(p.user.links.html) },
        width: p.width,
        height: p.height,
        track_url: p.links.download_location,
      })
    )
  },
}

/** Unsplash's download event for a reference she used. Other sources need nothing. Never throws. */
export async function trackReferenceUse(ref: Reference): Promise<void> {
  if (ref.source === 'unsplash' && ref.track_url) await trackDownload(ref.track_url)
}
