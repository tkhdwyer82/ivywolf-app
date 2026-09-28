// /oauth/consent/[id] — she decides what an app may do (Job F2). Reached only from /oauth/authorize, which saved the
// request bound to her; Clerk (proxy.ts) makes sure it's her looking at it. The two scopes are named in the consent
// words and both start ticked if the app asked for them; she can untick either. Allow or Don't allow posts to
// /oauth/decision.

import { auth } from '@clerk/nextjs/server'
import { SCOPE_WORDS, type Scope } from '@/lib/mcp/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Connect to Ivy Wolf', robots: { index: false } }

type Row = {
  id: string
  creator_id: string
  redirect_uri: string
  requested_scopes: Scope[]
  expires_at: string
  decided_at: string | null
  oauth_clients: { client_name: string; client_uri: string | null; kind: string } | null
}

const page = { font: '16px/1.5 system-ui, -apple-system, sans-serif', color: '#1D1D1F', maxWidth: 30 * 16, margin: '0 auto', padding: '3rem 1.25rem' }
const button = { font: 'inherit', fontWeight: 600, borderRadius: 26, height: 52, padding: '0 1.5rem', border: 0, cursor: 'pointer' }

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main style={page}>
      <h1 style={{ fontSize: 24 }}>{title}</h1>
      <p>{children}</p>
    </main>
  )
}

export default async function Consent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId || !/^[0-9a-f-]{36}$/i.test(id)) return <Notice title="This link has expired">Go back to the app and connect again.</Notice>

  const { data } = await supabaseAdmin()
    .from('oauth_authorizations')
    .select('id, creator_id, redirect_uri, requested_scopes, expires_at, decided_at, oauth_clients(client_name, client_uri, kind)')
    .eq('id', id)
    .maybeSingle()
  const row = data as unknown as Row | null
  if (!row || row.creator_id !== userId || row.decided_at || new Date(row.expires_at).getTime() < Date.now() || !row.oauth_clients) {
    return <Notice title="This link has expired">Go back to the app and connect again.</Notice>
  }

  const app = row.oauth_clients.client_name
  const returnTo = (() => {
    try {
      const u = new URL(row.redirect_uri)
      return u.host || u.protocol.slice(0, -1)
    } catch {
      return row.redirect_uri
    }
  })()

  return (
    <main style={page}>
      <p style={{ fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', color: '#6E6E73', margin: 0 }}>Ivy Wolf</p>
      <h1 style={{ fontSize: 28, lineHeight: 1.2, margin: '0.5rem 0 1rem' }}>{app} wants to connect to your Ivy</h1>
      <p style={{ color: '#6E6E73' }}>
        Choose what it can do. It can&apos;t change, move or delete anything, and you can disconnect it any time in the Ivy app
        under Connect → Connect your Muse.
      </p>
      <form method="post" action="/oauth/decision">
        <input type="hidden" name="id" value={row.id} />
        <fieldset style={{ border: 0, padding: 16, margin: '1.5rem 0', background: '#F0F0F0', borderRadius: 16 }}>
          <legend style={{ position: 'absolute', left: -9999 }}>What {app} may do</legend>
          {row.requested_scopes.map((s) => (
            <label key={s} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', fontSize: 17 }}>
              <input type="checkbox" name="scope" value={s} defaultChecked style={{ width: 22, height: 22, accentColor: '#1D1D1F' }} />
              {SCOPE_WORDS[s]}
            </label>
          ))}
        </fieldset>
        <p style={{ fontSize: 13, color: '#6E6E73' }}>
          You&apos;ll go back to {returnTo}.
          {row.oauth_clients.client_uri ? ` ${app}: ${row.oauth_clients.client_uri}` : ''}
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button type="submit" name="decision" value="allow" style={{ ...button, background: '#1D1D1F', color: '#FFFFFF', flex: 1 }}>
            Allow
          </button>
          <button type="submit" name="decision" value="deny" style={{ ...button, background: '#F0F0F0', color: '#1D1D1F' }}>
            Don&apos;t allow
          </button>
        </div>
      </form>
    </main>
  )
}
