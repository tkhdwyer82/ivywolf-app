// packages/pipeline/ingest.ts
// Local audio file → recordings bucket + recordings row. The file is uploaded byte-for-byte (never transcoded).
//
//   npx tsx --env-file=../../.env.local ingest.ts <creator_id> <file> [source] [--process]

import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { RecordingSource } from '@ivywolf/schema'
import { uploadBuffer } from './storage'
import { processRecording } from './process'
import { claimRecording, markFailed } from './graph'

const CONTENT_TYPES: Record<string, string> = {
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
}

export async function ingestFile(args: {
  creatorId: string
  file: string
  source: RecordingSource
}): Promise<{ recordingId: string; storagePath: string }> {
  const ext = path.extname(args.file).toLowerCase()
  const contentType = CONTENT_TYPES[ext]
  if (!contentType) throw new Error(`unsupported audio type: ${ext}`)

  const id = randomUUID()
  const storagePath = `${args.creatorId}/${id}${ext}`
  await uploadBuffer({ bucket: 'recordings', buffer: readFileSync(args.file), path: storagePath, contentType })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { error } = await supabase.from('recordings').insert({
    id,
    creator_id: args.creatorId,
    source: args.source,
    storage_path: storagePath,
    recorded_at: statSync(args.file).birthtime.toISOString(),
    trigger: 'import',
    meta: { original_filename: path.basename(args.file) },
  })
  if (error) throw new Error(`recordings insert failed: ${error.message}`)
  return { recordingId: id, storagePath }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [creatorId, file, source = 'phone'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (!creatorId || !file) {
    console.error('usage: ingest.ts <creator_id> <file> [source] [--process]')
    process.exit(1)
  }
  const { recordingId, storagePath } = await ingestFile({
    creatorId,
    file,
    source: RecordingSource.parse(source),
  })
  console.log(JSON.stringify({ recordingId, storagePath }))
  if (process.argv.includes('--process')) {
    if (!(await claimRecording(recordingId))) throw new Error(`${recordingId} is not queued`)
    try {
      const result = await processRecording(recordingId)
      console.log(JSON.stringify(result.junk ? { junk: result.junk } : result.out, null, 2))
    } catch (err) {
      await markFailed(recordingId, err instanceof Error ? err.message : String(err))
      throw err
    }
  }
}
