// scripts/test-pinterest.ts
// Pinterest developer terms, as guarded in code (packages/schema/pinterest.ts). No network:
//   npx tsx scripts/test-pinterest.ts

import { isPinterestSource, isPinterestUrl, refusePinterest } from '../packages/schema/pinterest'

let failed = 0
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`)
  if (!ok) failed++
}
const throws = (f: () => void) => {
  try {
    f()
    return false
  } catch {
    return true
  }
}

check('a pin page is Pinterest', isPinterestUrl('https://www.pinterest.com/pin/123/'))
check('a regional Pinterest domain is Pinterest', isPinterestUrl('https://au.pinterest.com/pin/123/') && isPinterestUrl('https://pinterest.co.uk/x'))
check('a pin image host is Pinterest', isPinterestUrl('https://i.pinimg.com/736x/ab/cd/ef.jpg'))
check('a pin.it short link is Pinterest', isPinterestUrl('https://pin.it/abc'))
check('Unsplash is not Pinterest', !isPinterestUrl('https://images.unsplash.com/photo-1'))
check('a look-alike host is not Pinterest', !isPinterestUrl('https://notpinterest.com.example.org/x') && !isPinterestUrl('https://pinimg.com.evil.example/x'))
check('nonsense is not a URL, not Pinterest', !isPinterestUrl('not a url') && !isPinterestUrl(null))
check('source pinterest is Pinterest', isPinterestSource('pinterest') && !isPinterestSource('youtube'))
check('refuses a Pinterest source', throws(() => refusePinterest('x', 'pinterest')))
check('refuses a pin image among inputs', throws(() => refusePinterest('x', 'voice', ['https://i.pinimg.com/a.jpg'])))
check('lets other inputs through', !throws(() => refusePinterest('x', 'voice', ['https://images.unsplash.com/p', null])))

if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('all passed')
