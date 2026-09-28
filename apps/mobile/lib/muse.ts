// apps/mobile/lib/muse.ts
// Connect your Muse (Job F §4): her keys for the Muse connector. Made, listed and revoked through apps/web
// (app/api/api-keys) — the key is minted server side so the raw value never exists anywhere but the response and her
// clipboard; the table (creator_api_keys, 0024) keeps only its hash.

const API_URL = process.env.EXPO_PUBLIC_API_URL!

export type MuseScope = 'ideas:read' | 'ideas:capture'

/** The consent words (Job F §4): what each scope lets Muse do, in plain words. */
export const SCOPE_WORDS: Record<MuseScope, string> = {
  'ideas:read': 'Let Muse read your ideas',
  'ideas:capture': 'Let Muse add ideas to Ivy',
}

export interface MuseKey {
  id: string
  label: string
  scopes: MuseScope[]
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `${res.status}`)
  return body as T
}

export const listMuseKeys = (token: string) => call<{ endpoint: string; keys: MuseKey[] }>(token, '/api/api-keys')

/** The raw key comes back exactly once, here. */
export const makeMuseKey = (token: string, scopes: MuseScope[]) =>
  call<MuseKey & { key: string; endpoint: string }>(token, '/api/api-keys', {
    method: 'POST',
    body: JSON.stringify({ label: 'Muse', scopes }),
  })

export const revokeMuseKey = (token: string, id: string) => call<{ ok: true }>(token, `/api/api-keys/${id}`, { method: 'DELETE' })
