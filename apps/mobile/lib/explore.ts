// apps/mobile/lib/explore.ts
// Explore (Home v4, H2 1737:164 / 1464:5): the tools, shown by what they make. The only place video plays without
// being earned — each tile loops its tool's official sample (assets/explore/). Live tools run through the generation
// gateway (packages/pipeline/generate: Higgsfield, connected for everyone, so "Connected ✓"); the rest say "Coming
// soon". Nothing on Explore spends credits: tapping a live tool only opens "Pick an idea" (1464:124).

export const CATEGORIES = ['All', 'Video', 'Image', 'Edit', 'Thumbnail', 'Music', 'Deck'] as const
export type Category = (typeof CATEGORIES)[number]

export interface Tool {
  key: string
  name: string
  category: Exclude<Category, 'All'>
  /** What it makes, in her words: "Restyle a frame in your look". */
  what: string
  /** Runs through the gateway today. */
  live: boolean
  /** Who runs it, for the sheet's title ("Try Higgsfield on…") and the Connected badge. */
  via: string | null
  /** The tile's height at 170 wide (1737:164), and its flat placeholder until the sample video is in. */
  height: number
  placeholder: string
}

export const TOOLS: Tool[] = [
  { key: 'nano-banana', name: 'Nano Banana', category: 'Image', what: 'Restyle a frame in your look', live: false, via: null, height: 250, placeholder: '#2B2B2E' },
  { key: 'kling-3', name: 'Kling 3.0', category: 'Video', what: 'Turn frames into video', live: true, via: 'Higgsfield', height: 300, placeholder: '#111113' },
  { key: 'kling', name: 'Kling', category: 'Video', what: 'People in motion, one take', live: false, via: null, height: 230, placeholder: '#63AAD6' },
  { key: 'capcut', name: 'CapCut', category: 'Edit', what: 'Cut a Reel from your takes', live: false, via: null, height: 210, placeholder: '#EEA94C' },
  { key: 'suno', name: 'Suno', category: 'Music', what: 'A track that fits the cut', live: false, via: null, height: 200, placeholder: '#8E4CF0' },
  { key: 'canva', name: 'Canva', category: 'Thumbnail', what: 'Thumbnails and story frames', live: false, via: null, height: 240, placeholder: '#7EDFC7' },
  { key: 'gamma', name: 'Gamma', category: 'Deck', what: 'A brand pitch from a board', live: false, via: null, height: 190, placeholder: '#B4D4FB' },
]

/** Official sample videos in assets/explore/, by tool key. Empty until the files are in (placeholders until then). */
export const VIDEOS: Partial<Record<string, number>> = {}

/** The tiles for a chip and what she's typed: name, what it makes, or its kind. */
export function filterTools(tools: Tool[], category: Category, q: string): Tool[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  return tools.filter(
    (t) => (category === 'All' || t.category === category) && words.every((w) => `${t.name} ${t.what} ${t.category}`.toLowerCase().includes(w))
  )
}

/** "Image · Restyle a frame in your look" */
export const toolLine = (t: Tool) => `${t.category} · ${t.what}`
