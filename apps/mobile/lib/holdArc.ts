// apps/mobile/lib/holdArc.ts
// The hold arc's geometry (components/HoldArc.tsx), as worklets: they run on the UI thread inside the gesture, every
// frame, and plain in tests. Pinterest's long-press menu: the actions fan out on a small arc around the thumb, aimed
// at the open middle of the screen; as the finger nears one it swells and leans out, and the nearest one past the
// threshold is the selection.

export type Point = { x: number; y: number }
export type Screen = { w: number; h: number; top: number; bottom: number; left: number; right: number }

/** The arc: buttons 48 on a 56 radius around the touch, 50° apart (40° near an edge, when 50° won't fit). */
export const ARC = { radius: 56, button: 48, step: 50, tightStep: 40, margin: 16, aim: 200, aimFlipBelow: 300, rotateStep: 10 }
/** The blob: how near (pt) a finger starts to pull a button, how much it swells and leans, and the selection line. */
export const BLOB = { reach: 70, grow: 0.25, push: 18, select: 0.35 }
/** The label sits this far above (touch in the lower half) or below the touch. */
export const LABEL_OFFSET = 180

const DEG = Math.PI / 180

/** Each button's angle (radians, screen axes: y down) for this aim. Order is kept: index 0 is first around the arc. */
export function arcAngles(base: number, n: number, step: number = ARC.step): number[] {
  'worklet'
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(base + (i - (n - 1) / 2) * step * DEG)
  return out
}

/** A button's resting centre. */
export function restCentre(touch: Point, angle: number): Point {
  'worklet'
  return { x: touch.x + ARC.radius * Math.cos(angle), y: touch.y + ARC.radius * Math.sin(angle) }
}

/** How far (pt) these buttons fall outside the safe area, inset by the 16 margin; 0 when they all fit. */
export function spill(touch: Point, angles: number[], s: Screen): number {
  'worklet'
  const r = ARC.button / 2
  const minX = s.left + ARC.margin + r
  const maxX = s.w - s.right - ARC.margin - r
  const minY = s.top + ARC.margin + r
  const maxY = s.h - s.bottom - ARC.margin - r
  let out = 0
  for (const a of angles) {
    const c = restCentre(touch, a)
    out += Math.max(0, minX - c.x) + Math.max(0, c.x - maxX) + Math.max(0, minY - c.y) + Math.max(0, c.y - maxY)
  }
  return out
}

/**
 * Where the arc goes. Aim from the touch at (screen centre x, touch y − 200) — or + 200 when the touch is within 300
 * of the top — then, if any button would leave the safe area, turn the arc 10° at a time (+10, −10, +20, −20, …)
 * until all of them fit. Near an edge where no turn fits, tighten the spacing from 50° to 40° and try again; only if
 * that still doesn't fit (a corner), the turn and spacing that spill least.
 */
export function placeArc(touch: Point, n: number, s: Screen): number[] {
  'worklet'
  const target = { x: s.w / 2, y: touch.y < ARC.aimFlipBelow ? touch.y + ARC.aim : touch.y - ARC.aim }
  const base = Math.atan2(target.y - touch.y, target.x - touch.x)
  let best = arcAngles(base, n)
  let bestOver = spill(touch, best, s)
  for (const step of [ARC.step, ARC.tightStep]) {
    for (let k = 0; k <= 180 / ARC.rotateStep; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const angles = arcAngles(base + sign * k * ARC.rotateStep * DEG, n, step)
        const over = spill(touch, angles, s)
        if (over === 0) return angles
        if (over < bestOver) {
          best = angles
          bestOver = over
        }
      }
    }
  }
  return best
}

/** The pull on a button: 1 with the finger on its resting centre, 0 from 70 away. */
export function pull(finger: Point, rest: Point): number {
  'worklet'
  const d = Math.hypot(finger.x - rest.x, finger.y - rest.y)
  return Math.min(1, Math.max(0, 1 - d / BLOB.reach))
}

/** A button's blob for this pull: its scale, and how far it leans out along its angle. */
export function blob(p: number, angle: number): { scale: number; dx: number; dy: number } {
  'worklet'
  return { scale: 1 + BLOB.grow * p, dx: BLOB.push * p * Math.cos(angle), dy: BLOB.push * p * Math.sin(angle) }
}

/** The selection: the nearest button whose pull is past 0.35, or −1. */
export function pickSelected(finger: Point, touch: Point, angles: number[]): number {
  'worklet'
  let best = -1
  let bestP = BLOB.select
  for (let i = 0; i < angles.length; i++) {
    const p = pull(finger, restCentre(touch, angles[i]))
    if (p > bestP) {
      best = i
      bestP = p
    }
  }
  return best
}

/** The label: in the half of the screen away from the touch, 180 above it (touch in the lower half) or below. */
export function labelSpot(touch: Point, s: Pick<Screen, 'w' | 'h'>): { side: 'left' | 'right'; y: number } {
  'worklet'
  return { side: touch.x < s.w / 2 ? 'right' : 'left', y: touch.y > s.h / 2 ? touch.y - LABEL_OFFSET : touch.y + LABEL_OFFSET }
}
