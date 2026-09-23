// scripts/upload-connection.ts
// Upload a connection's images and point its row at them.
//
//   npx tsx --env-file=.env.local scripts/upload-connection.ts <slug> <tile> <hero> [examples…]
//
// Files land in the public `connections` bucket at <slug>/tile.<ext>, <slug>/hero.<ext>, <slug>/example-<n>.<ext>
// (overwriting), and connections.tile_url / hero_url / example_urls are set to their public URLs. Service role.

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
}

const [slug, tile, hero, ...examples] = process.argv.slice(2)
if (!slug || !tile || !hero) {
  console.error('usage: scripts/upload-connection.ts <slug> <tile> <hero> [examples…]')
  process.exit(1)
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

async function upload(file: string, name: string): Promise<string> {
  const ext = extname(file).toLowerCase()
  const contentType = TYPES[ext]
  if (!contentType) throw new Error(`${file}: unsupported type ${ext || '(none)'}`)
  const path = `${slug}/${name}${ext}`
  const { error } = await supabase.storage
    .from('connections')
    .upload(path, await readFile(file), { contentType, upsert: true })
  if (error) throw new Error(`${path}: ${error.message}`)
  // Cache-bust: the path is reused when an image is replaced.
  return `${supabase.storage.from('connections').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
}

async function main() {
  const { data: row, error: rowError } = await supabase.from('connections').select('slug').eq('slug', slug).maybeSingle()
  if (rowError) throw new Error(`connections: ${rowError.message}`)
  if (!row) throw new Error(`no connection with slug '${slug}'`)

  const tile_url = await upload(tile, 'tile')
  const hero_url = await upload(hero, 'hero')
  const example_urls: string[] = []
  for (const [i, file] of examples.entries()) example_urls.push(await upload(file, `example-${i + 1}`))

  const { error } = await supabase.from('connections').update({ tile_url, hero_url, example_urls }).eq('slug', slug)
  if (error) throw new Error(`connections update: ${error.message}`)
  console.log(JSON.stringify({ slug, tile_url, hero_url, example_urls }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
