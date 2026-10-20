// Job B.10: "Paste a reel link" takes every way Instagram, TikTok and YouTube share a reel, with the query dropped.
// The app's check (PasteReelSheet) and the server's (POST /api/recipes/extract) are the same parseReelLink.
import { parseReelLink } from '@ivywolf/schema'

describe('parseReelLink', () => {
  it.each([
    ['https://www.instagram.com/p/DPx1abc/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==', 'instagram', null, 'https://www.instagram.com/p/DPx1abc/'],
    ['https://www.instagram.com/reel/DPx1abc/?igsh=abc', 'instagram', null, 'https://www.instagram.com/reel/DPx1abc/'],
    ['https://instagram.com/reels/DPx1abc?exln=1', 'instagram', null, 'https://www.instagram.com/reels/DPx1abc/'],
    ['https://www.instagram.com/maya.makes/reel/DPx1abc/', 'instagram', 'maya.makes', 'https://www.instagram.com/maya.makes/reel/DPx1abc/'],
    ['https://www.tiktok.com/@maya/video/7420000000000000000?is_from_webapp=1&sender_device=pc', 'tiktok', 'maya', 'https://www.tiktok.com/@maya/video/7420000000000000000'],
    ['https://vm.tiktok.com/ZMh1AbCdE/', 'tiktok', null, 'https://vm.tiktok.com/ZMh1AbCdE/'],
    ['https://www.tiktok.com/t/ZTRx1AbCd/?exln=2', 'tiktok', null, 'https://www.tiktok.com/t/ZTRx1AbCd/'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc123', 'youtube', null, 'https://youtu.be/dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share', 'youtube', null, 'https://www.youtube.com/shorts/dQw4w9WgXcQ'],
    ['https://m.youtube.com/shorts/dQw4w9WgXcQ', 'youtube', null, 'https://www.youtube.com/shorts/dQw4w9WgXcQ'],
  ])('%s', (raw, platform, handle, url) => {
    expect(parseReelLink(raw)).toEqual({ platform, handle, url })
  })

  it.each([
    'https://www.instagram.com/maya.makes/',
    'https://www.tiktok.com/@maya',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://example.com/reel/abc',
    'not a link',
  ])('rejects %s', (raw) => {
    expect(parseReelLink(raw)).toBeNull()
  })
})
