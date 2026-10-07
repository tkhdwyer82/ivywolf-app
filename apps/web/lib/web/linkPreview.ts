// apps/web/lib/web/linkPreview.ts
// Add context → Link: fetch a page she named and read its title and thumbnail (app/api/context/link). Guarded,
// because the server fetches a URL she typed: http(s) only, ports 80/443, no private, loopback or link-local
// addresses (checked on every redirect, at most three), five seconds, the first 512 KB read.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_BYTES = 512 * 1024
const TIMEOUT_MS = 5000
const MAX_REDIRECTS = 3

export async function fetchHtml(start: URL): Promise<string | null> {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url)
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'IvyWolfLinkPreview/1.0', Accept: 'text/html' },
    })
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location')
      if (!next) return null
      url = new URL(next, url)
      continue
    }
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html') || !res.body) return null
    return readCapped(res.body)
  }
  return null
}

async function readCapped(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let n = 0
  while (n < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    n += value.byteLength
  }
  reader.cancel().catch(() => {})
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES))
}

/** Throws unless the URL is http(s) on a normal port and every address it resolves to is public. */
export async function assertPublic(url: URL) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('scheme')
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('port')
  if (url.username || url.password) throw new Error('credentials')
  const name = url.hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(name) ? [{ address: name }] : await lookup(name, { all: true, verbatim: true })
  if (addrs.length === 0 || addrs.some((a) => isPrivate(a.address))) throw new Error('private address')
}

export function isPrivate(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    )
  }
  const v = ip.toLowerCase()
  if (v.startsWith('::ffff:')) return isPrivate(v.slice(7))
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff')
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

function meta(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const name = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase()
    if (name !== key) continue
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]
    if (content) return decode(content)
  }
  return null
}

/** og:title, else <title>; og:image (or twitter:image), made absolute and https/http only. */
export function preview(html: string, base: URL): { title: string | null; thumbnail_url: string | null } {
  const title = meta(html, 'og:title') ?? (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ? decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)![1]) : null)
  const image = meta(html, 'og:image') ?? meta(html, 'twitter:image')
  let thumbnail_url: string | null = null
  if (image) {
    try {
      const u = new URL(image, base)
      if (u.protocol === 'https:' || u.protocol === 'http:') thumbnail_url = u.toString()
    } catch {}
  }
  return { title: title ? title.slice(0, 200) : null, thumbnail_url }
}
