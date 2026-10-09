// apps/mobile/lib/pinterest.ts
// The Pinterest connection from the app (Job H.0c), through apps/web (app/api/pinterest). Connecting opens Pinterest's
// consent page in an auth session that returns to ivywolf://pinterest; the token is kept server side in Vault, never
// on the phone. Pinterest terms: packages/schema/pinterest.ts.

import * as WebBrowser from 'expo-web-browser'

const API_URL = process.env.EXPO_PUBLIC_API_URL!
export const RETURN_URL = 'ivywolf://pinterest'

export interface PinterestStatus {
  /** False until the app secret is set on the server (Pinterest trial access pending): "coming soon". */
  available: boolean
  connected: boolean
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } })
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T }
}

export async function pinterestStatus(token: string): Promise<PinterestStatus> {
  const { status, body } = await call<PinterestStatus>(token, '/api/pinterest')
  if (status !== 200) throw new Error('Couldn’t check Pinterest')
  return body
}

/** Open Pinterest's consent page; resolves to how it ended. */
export async function connectPinterest(token: string): Promise<'connected' | 'cancelled' | 'unavailable' | 'error'> {
  const { status, body } = await call<{ url?: string }>(token, '/api/pinterest/start')
  if (status === 503) return 'unavailable'
  if (status !== 200 || !body.url) return 'error'
  const result = await WebBrowser.openAuthSessionAsync(body.url, RETURN_URL)
  if (result.type !== 'success') return 'cancelled'
  const outcome = new URL(result.url).searchParams.get('status')
  return outcome === 'connected' ? 'connected' : outcome === 'cancelled' ? 'cancelled' : 'error'
}

/** Disconnect: the server deletes her token and the connection row together. */
export async function disconnectPinterest(token: string): Promise<void> {
  const { status } = await call(token, '/api/pinterest', { method: 'DELETE' })
  if (status !== 200) throw new Error('Couldn’t disconnect Pinterest')
}
