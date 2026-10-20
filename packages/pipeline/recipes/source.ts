// packages/pipeline/recipes/source.ts
// What we can read of a reel, without scraping or downloading it (Job B.10): the platform's public oEmbed (title and
// author), YouTube's Data API snippet (description) when YOUTUBE_API_KEY is set, and whatever text she shared or
// pasted with the link. Instagram's oEmbed needs a Meta app token (INSTAGRAM_OEMBED_TOKEN); without it, only her text.
// YouTube captions for someone else's video can't be read through the Data API (captions.download is owner-only), so
// they aren't. Nothing here is stored: the caller extracts steps and discards the text.

import type { ReelLink } from '@ivywolf/schema'

export interface SourceText {
  /** Everything we read, joined — what the extraction prompt sees. */
  text: string
  /** The creator's handle when the link didn't carry it (oEmbed's author_name / author_url). */
  handle: string | null
  /** The post's title, for a fallback idea card. */
  title: string | null
}

const TIMEOUT_MS = 5000
const MAX_CHARS = 8000

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' })
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
/** "https://www.tiktok.com/@maya" → "maya"; "https://www.youtube.com/@maya" → "maya". */
const handleFromAuthorUrl = (u: string | null) => u?.match(/\/@([\w.-]+)/)?.[1] ?? null

function youtubeId(link: ReelLink): string | null {
  const u = new URL(link.url)
  if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null
  return u.pathname.split('/').filter(Boolean)[1] ?? null
}

export async function readSource(link: ReelLink, sharedText: string | null): Promise<SourceText> {
  const parts: string[] = []
  let handle = link.handle
  let title: string | null = null

  if (link.platform === 'tiktok') {
    const o = await getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(link.url)}`)
    title = str(o?.title)
    handle ??= str(o?.author_unique_id) ?? handleFromAuthorUrl(str(o?.author_url))
    if (title) parts.push(title)
  } else if (link.platform === 'youtube') {
    const o = await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(link.url)}`)
    title = str(o?.title)
    handle ??= handleFromAuthorUrl(str(o?.author_url)) ?? str(o?.author_name)
    if (title) parts.push(title)
    const id = youtubeId(link)
    const key = process.env.YOUTUBE_API_KEY
    if (id && key) {
      const v = await getJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(id)}&key=${key}`)
      const snippet = (v?.items as { snippet?: { description?: string } }[] | undefined)?.[0]?.snippet
      const description = str(snippet?.description)
      if (description) parts.push(description)
    }
  } else if (link.platform === 'instagram') {
    const token = process.env.INSTAGRAM_OEMBED_TOKEN
    if (token) {
      const o = await getJson(`https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(link.url)}&fields=title,author_name&access_token=${token}`)
      title = str(o?.title)
      handle ??= str(o?.author_name)
      if (title) parts.push(title)
    }
  }

  const shared = str(sharedText)
  if (shared) parts.push(shared)
  return { text: parts.join('\n\n').slice(0, MAX_CHARS), handle: handle?.replace(/^@/, '') ?? null, title }
}
