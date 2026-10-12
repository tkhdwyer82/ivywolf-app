// scripts/backfill-reference-pictures.ts
// Job B.2 (0039): a reference picture for every card that has no picture yet — the first Unsplash or Pixabay result of
// findReferences(card, {limit: 1}), stored in cards.reference_picture (packages/pipeline/references/picture.ts). Never
// Pinterest. Cards with an Unsplash photo of their own are left alone. Run after 0039 is applied.
// Without the keys locally, POST /api/admin/reference-pictures in production runs the same function for the signed-in
// (admin) creator, with the keys that stay in Vercel.
//
//   npx tsx --env-file=.env.local scripts/backfill-reference-pictures.ts              # the test account
//   CREATOR=user_… npx tsx --env-file=.env.local scripts/backfill-reference-pictures.ts

import { backfillReferencePictures } from '../packages/pipeline/references/picture'

const CREATOR = process.env.CREATOR ?? 'user_3JfYR4D8eJVCL3yieXStYYoqwaH' // the simulator / test account

backfillReferencePictures(CREATOR)
  .then(({ stored, missed }) => {
    console.log(`${stored} reference picture(s) stored for ${CREATOR}`)
    for (const t of missed) console.log(`  nothing found: ${t}`)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
