/// <reference types="jest" />
// Job G §3.5: the "via …" badge is for a pinned suggestion only, and says when.
import { sourceBadge, type Idea } from '@/lib/idea'

const now = new Date('2026-09-29T12:00:00')
const idea = (source: Idea['source'], createdAt: string) => ({ source, createdAt }) as Idea

describe('sourceBadge', () => {
  it('is none for her own ideas', () => {
    for (const s of ['voice', 'import', 'muse'] as const) expect(sourceBadge(idea(s, now.toISOString()), now)).toBeNull()
  })
  it('names the source and when she pinned it', () => {
    expect(sourceBadge(idea('youtube', '2026-09-29T11:30:00'), now)).toBe('via YouTube · pinned just now')
    expect(sourceBadge(idea('tiktok', '2026-09-29T08:00:00'), now)).toBe('via TikTok · pinned today')
    expect(sourceBadge(idea('pinterest', '2026-09-22T08:00:00'), now)).toBe('via Pinterest · pinned Tue')
  })
})
