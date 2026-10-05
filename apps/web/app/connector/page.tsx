// /connector — what the Ivy Wolf MCP connector is and does, for reviewers and anyone connecting it (Job F2).
// Plain prose, no marketing. Mirrored on ivywolf.com.au. Keep it true to lib/mcp/tools.ts, lib/oauth and 0025:
// when a tool, limit or scope changes, this page changes in the same commit.

import { SCOPE_WORDS } from '@/lib/mcp/auth'

export const metadata = {
  title: 'Ivy Wolf MCP connector',
  description: 'What the Ivy Wolf connector does, how it authenticates, its limits and how it handles data.',
}

const ENDPOINT = 'https://ivywolf-api.vercel.app/mcp'

// Classification and side effects as Muse's connector guidelines ask for them (§5.4, §5.6). Error sentences are the
// ones lib/mcp/tools.ts, handlers.ts and capture.ts return, word for word.
type Tool = {
  name: string
  scope: 'ideas:read' | 'ideas:capture'
  classification: 'Read' | 'Write · not sensitive'
  does: string
  sideEffects: string
  inputs: [string, string][]
  returns: string
  errors: string[]
  rateLimit: string
}

const READ_EFFECTS = 'None. Reads only; nothing in Ivy changes. The call is logged as described under Data handling.'
const READ_LIMIT = 'Counts toward 60 calls a minute per creator.'
const DATE_ERROR = 'Use an ISO date or date-time, like 2026-09-21 or 2026-09-21T09:00:00+10:00.'

const TOOLS: Tool[] = [
  {
    name: 'list_ideas',
    scope: 'ideas:read',
    classification: 'Read',
    does: 'Lists the creator’s ideas since a date, newest first.',
    sideEffects: READ_EFFECTS,
    inputs: [
      ['since', 'optional. ISO 8601 date or date-time. Default: the last 30 days.'],
      ['project', 'optional. A project name, any case, up to 120 characters. Default: every project.'],
      ['status', 'optional. sparked, developing, ready or shipped — the stage of the idea’s thread. Default: any stage.'],
      ['limit', 'optional. 1–50. Default 20.'],
    ],
    returns: 'ideas: id, title, gist, project, status, recorded_at, cite, link.',
    errors: [DATE_ERROR, 'You don’t have a project called “…”. Your projects are: …'],
    rateLimit: READ_LIMIT,
  },
  {
    name: 'search_ideas',
    scope: 'ideas:read',
    classification: 'Read',
    does: 'Finds ideas about something, ranked by similarity of meaning (85%) and recency (15%, 30-day half-life).',
    sideEffects: READ_EFFECTS + ' The query text is sent to Voyage AI to rank results and is not stored.',
    inputs: [
      ['query', 'required. 1–300 characters.'],
      ['limit', 'optional. 1–20. Default 10.'],
    ],
    returns: 'ideas, as list_ideas, each with a score (0–1).',
    errors: [],
    rateLimit: READ_LIMIT,
  },
  {
    name: 'get_idea',
    scope: 'ideas:read',
    classification: 'Read',
    does: 'One idea, with the other ideas in its thread and the to-dos said in the same recording.',
    sideEffects: READ_EFFECTS,
    inputs: [['id', 'required. The idea’s id, from list_ideas, search_ideas or list_threads. No default.']],
    returns:
      'idea (as list_ideas); thread (id, name, stage, returns, last_return_at, link) or null; returns; thread_siblings (up to 10 ideas); actions (as list_actions).',
    errors: ['That doesn’t look like an Ivy idea id.', 'I couldn’t find that idea in your Ivy. It may have been deleted.'],
    rateLimit: READ_LIMIT,
  },
  {
    name: 'list_threads',
    scope: 'ideas:read',
    classification: 'Read',
    does: 'Threads — ideas the creator keeps coming back to across recordings — most recently returned to first.',
    sideEffects: READ_EFFECTS,
    inputs: [
      ['min_returns', 'optional. 0 or more: only threads returned to at least this many times. Default: all threads.'],
      ['limit', 'optional. 1–50. Default 20.'],
    ],
    returns: 'threads: id, name, stage, returns, last_return_at, top_cards (up to 3 ideas), cite, link.',
    errors: [],
    rateLimit: READ_LIMIT,
  },
  {
    name: 'list_actions',
    scope: 'ideas:read',
    classification: 'Read',
    does: 'To-dos heard in recordings, soonest due first; undated to-dos last.',
    sideEffects: READ_EFFECTS,
    inputs: [
      ['status', 'optional. open or done. Default: both.'],
      ['due_before', 'optional. ISO 8601 date. Default: any due date, or none.'],
      ['limit', 'optional. 1–50. Default 30.'],
    ],
    returns: 'actions: id, text, due (a date or null), status, project, cite, link.',
    errors: [DATE_ERROR],
    rateLimit: READ_LIMIT,
  },
  {
    name: 'list_sessions',
    scope: 'ideas:read',
    classification: 'Read',
    does: 'Long recordings (interviews, walk-and-talks) since a date, newest first, with their chapters.',
    sideEffects: READ_EFFECTS,
    inputs: [
      ['since', 'optional. ISO 8601 date or date-time. Default: the last 30 days.'],
      ['limit', 'optional. 1–20. Default 10.'],
    ],
    returns: 'sessions: id, title, duration_ms, recorded_at, chapters (title, start_ms, cite, link), cite, link.',
    errors: [DATE_ERROR],
    rateLimit: READ_LIMIT,
  },
  {
    name: 'get_session_quotes',
    scope: 'ideas:read',
    classification: 'Read',
    does: 'A session’s quotable lines, best first.',
    sideEffects: READ_EFFECTS,
    inputs: [
      ['session_id', 'required. A session’s id from list_sessions. No default.'],
      ['limit', 'optional. 1–20. Default 10.'],
    ],
    returns: 'session_id; quotes: text, speaker, ms, clip_score (0–1 or null), cite, link.',
    errors: [
      'That doesn’t look like an Ivy session id.',
      'I couldn’t find that session in your Ivy.',
      'That recording is a voice memo, not a session. Ask for its idea or its transcript instead.',
    ],
    rateLimit: READ_LIMIT,
  },
  {
    name: 'get_transcript',
    scope: 'ideas:read',
    classification: 'Read',
    does: 'Every word of one recording, with timestamps. The only tool that returns transcripts, and only for the recording asked for.',
    sideEffects: READ_EFFECTS,
    inputs: [['recording_id', 'required. A recording’s id, from any cite. No default.']],
    returns: 'recording_id, title, kind, recorded_at, utterances (start_ms, end_ms, speaker, text), cite, link.',
    errors: [
      'That doesn’t look like an Ivy recording id.',
      'I couldn’t find that recording in your Ivy.',
      'Ivy is still listening to that one. Try again in a minute.',
    ],
    rateLimit: READ_LIMIT,
  },
  {
    name: 'capture_idea',
    scope: 'ideas:capture',
    classification: 'Write · not sensitive',
    does:
      'Adds a new idea in the creator’s words. It is processed like a voice memo recorded in the app and shown in Ivy marked “via Muse”.',
    sideEffects:
      'Creates one private recording holding the text, in the creator’s own account. Within about a minute Ivy classifies it, as it does a voice memo: ' +
      'the ideas in it become private cards, any to-dos become to-dos, and each card is placed in a thread with related ideas (a new one, or one ' +
      'she has returned to before). Pictures are added as for any memo: a photo card gets a stock photograph from Unsplash, and a to-do may get one ' +
      'picture generated in her style. No credits are charged to the creator. Nothing is shared, published or posted, and nothing else ' +
      'is edited or deleted. A retry with the same idempotency key, or the same words within 10 minutes with no key, files nothing new.',
    inputs: [
      ['text', 'required. 1–4,000 characters. No default.'],
      [
        'idempotency_key',
        'optional. 8–128 characters of letters, digits and . _ : -. A retry with the same key returns the first result; the same key with different text is refused. Default: derived from the text, so the same words within 10 minutes are filed once.',
      ],
      ['context', 'optional. Up to 120 characters, e.g. “from Charm”. Default: none.'],
    ],
    returns: 'recording_id, status (queued, or the current status on a retry), replayed (true on a retry), link.',
    errors: [
      'There’s nothing in that idea to add. Say it again with the words in.',
      'That’s too long for one idea — keep it under 4000 characters.',
      'Use letters, digits and . _ : - in the idempotency key.',
      'That idempotency key was already used for a different idea. Send a new key for a new idea.',
      'Ivy is already adding that idea. It’ll be in Home in a minute.',
    ],
    rateLimit: 'At most 10 a minute per creator, within the 60 calls a minute shared with the other tools.',
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
        A creator’s Ivy ideas, threads and sessions aren’t on the web; the connector is the only way Muse can read them.
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
        shown to the creator. An input that fails its schema is answered by the MCP SDK as{' '}
        <code style={s.code}>Input validation error: Invalid arguments for tool …</code>, followed by the sentence listed
        under the tool where there is one.
      </p>
      <p>Any tool can also answer:</p>
      <ul>
        <li>
          Over the rate limit: “You’ve asked Ivy a lot in the last minute. Give it a moment and ask again.” (capture_idea:
          “That’s ten ideas in a minute. Give Ivy a moment, then add the next one.”)
        </li>
        <li>
          Missing scope: “This key can’t read your ideas. Make a new key in Ivy with “{SCOPE_WORDS['ideas:read']}” on.”
          (capture_idea: “This key can read your ideas but can’t add new ones. Make a new key in Ivy with “
          {SCOPE_WORDS['ideas:capture']}” on.”)
        </li>
        <li>Unexpected failure: “Ivy hit a problem answering that. Try again in a moment.”</li>
        <li>No credential, or a revoked or expired one: HTTP 401 before any tool runs (see Authentication).</li>
      </ul>
      {TOOLS.map((t) => (
        <section key={t.name} style={{ borderTop: '1px solid #E8E8ED', padding: '1rem 0' }}>
          <h3 style={{ fontSize: 17, margin: 0 }}>
            <code style={s.code}>{t.name}</code>{' '}
            <span style={{ ...s.dim, fontWeight: 400, fontSize: 14 }}>
              · {t.classification} · {t.scope}
            </span>
          </h3>
          <p style={{ margin: '0.5rem 0' }}>{t.does}</p>
          <p style={{ margin: '0.5rem 0' }}>
            <span style={s.dim}>Side effects:</span> {t.sideEffects}
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>
            <span style={s.dim}>Inputs:</span>
          </p>
          <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>
            {t.inputs.map(([name, about]) => (
              <li key={name}>
                <code style={s.code}>{name}</code> — {about}
              </li>
            ))}
          </ul>
          <p style={{ margin: '0.5rem 0' }}>
            <span style={s.dim}>Returns:</span> {t.returns}
          </p>
          <p style={{ margin: '0.5rem 0 0' }}>
            <span style={s.dim}>Errors:</span>{' '}
            {t.errors.length === 0 ? 'only those any tool can give (above).' : 'besides those any tool can give (above):'}
          </p>
          {t.errors.length > 0 && (
            <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>
              {t.errors.map((e) => (
                <li key={e}>“{e}”</li>
              ))}
            </ul>
          )}
          <p style={{ margin: '0.5rem 0 0' }}>
            <span style={s.dim}>Rate limit:</span> {t.rateLimit}
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

      <h2 style={s.h2}>Reviewer access</h2>
      <p>
        The reviewer credentials supplied with Ivy Wolf’s submission are for the production environment: this endpoint,
        app.ivywolf.com.au and the live Ivy database, not a test copy. The reviewer account holds a sample notebook that
        every tool can be tried on — ideas in a project, a thread returned to three times, a dated to-do, and a recorded
        interview with chapters, quotes and a transcript. Ideas it captures stay private to that account.
      </p>

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
          Pictures for what capture_idea creates come from two more services, as they do for any memo.{' '}
          <strong>Unsplash</strong>: for a card shown as a photo, Ivy sends a search phrase of 2–6 words that Claude
          wrote to describe what to photograph (for example “hands wrapping a candle box”), with Ivy’s app key, then
          tells Unsplash which photo was used, as its API guidelines require. <strong>fal.ai</strong>: for a to-do,
          Ivy may have one picture drawn by the Flux Schnell model. It sends a one-sentence description Claude wrote of
          what to draw, the creator’s style words and her colours as colour names, and a fixed instruction: no faces,
          text, logos or brand marks. Neither service is sent the captured text, a transcript, a title or gist, the
          creator’s identity or anyone else’s data. Nothing is sent when Claude found nothing to picture, when the card
          isn’t a photo card, or when the same description was already drawn for this creator (the stored picture is
          reused). Before either request leaves Ivy, the name of every person heard in the recording, and any other
          name Ivy knows that person by, is removed in code. Leaving out brands, products and descriptions of faces is
          an instruction to Claude, not a check in code.
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
