// apps/mobile/lib/theme.ts
// One palette, one type scale. Warm paper, ink, and a single accent for the record button and live state.

export const color = {
  paper: '#F6F2EC',
  card: '#FFFFFF',
  ink: '#1C1A17',
  inkSoft: '#6B645B',
  line: '#E4DDD2',
  accent: '#C2410C',
  accentSoft: '#FBE7DC',
  unsure: '#A8A29E',
} as const

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const

export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, color: color.ink, letterSpacing: -0.5 },
  heading: { fontSize: 17, fontWeight: '600' as const, color: color.ink },
  body: { fontSize: 15, color: color.ink, lineHeight: 21 },
  meta: { fontSize: 13, color: color.inkSoft },
}
