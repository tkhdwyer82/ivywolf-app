// The hold arc's geometry (lib/holdArc.ts): aim, fit, blob, selection and label placement.

import { ARC, BLOB, arcAngles, blob, labelSpot, pickSelected, placeArc, pull, restCentre, spill, type Screen } from '../holdArc'

// iPhone 18 Pro, portrait: 402 × 874 with the Dynamic Island and home indicator insets.
const screen: Screen = { w: 402, h: 874, top: 62, bottom: 34, left: 0, right: 0 }
const deg = (r: number) => (r * 180) / Math.PI
const fits = (touch: { x: number; y: number }, angles: number[]) =>
  angles.every((a) => {
    const c = restCentre(touch, a)
    const r = ARC.button / 2
    return (
      c.x >= screen.left + ARC.margin + r - 1e-6 &&
      c.x <= screen.w - screen.right - ARC.margin - r + 1e-6 &&
      c.y >= screen.top + ARC.margin + r - 1e-6 &&
      c.y <= screen.h - screen.bottom - ARC.margin - r + 1e-6
    )
  })

describe('placeArc', () => {
  it('puts 4 buttons 50° apart, in order, on a 56 radius', () => {
    const touch = { x: 100, y: 600 }
    const angles = placeArc(touch, 4, screen)
    expect(angles).toHaveLength(4)
    for (let i = 1; i < 4; i++) expect(deg(angles[i] - angles[i - 1])).toBeCloseTo(50)
    for (const a of angles) {
      const c = restCentre(touch, a)
      expect(Math.hypot(c.x - touch.x, c.y - touch.y)).toBeCloseTo(56)
    }
  })

  it('aims at (centre x, touch y − 200) from the middle of the feed', () => {
    const touch = { x: 100, y: 600 }
    const angles = placeArc(touch, 5, screen)
    const mid = angles[2]
    expect(deg(mid)).toBeCloseTo(deg(Math.atan2(-200, 201 - 100)))
    expect(fits(touch, angles)).toBe(true)
  })

  it('aims down (touch y + 200) when the touch is within 300 of the top', () => {
    const touch = { x: 300, y: 250 }
    const angles = placeArc(touch, 4, screen)
    const centre = (angles[1] + angles[2]) / 2
    expect(deg(centre)).toBeCloseTo(deg(Math.atan2(200, 201 - 300)))
    expect(Math.sin(centre)).toBeGreaterThan(0)
  })

  it('turns the arc in 10° steps until every button is inside the safe area', () => {
    // Low on the left: the straight aim spills a button off the side; a turn fits.
    const touch = { x: 60, y: 740 }
    const straight = Math.atan2(-200, 201 - 60)
    expect(fits(touch, arcAngles(straight, 5))).toBe(false)
    const angles = placeArc(touch, 5, screen)
    expect(fits(touch, angles)).toBe(true)
    expect(Math.round(deg(angles[2] - straight)) % 10).toBe(0)
  })

  it('fits near the left edge at the top of the feed, under the status bar', () => {
    const touch = { x: 60, y: 160 }
    expect(fits(touch, placeArc(touch, 5, screen))).toBe(true)
  })

  it('next to a side edge, where no 50° turn fits, tightens the spacing to 40° and fits', () => {
    const touch = { x: 20, y: 420 }
    const straight = Math.atan2(-200, 201 - 20)
    for (let k = -18; k <= 18; k++) expect(fits(touch, arcAngles(straight + (k * 10 * Math.PI) / 180, 4))).toBe(false)
    const angles = placeArc(touch, 4, screen)
    expect(fits(touch, angles)).toBe(true)
    for (let i = 1; i < 4; i++) expect(deg(angles[i] - angles[i - 1])).toBeCloseTo(40)
  })

  it('keeps 50° wherever 50° fits', () => {
    const touch = { x: 60, y: 740 }
    const angles = placeArc(touch, 5, screen)
    expect(deg(angles[1] - angles[0])).toBeCloseTo(50)
  })

  it('in a corner where neither spacing fits, takes the turn and spacing that spill least', () => {
    const touch = { x: 380, y: 800 }
    const straight = Math.atan2(-200, 201 - 380)
    const placed = placeArc(touch, 5, screen)
    expect(fits(touch, placed)).toBe(false)
    for (const step of [50, 40])
      for (let k = -18; k <= 18; k++)
        expect(spill(touch, placed, screen)).toBeLessThanOrEqual(spill(touch, arcAngles(straight + (k * 10 * Math.PI) / 180, 5, step), screen) + 1e-9)
  })
})

describe('blob', () => {
  it('pulls 1 on the button, 0 from 70 away, and linearly between', () => {
    const rest = { x: 100, y: 100 }
    expect(pull(rest, rest)).toBe(1)
    expect(pull({ x: 170, y: 100 }, rest)).toBe(0)
    expect(pull({ x: 135, y: 100 }, rest)).toBeCloseTo(0.5)
    expect(pull({ x: 400, y: 100 }, rest)).toBe(0)
  })

  it('swells by 0.25 and leans 18 out along its angle at full pull', () => {
    const b = blob(1, Math.PI / 2)
    expect(b.scale).toBeCloseTo(1 + BLOB.grow)
    expect(b.dx).toBeCloseTo(0)
    expect(b.dy).toBeCloseTo(BLOB.push)
    expect(blob(0, 0)).toEqual({ scale: 1, dx: 0, dy: 0 })
  })
})

describe('pickSelected', () => {
  const touch = { x: 200, y: 500 }
  const angles = placeArc(touch, 4, screen)

  it('is nothing at the touch point (every pull is under 0.35)', () => {
    expect(pickSelected(touch, touch, angles)).toBe(-1)
  })

  it('is the button the finger is on', () => {
    angles.forEach((a, i) => expect(pickSelected(restCentre(touch, a), touch, angles)).toBe(i))
  })

  it('is the nearer of two neighbours', () => {
    const a = restCentre(touch, angles[1])
    const b = restCentre(touch, angles[2])
    const nearA = { x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3 }
    expect(pickSelected(nearA, touch, angles)).toBe(1)
  })
})

describe('labelSpot', () => {
  it('sits in the half away from the touch', () => {
    expect(labelSpot({ x: 100, y: 600 }, screen).side).toBe('right')
    expect(labelSpot({ x: 300, y: 600 }, screen).side).toBe('left')
  })

  it('is 180 above a touch in the lower half, 180 below one in the upper half', () => {
    expect(labelSpot({ x: 100, y: 600 }, screen).y).toBe(420)
    expect(labelSpot({ x: 100, y: 300 }, screen).y).toBe(480)
  })
})
