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

// ── Ai Hero · v1 build (Figma H9nRPbwfGDwkho3gacQT53) ───────────────────────────────────────────────────────────
// Light rooms: white, ink, one lime. Screens move onto these as they're rebuilt from the "Build now" frames; the
// warm paper palette above stays until the last old screen goes.
export const hero = {
  room: '#FFFFFF',
  ink: '#1D1D1F',
  secondary: '#6E6E73',
  hairline: '#E8E8ED',
  fill: '#F0F0F0',
  lime: '#D8F27A',
  inkSoft: 'rgba(29,29,31,0.85)', // waveform bars
} as const

// Type guide · SF Pro (node 60-18) — "edit a style here, every screen follows". SF Pro is the iOS system font, so no
// fontFamily; Figma's weight 590 is iOS semibold ('600'), 510 is medium ('500'). Fraunces is marketing-only.
const t = (fontSize: number, fontWeight: '400' | '500' | '600' | '700', lineHeight: number, letterSpacing = 0) => ({
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  color: hero.ink,
})
export const text = {
  titleScreen: t(30, '700', 36, -0.6),
  titleSection: t(22, '600', 28, -0.4),
  headingCard: t(19, '600', 24, -0.3),
  headingSmall: t(17, '600', 22, -0.2),
  numeral: t(26, '400', 30, -0.4),
  bodyLarge: t(17, '400', 24),
  body: t(15, '400', 21),
  bodyMedium: t(13, '500', 18),
  bodySmall: t(13, '400', 18),
  caption: t(12, '400', 16),
  captionSmall: t(11.5, '400', 15),
  labelOverline: { ...t(10.5, '600', 14, 1.2), textTransform: 'uppercase' as const },
  labelTab: t(10.5, '500', 13, 0.2),
  labelTabActive: t(10.5, '600', 13, 0.2),
  labelPill: { ...t(10, '600', 12, 0.5), textTransform: 'uppercase' as const },
} as const
