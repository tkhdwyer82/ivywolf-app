// apps/web/lib/oauth/respond.ts
// The two ways the authorization endpoints answer a browser: a plain page (errors that must not go back to an
// unverified client), or a redirect to the client's verified redirect URI carrying the result and iss (RFC 9207).

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** A plain page for errors that must not go back to the client. */
export function errorPage(title: string, detail: string, status = 400) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.25rem;color:#1D1D1F"><h1 style="font-size:1.4rem">${esc(title)}</h1><p>${esc(detail)}</p></body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

/** Back to the client with an OAuth error. */
export function redirectError(redirectUri: string, issuer: string, error: string, description: string, state: string | null, status = 302) {
  const u = new URL(redirectUri)
  u.searchParams.set('error', error)
  u.searchParams.set('error_description', description)
  if (state !== null) u.searchParams.set('state', state)
  u.searchParams.set('iss', issuer)
  return Response.redirect(u.toString(), status)
}

/** Back to the client with the code. */
export function redirectCode(redirectUri: string, issuer: string, code: string, state: string | null) {
  const u = new URL(redirectUri)
  u.searchParams.set('code', code)
  if (state !== null) u.searchParams.set('state', state)
  u.searchParams.set('iss', issuer)
  return Response.redirect(u.toString(), 303)
}
