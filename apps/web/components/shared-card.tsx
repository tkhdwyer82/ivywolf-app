// apps/web/components/shared-card.tsx
// A shared card, for anyone with the link (Job C+, Copy link): the card alone — its title, the form it takes and the
// photo credit — drawn after the app's CardFace (apps/mobile/components/CardFace.tsx) on its project's gradient.
// Never the recording, transcript, context, linked ideas, project or thread: shared_card() (0034) doesn't return them.

import { gradientOf } from '@ivywolf/ui'
import { hero } from '@/components/graph'

export type SharedCard = {
  id: string
  title: string
  gist: string | null
  shape: 'photo' | 'quote' | 'diagram' | 'board' | 'text' | null
  quote: { text: string; speaker: string | null } | null
  diagram: { title: string; rows: { from: string; to: string }[] } | null
  board: { hook: string; beats: string[] } | null
  frame_url: string | null
  credit: { photographer: string; photographer_url: string; photo_url: string } | null
  gradient: string | null
}

const font = 'system-ui, -apple-system, "SF Pro Text", sans-serif'

export function SharedCardView({ card }: { card: SharedCard }) {
  const g = gradientOf(card.gradient)
  const fg = g.ink ? hero.ink : '#FFFFFF'
  const soft = g.ink ? 'rgba(29,29,31,0.7)' : 'rgba(255,255,255,0.78)'
  const bed: React.CSSProperties = {
    borderRadius: 28,
    padding: 24,
    background: `linear-gradient(to bottom, ${g.colors[0]}, ${g.colors[1]})`,
    color: fg,
    minHeight: 320,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  }
  const shape = card.shape ?? (card.frame_url ? 'photo' : 'text')

  let face: React.ReactNode
  if (shape === 'photo' && card.frame_url) {
    face = (
      <>
        <div style={{ borderRadius: 28, overflow: 'hidden', background: hero.fill, height: 440 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.frame_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.3, margin: '16px 0 0' }}>{card.title}</h1>
      </>
    )
  } else if (shape === 'quote' && card.quote) {
    face = (
      <div style={bed}>
        <span aria-hidden style={{ fontSize: 56, fontWeight: 700, lineHeight: 0.8 }}>
          “
        </span>
        <p style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.25, margin: 0 }}>{card.quote.text}</p>
        {card.quote.speaker && <p style={{ margin: 0, color: soft, fontSize: 14 }}>— {card.quote.speaker}</p>}
      </div>
    )
  } else if (shape === 'diagram' && card.diagram) {
    face = (
      <div style={bed}>
        {card.diagram.title && <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: 1.2, color: soft, textTransform: 'uppercase' }}>{card.diagram.title}</p>}
        {card.diagram.rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, textAlign: 'center', borderRadius: 10, padding: '8px 6px', background: g.ink ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.22)' }}>{r.from}</span>
            <span aria-hidden>→</span>
            <span style={{ flex: 1, textAlign: 'center', borderRadius: 10, padding: '8px 6px', background: 'rgba(255,255,255,0.9)', color: hero.ink }}>{r.to}</span>
          </div>
        ))}
      </div>
    )
  } else if (shape === 'board' && card.board) {
    face = (
      <div style={bed}>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{card.board.hook || card.title}</p>
        {card.board.beats.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: fg, flex: 'none' }} />
            <span>{b}</span>
          </div>
        ))}
      </div>
    )
  } else {
    face = (
      <div style={bed}>
        <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.4, lineHeight: 1.2, margin: 0 }}>{card.title}</h1>
        {card.gist && <p style={{ margin: 'auto 0 0', color: soft, fontSize: 16 }}>{card.gist}</p>}
      </div>
    )
  }

  return (
    <main style={{ font: `16px/1.5 ${font}`, color: hero.ink, background: hero.room, maxWidth: 30 * 16, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
      <div style={{ marginTop: '1rem' }}>{face}</div>
      {shape !== 'photo' && shape !== 'text' && <h1 style={{ fontSize: 20, fontWeight: 600, margin: '16px 0 0' }}>{card.title}</h1>}
      {card.credit && (
        <p style={{ fontSize: 13, color: hero.secondary, margin: '8px 0 0' }}>
          Photo by <a href={card.credit.photographer_url} style={{ color: 'inherit' }}>{card.credit.photographer}</a> on{' '}
          <a href={card.credit.photo_url} style={{ color: 'inherit' }}>
            Unsplash
          </a>
        </p>
      )}
      <p style={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: hero.secondary, marginTop: '2.5rem' }}>
        <a href="/" style={{ color: 'inherit', textDecoration: 'none' }}>
          Made with Ivy Wolf
        </a>
      </p>
    </main>
  )
}
