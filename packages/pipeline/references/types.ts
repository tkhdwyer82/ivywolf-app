// packages/pipeline/references/types.ts
// A reference (Job H.0c): a free visual shown beside a More ideas suggestion to steer. Never a frame, a take or a
// generation input — nothing here feeds generate(), style_signals or storage.

export type ReferenceSource = 'unsplash' | 'pixabay' | 'pinterest'

export interface Reference {
  source: ReferenceSource
  /** The provider's own id for the image or pin. */
  id: string
  /** Shown in the grid. Pinterest: its uncropped 600px-wide image, never a square or 4:3 crop. */
  thumb_url: string
  full_url: string
  /** Where tapping goes: the photo page (Unsplash, with utm), the Pixabay page, the pin. */
  link_url: string
  /** The credit line as shown, and where it links: "Photo by <name> on Unsplash", "via Pixabay", the pin's board. */
  credit: { name: string; url: string }
  width: number
  height: number
  /**
   * Unsplash only: its download_location. Hit once, through trackReferenceUse(), when she uses a reference (opens it
   * full), never just for showing it (Unsplash API guidelines).
   */
  track_url?: string
}

/** What findReferences needs of a card. */
export interface ReferenceCard {
  title: string
  gist: string | null
  /** The classifier's 2–6 plain words for a photo search (shape_v1), when it gave some. */
  visual_query?: string | null
  /** The card's form (0033): picks the photo orientation. */
  shape?: 'photo' | 'quote' | 'diagram' | 'board' | 'text' | null
  /** Where the card came from: a Pinterest card is never a reference query (it isn't hers to search with). */
  source?: string | null
}

export type Orientation = 'portrait' | 'landscape' | 'any'

/** One provider. Throws on any failure; findReferences skips a source that throws. */
export interface ReferenceProvider {
  source: ReferenceSource
  /** Ready to call (its keys are set). A source that isn't is skipped without a call. */
  available(): boolean
  find(query: string, opts: { orientation: Orientation; limit: number }): Promise<Reference[]>
}
