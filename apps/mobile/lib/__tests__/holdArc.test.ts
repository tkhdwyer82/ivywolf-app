// The hold arc's geometry (lib/holdArc.ts): aim, fit, blob, selection and label placement.

import { ARC, BLOB, arcAngles, blob, labelSpot, pickSelected, placeArc, pull, restCentre, spill, type Screen } from '../holdArc'

// iPhone 18 Pro, portrait: 402 × 874 with the Dynamic Island and home indicator insets.
const screen: Screen = { w: 402, h: 874, top: 62, bottom: 34, left: 0, right: 0 }
const deg = (r: number) => (r * 180) / Math.PI
const fits = (touch: { x: number; y: number }, angles: number[], radius: number = ARC.radius) =>
  angles.every((a) => {
    const c = restCentre(touch, a, radius)
    const r = ARC.button / 2
    return (
      c.x >= screen.left + ARC.margin + r - 1e-6 &&
      c.x <= screen.w - screen.right - ARC.margin - r + 1e-6 &&
      c.y >= screen.top + ARC.margin + r - 1e-6 &&
      c.y <= screen.h - screen.bottom - ARC.margin - r + 1e-6
    )
  })

describe('placeArc', () => {
  it('puts 4 buttons 40° apart, in order, on a 78 radius', () => {
    const touch = { x: 100, y: 600 }
    const { angles, radius } = placeArc(touch, 4, screen)
    expect(radius).toBe(78)
    expect(angles).toHaveLength(4)
    for (let i = 1; i < 4; i++) expect(deg(angles[i] - angles[i - 1])).toBeCloseTo(40)
    for (const a of angles) {
      const c = restCentre(touch, a, radius)
      expect(Math.hypot(c.x - touch.x, c.y - touch.y)).toBeCloseTo(78)
    }
  })

  it('aims at (centre x, touch y − 200) from the middle of the feed', () => {
    const touch = { x: 100, y: 600 }
    const { angles, radius } = placeArc(touch, 3, screen)
    expect(deg(angles[1])).toBeCloseTo(deg(Math.atan2(-200, 201 - 100)))
    expect(fits(touch, angles, radius)).toBe(true)
  })

  it('aims down (touch y + 200) when the touch is within 300 of the top', () => {
    const touch = { x: 200, y: 150 }
    const { angles } = placeArc(touch, 4, screen)
    const centre = (angles[1] + angles[2]) / 2
    expect(deg(centre)).toBeCloseTo(deg(Math.atan2(200, 201 - 200)))
    expect(Math.sin(centre)).toBeGreaterThan(0)
  })

  it('near a side edge, turns the arc in 10° steps and keeps the 78 radius', () => {
    const touch = { x: 40, y: 420 }
    const straight = Math.atan2(-200, 201 - 40)
    expect(fits(touch, arcAngles(straight, 4))).toBe(false)
    const { angles, radius } = placeArc(touch, 4, screen)
    expect(radius).toBe(78)
    expect(fits(touch, angles, radius)).toBe(true)
    expect(Math.round(deg((angles[1] + angles[2]) / 2 - straight)) % 10).toBe(0)
  })

  it('where no turn fits at 78, shrinks the radius (not below 66) before spilling', () => {
    const touch = { x: 60, y: 120 }
    const base = Math.atan2(200, 201 - 60)
    for (let k = -18; k <= 18; k++) expect(fits(touch, arcAngles(base + (k * 10 * Math.PI) / 180, 4))).toBe(false)
    const { angles, radius } = placeArc(touch, 4, screen)
    expect(radius).toBeLessThan(78)
    expect(radius).toBeGreaterThanOrEqual(ARC.minRadius)
    expect(fits(touch, angles, radius)).toBe(true)
    // the largest radius that fits: 2 more doesn't, at any turn
    for (let k = -18; k <= 18; k++) expect(fits(touch, arcAngles(base + (k * 10 * Math.PI) / 180, 4), radius + 2)).toBe(false)
  })

  it('keeps the spacing at 40° even when the radius shrinks', () => {
    const { angles } = placeArc({ x: 60, y: 120 }, 4, screen)
    for (let i = 1; i < 4; i++) expect(deg(angles[i] - angles[i - 1])).toBeCloseTo(40)
  })

  it('in a corner where nothing fits down to 66, takes the turn and radius that spill least', () => {
    const touch = { x: 380, y: 800 }
    const straight = Math.atan2(-200, 201 - 380)
    const placed = placeArc(touch, 4, screen)
    expect(fits(touch, placed.angles, placed.radius)).toBe(false)
    const least = spill(touch, placed.angles, screen, placed.radius)
    for (let r = ARC.radius; r >= ARC.minRadius; r -= 2)
      for (let k = -18; k <= 18; k++)
        expect(least).toBeLessThanOrEqual(spill(touch, arcAngles(straight + (k * 10 * Math.PI) / 180, 4), screen, r) + 1e-9)
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

  it('swells to 1.2 and leans 15 out along its angle at full pull', () => {
    const b = blob(1, Math.PI / 2)
    expect(b.scale).toBeCloseTo(1.2)
    expect(BLOB.grow).toBe(0.2)
    expect(b.dx).toBeCloseTo(0)
    expect(b.dy).toBeCloseTo(15)
    expect(BLOB.push).toBe(15)
    expect(blob(0, 0)).toEqual({ scale: 1, dx: 0, dy: 0 })
  })
})

describe('pickSelected', () => {
  const touch = { x: 200, y: 500 }
  const arc = placeArc(touch, 4, screen)
  const at = (i: number) => restCentre(touch, arc.angles[i], arc.radius)

  it('is nothing at the touch point (every pull is under 0.35)', () => {
    expect(pickSelected(touch, touch, arc)).toBe(-1)
  })

  it('is the button the finger is on', () => {
    arc.angles.forEach((_, i) => expect(pickSelected(at(i), touch, arc)).toBe(i))
  })

  it('is the nearer of two neighbours', () => {
    const a = at(1)
    const b = at(2)
    const nearA = { x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3 }
    expect(pickSelected(nearA, touch, arc)).toBe(1)
  })

  it('follows the buttons when an edge shrank the radius', () => {
    const corner = { x: 60, y: 120 }
    const small = placeArc(corner, 4, screen)
    expect(small.radius).toBeLessThan(78)
    small.angles.forEach((a, i) => expect(pickSelected(restCentre(corner, a, small.radius), corner, small)).toBe(i))
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
