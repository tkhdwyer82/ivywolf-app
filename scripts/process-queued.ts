// scripts/process-queued.ts
// Run the pipeline on recordings left 'queued' — the app saved the row but its call to
// /api/recordings/[id]/process never arrived (e.g. next dev wasn't running). Same claim + process as the route.
//
//   npx tsx --env-file=.env.local scripts/process-queued.ts <recording id> [more ids…]

import { claimRecording, markFailed, processRecording } from '../packages/pipeline/process'

async function main() {
  const ids = process.argv.slice(2)
  if (!ids.length) {
    console.error('usage: scripts/process-queued.ts <recording id> [more ids…]')
    process.exit(1)
  }
  for (const id of ids) {
    if (!(await claimRecording(id))) {
      console.log(`${id}: not queued (already claimed) — skipped`)
      continue
    }
    try {
      await processRecording(id)
      console.log(`${id}: processed`)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await markFailed(id, message)
      console.log(`${id}: failed — ${message}`)
    }
  }
}

main()
