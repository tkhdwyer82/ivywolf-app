// packages/pipeline/generate/pricing.ts
// Shared sizing for token-priced video (Seedance 2.5 on every route): output size from resolution tier and aspect,
// and billable video tokens = ceil(height × width × seconds × 24 / 1024) (Higgsfield's and fal's published formula).

/** Output size for a resolution tier and aspect ratio: the short side is the tier (720p 9:16 → 720 × 1280). */
export function dimensions(resolution: string, aspect: string): { width: number; height: number } {
  const short = Number(resolution.replace(/p$/, ''))
  const [w, h] = aspect.split(':').map(Number)
  if (!short || !w || !h) throw new Error(`can't size ${resolution} ${aspect}`)
  const long = Math.round((short * Math.max(w, h)) / Math.min(w, h))
  return w >= h ? { width: long, height: short } : { width: short, height: long }
}

export function videoTokens(p: { resolution?: unknown; aspect_ratio?: unknown; duration?: unknown }): number {
  const { width, height } = dimensions(String(p.resolution ?? '720p'), String(p.aspect_ratio ?? '16:9'))
  return Math.ceil((height * width * Number(p.duration ?? 5) * 24) / 1024)
}
