// /connector — what the Ivy Wolf MCP connector is and does, for reviewers and anyone connecting it (Job F2).
// Plain prose, no marketing. Mirrored on ivywolf.com.au. Keep it true to lib/mcp/tools.ts, lib/oauth and 0025:
// when a tool, limit or scope changes, this page changes in the same commit.

import { SCOPE_WORDS } from '@/lib/mcp/auth'

export const metadata = {
  title: 'Ivy Wolf MCP connector',
  description: 'What the Ivy Wolf connector does, how it authenticates, its limits and how it handles data.',
}

const ENDPOINT = 'https://ivywolf-api.vercel.app/mcp'

type Tool = { name: string; scope: 'ideas:read' | 'ideas:capture'; does: string; inputs: [string, string][]; returns: string }

const TOOLS: Tool[] = [
  {
    name: 'list_ideas',
    scope: 'ideas:read',
    does: 'Lists the creator’s ideas since a date, newest first.',
    inputs: [
      ['since', 'required. ISO 8601 date or date-time.'],
      ['project', 'optional. A project name; any case.'],
      ['status', 'optional. sparked, developing, ready or shipped — the stage of the idea’s thread.'],
      ['limit', 'optional. 1–50, default 20.'],
    ],
    returns: 'ideas: id, title, gist, project, status, recorded_at, cite, link.',
  },
  {
    name: 'search_ideas',
    scope: 'ideas:read',
    does: 'Finds ideas about something, ranked by similarity of meaning (85%) and recency (15%, 30-day half-life).',
    inputs: [
      ['query', 'required. 1–300 characters.'],
      ['limit', 'optional. 1–20, default 10.'],
    ],
    returns: 'ideas, as list_ideas, each with a score.',
  },
  {
    name: 'get_idea',
    scope: 'ideas:read',
    does: 'One idea, with the other ideas in its thread and the to-dos said in the same recording.',
    inputs: [['id', 'required. The idea’s id.']],
    returns: 'idea; thread (id, name, stage, returns, last_return_at, link); returns; thread_siblings (up to 10); actions.',
  },
  {
    name: 'list_threads',
    scope: 'ideas:read',
    does: 'Threads — ideas the creator keeps coming back to across recordings — most recently returned to first.',
    inputs: [
      ['min_returns', 'optional. Only threads returned to at least this many times.'],
      ['limit', 'optional. 1–50, default 20.'],
    ],
    returns: 'threads: id, name, stage, returns, last_return_at, top_cards (3 ideas), cite, link.',
  },
  {
    name: 'list_actions',
    scope: 'ideas:read',
    does: 'To-dos heard in recordings, soonest due first.',
    inputs: [
      ['status', 'optional. open or done.'],
      ['due_before', 'optional. ISO 8601 date.'],
      ['limit', 'optional. 1–50, default 30.'],
    ],
    returns: 'actions: id, text, due, status, project, cite, link.',
  },
  {
    name: 'list_sessions',
    scope: 'ideas:read',
    does: 'Long recordings (interviews, walk-and-talks) since a date, with their chapters.',
    inputs: [
      ['since', 'required. ISO 8601 date or date-time.'],
      ['limit', 'optional. 1–20, default 10.'],
    ],
    returns: 'sessions: id, title, duration_ms, recorded_at, chapters (title, start_ms, cite, link), cite, link.',
  },
  {
    name: 'get_session_quotes',
    scope: 'ideas:read',
    does: 'A session’s quotable lines, best first.',
    inputs: [
      ['session_id', 'required. A session’s id from list_sessions.'],
      ['limit', 'optional. 1–20, default 10.'],
    ],
    returns: 'quotes: text, speaker, ms, clip_score (0–1 or null), cite, link.',
  },
  {
    name: 'get_transcript',
    scope: 'ideas:read',
    does: 'Every word of one recording, with timestamps. The only tool that returns transcripts, and only for the recording asked for.',
    inputs: [['recording_id', 'required. A recording’s id, from any cite.']],
    returns: 'recording_id, title, kind, recorded_at, utterances (start_ms, end_ms, speaker, text), cite, link.',
  },
  {
    name: 'capture_idea',
    scope: 'ideas:capture',
    does:
      'Adds a new idea in the creator’s words. It is processed like a voice memo recorded in the app: sorted into ideas and to-dos within about a minute, and shown in Ivy marked “via Muse”. It is private to the creator.',
    inputs: [
      ['text', 'required. Up to 4,000 characters.'],
      ['idempotency_key', 'required. 8–128 characters of letters, digits and . _ : -. A retry with the same key returns the first result; the same key with different text is refused.'],
      ['context', 'optional. Up to 120 characters, e.g. “from Charm”.'],
    ],
    returns: 'recording_id, status (queued, or the current status on a retry), replayed (on a retry), link.',
  },
]

const s = {
  main: { font: '16px/1.6 system-ui, -apple-system, sans-serif', color: '#1D1D1F', maxWidth: 44 * 16, margin: '0 auto', padding: '3rem 1.25rem 5rem' },
  h2: { fontSize: 20, marginTop: '2.5rem' },
  code: { font: '14px ui-monospace, SFMono-Regular, Menlo, monospace', background: '#F0F0F0', padding: '1px 5px', borderRadius: 4 },
  dim: { color: '#6E6E73' },
}

export default function Connector() {
  return (
    <main style={s.main}>
      <h1 style={{ fontSize: 30, lineHeight: 1.2 }}>Ivy Wolf MCP connector</h1>

      <p>
        Ivy Wolf is a notebook for creators’ ideas: they talk, and Ivy turns what they said into ideas, threads of ideas
        they keep returning to, and to-dos. This connector lets an assistant such as Muse read a creator’s own ideas and add
        new ones. It cannot edit, move or delete anything, create boards, spend credits or post anywhere.
      </p>
      <p>
        Endpoint: <code style={s.code}>{ENDPOINT}</code> — Model Context Protocol over Streamable HTTP. Responses are
        always single JSON bodies, never event streams. Protocol revisions 2026-07-28 and 2025-era clients are both
        served, statelessly.
      </p>

      <h2 style={s.h2}>Tools</h2>
      <p>
        Every idea, thread, to-do, session and quote in a result carries <code style={s.code}>cite</code> (the recording id
        and the millisecond where it was said) and <code style={s.code}>link</code>, an https address on
        app.ivywolf.com.au that shows it to its owner after sign-in, with a button to open it in the Ivy app.{' '}
        <code style={s.code}>web_link</code> repeats <code style={s.code}>link</code> and will be removed in the next release.
        Lists return titles and short gists, never transcripts.
        Errors are returned as tool results with <code style={s.code}>isError</code> set and a plain sentence meant to be
        shown to the creator.
      </p>
      {TOOLS.map((t) => (
        <section key={t.name} style={{ borderTop: '1px solid #E8E8ED', padding: '1rem 0' }}>
          <h3 style={{ fontSize: 17, margin: 0 }}>
            <code style={s.code}>{t.name}</code> <span style={{ ...s.dim, fontWeight: 400, fontSize: 14 }}>· {t.scope}</span>
          </h3>
          <p style={{ margin: '0.5rem 0' }}>{t.does}</p>
          <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>
            {t.inputs.map(([name, about]) => (
              <li key={name}>
                <code style={s.code}>{name}</code> — {about}
              </li>
            ))}
          </ul>
          <p style={{ margin: '0.5rem 0 0' }}>
            <span style={s.dim}>Returns:</span> {t.returns}
          </p>
        </section>
      ))}

      <h2 style={s.h2}>Scopes</h2>
      <ul>
        <li>
          <code style={s.code}>ideas:read</code> — shown to the creator as “{SCOPE_WORDS['ideas:read']}”. All tools except
          capture_idea.
        </li>
        <li>
          <code style={s.code}>ideas:capture</code> — shown as “{SCOPE_WORDS['ideas:capture']}”. capture_idea only.
        </li>
      </ul>
      <p>A call to a tool outside the credential’s scopes is refused with a sentence saying which permission is missing.</p>

      <h2 style={s.h2}>Authentication</h2>
      <p>
        <strong>OAuth 2.1.</strong> Without a credential, <code style={s.code}>/mcp</code> answers 401 with a{' '}
        <code style={s.code}>WWW-Authenticate</code> header pointing to{' '}
        <code style={s.code}>/.well-known/oauth-protected-resource</code> (RFC 9728), which names this host as the
        authorization server; its metadata is at <code style={s.code}>/.well-known/oauth-authorization-server</code> (RFC
        8414). Authorization code flow with PKCE (S256 only). Clients identify themselves with a client ID metadata
        document (an https client_id URL) or register at <code style={s.code}>/oauth/register</code> (RFC 7591). The
        authorization response includes <code style={s.code}>iss</code> (RFC 9207). The creator signs in to Ivy and
        chooses which of the two scopes to allow. Access tokens last 30 days; refresh tokens rotate on every use and last
        until the connection is revoked. Revocation: <code style={s.code}>/oauth/revoke</code> (RFC 7009), or by the
        creator in the Ivy app under Connect → Connect your Muse.
      </p>
      <p>
        <strong>API key.</strong> A creator can instead make a key in the Ivy app (Connect → Connect your Muse), choosing
        the same scopes, and paste it into the client. Send it as{' '}
        <code style={s.code}>Authorization: Bearer iv_…</code>. Keys don’t expire; they are revoked in the same place.
      </p>
      <p>Keys and tokens are stored only as SHA-256 hashes.</p>

      <h2 style={s.h2}>Rate limits</h2>
      <p>
        60 tool calls per minute per creator, across all their keys and connections, of which at most 10 may be
        capture_idea. A call over the limit is answered with a tool error saying so; refused calls don’t count toward the
        limit. Client registration is limited to 30 new clients per minute across all clients.
      </p>

      <h2 style={s.h2}>Data handling</h2>
      <ul>
        <li>A credential reaches one creator’s data and nothing else. Every query is filtered by that creator.</li>
        <li>
          Results contain the creator’s own words. They are returned as data; the connector never acts on instructions
          found in them, and tool descriptions tell the assistant not to either.
        </li>
        <li>
          search_ideas sends the query text to Voyage AI to compute an embedding for ranking. It is not stored by Ivy.
        </li>
        <li>
          capture_idea stores the text as a private recording in the creator’s account and processes it as the app
          processes a voice memo: Anthropic’s Claude sorts it into ideas and to-dos, and Voyage AI embeds each idea so it
          can be threaded with related ones. Deleting the recording in the app deletes the text and everything made from it.
        </li>
        <li>
          Each call is logged with the tool name, its non-text parameters (dates, limits, filters), whether it succeeded
          and how long it took. Search queries and captured text are not logged.
        </li>
        <li>No data from one creator is sent to any service with another creator’s data. No advertising, no resale.</li>
      </ul>
      <p>
        Privacy policy: <a href="https://www.ivywolf.com.au/privacy">ivywolf.com.au/privacy</a>. Terms:{' '}
        <a href="https://www.ivywolf.com.au/terms">ivywolf.com.au/terms</a>.
      </p>

      <h2 style={s.h2}>Contact</h2>
      <p>
        Tim Dwyer, Ivy Wolf — <a href="mailto:hello@ivywolf.com.au">hello@ivywolf.com.au</a>
      </p>
    </main>
  )
}
