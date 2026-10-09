// packages/schema/pinterest.ts
// Pinterest's developer terms, as Ivy keeps them. Every place that touches Pinterest imports from here, so the rules
// live in one file and the guards below enforce them.
//
//   1. Store nothing but the OAuth token. Never cache or store pins, pin images or board data: no rows, no files in
//      Supabase storage, no copies in frames/. Fetch live from the Pinterest API each time something is shown.
//      The token lives in Supabase Vault (apps/web/lib/vault.ts, vaultSecretName(creatorId, PINTEREST)) and nowhere
//      else — not in a table, not in logs.
//   2. Pins are never inputs. Not to generation (packages/pipeline/generate refuses a Pinterest card or a Pinterest
//      image), and not to style_signals (her taste is learned from her own work, never from what she saw on Pinterest).
//   3. Shown unaltered, with a link back. A pin appears exactly as Pinterest serves it — no crop, filter, overlay,
//      re-encode or regenerated frame — and every pin links to its own Pinterest URL.
//   4. Disconnect deletes the token: deleteSecret(vaultSecretName(creatorId, PINTEREST)) and the creator_connections
//      row, in the same request. Nothing else is left to delete, because rule 1 means nothing else was kept.
//
// Before Job H these rules existed only as product intent: suggestions (0028) and pin_suggestion (0030/0031) could
// hold a source of 'pinterest' with a stored frame, and the 0032 bridge would pass its signals to style_signals.
// The guards here stop new writes; the schema follow-up (0036) is listed in docs/pinterest.md.

export const PINTEREST = 'pinterest' as const

/** Hosts Pinterest serves pins and pin images from. A URL on one of these is a pin, whatever else it claims to be. */
const PIN_HOSTS = /(^|\.)(pinterest\.[a-z.]+|pinimg\.com|pin\.it)$/i

export function isPinterestUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return PIN_HOSTS.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Rule 1/2: a source that may be stored, signalled or generated from. Pinterest never is. */
export function isPinterestSource(source: string | null | undefined): boolean {
  return source === PINTEREST
}

/** Throws when something from Pinterest is about to be used as an input (generation, style_signals, storage). */
export function refusePinterest(what: string, source: string | null | undefined, urls: (string | null | undefined)[] = []): void {
  if (isPinterestSource(source) || urls.some(isPinterestUrl))
    throw new Error(`${what}: Pinterest content can't be stored or used as an input (Pinterest developer terms; packages/schema/pinterest.ts)`)
}
