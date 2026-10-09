// apps/web/lib/rateLimit.ts
// A per-creator sliding window for app API routes (Job H.0c: /api/references, 60 a minute). In memory, per server
// instance: Fluid Compute reuses instances, so it holds for one creator's bursts, but it isn't a global count — the
// MCP connector's limit (agent_calls, 0025) is the durable one. Good enough to stop a runaway client in the pilot.

const windows = new Map<string, number[]>()

/** True if this call is allowed; records it. */
export function allow(key: string, perMinute: number, now = Date.now()): boolean {
  const since = now - 60_000
  const hits = (windows.get(key) ?? []).filter((t) => t > since)
  if (hits.length >= perMinute) {
    windows.set(key, hits)
    return false
  }
  hits.push(now)
  windows.set(key, hits)
  return true
}
