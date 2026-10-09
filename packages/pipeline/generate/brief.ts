// packages/pipeline/generate/brief.ts
// The brief a generation gets: the idea's own words, then the creator's style pack to fill what the idea left open.
// The style pack never contradicts the idea (Job H.0a): when the idea names a time of day, the weather or the light,
// tone words of that kind are dropped — "Rooftop chase, at night" loses the pack's "soft daylight", keeps "film grain".
// A tone word can belong to more than one kind ("soft daylight" is light and time of day); it goes if any of its kinds
// is named by the idea.

export type Aspect = 'time' | 'weather' | 'light'

/** Words that settle an aspect. Matched as whole words or phrases, case-insensitive. */
const LEXICON: Record<Aspect, string[]> = {
  time: [
    'dawn', 'sunrise', 'daybreak', 'morning', 'midday', 'noon', 'afternoon', 'day', 'daytime', 'daylight', 'golden hour',
    'sunset', 'dusk', 'twilight', 'blue hour', 'evening', 'night', 'nighttime', 'midnight', 'after dark', 'nocturnal',
  ],
  weather: [
    'rain', 'rainy', 'raining', 'drizzle', 'storm', 'stormy', 'thunder', 'lightning', 'snow', 'snowy', 'snowing', 'sleet',
    'hail', 'fog', 'foggy', 'mist', 'misty', 'haze', 'hazy', 'overcast', 'cloudy', 'clouds', 'sunny', 'clear sky',
    'clear skies', 'wind', 'windy', 'heatwave',
  ],
  light: [
    'daylight', 'sunlight', 'sunlit', 'moonlight', 'moonlit', 'candlelight', 'candlelit', 'firelight', 'neon',
    'streetlight', 'streetlights', 'lamplight', 'backlit', 'silhouette', 'silhouetted', 'low light', 'low-light',
    'dim', 'dark', 'darkness', 'bright', 'harsh light', 'soft light', 'hard light', 'golden light', 'natural light',
    'studio light', 'spotlight', 'shadows', 'high key', 'low key', 'golden hour', 'blue hour',
  ],
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const PATTERNS: Record<Aspect, RegExp> = Object.fromEntries(
  (Object.keys(LEXICON) as Aspect[]).map((a) => [a, new RegExp(`\\b(${LEXICON[a].map(escape).join('|')})\\b`, 'i')])
) as Record<Aspect, RegExp>

/** Which aspects a piece of text names. */
export function aspectsOf(text: string): Set<Aspect> {
  return new Set((Object.keys(PATTERNS) as Aspect[]).filter((a) => PATTERNS[a].test(text)))
}

export interface BriefInput {
  /** The idea's words, in order (title, then gist, then any direction added for this run, e.g. "at night"). */
  idea: string[]
  /** The style pack's tone words. */
  tone: string[]
}

export interface Brief {
  text: string
  /** Tone words kept, and the ones dropped because the idea already settled their aspect. */
  kept: string[]
  dropped: { word: string; because: Aspect[] }[]
}

export function buildBrief({ idea, tone }: BriefInput): Brief {
  const parts = idea.map((s) => s.trim()).filter(Boolean)
  const named = aspectsOf(parts.join(' '))
  const kept: string[] = []
  const dropped: Brief['dropped'] = []
  for (const word of tone.map((w) => w.trim()).filter(Boolean)) {
    const clash = [...aspectsOf(word)].filter((a) => named.has(a))
    if (clash.length) dropped.push({ word, because: clash })
    else kept.push(word)
  }
  // Each part ends once: a part already ending in . ! ? (or one inside a closing quote) gets no extra full stop.
  const sentence = (t: string) => (/[.!?]["”’')]*$/.test(t) ? t : `${t}.`)
  const text = [...parts, kept.length ? `Look: ${kept.join(', ')}` : ''].filter(Boolean).map(sentence).join(' ')
  return { text, kept, dropped }
}
