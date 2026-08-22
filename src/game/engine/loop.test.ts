import { describe, expect, it } from 'vitest'
import { MAX_FRAME_MS, STEP_MS, stepsFor } from './loop.ts'

describe('stepsFor', () => {
  it('runs one step for a 60Hz frame', () => {
    const { steps, remainderMs } = stepsFor(0, STEP_MS)
    expect(steps).toBe(1)
    expect(remainderMs).toBeCloseTo(0, 9)
  })

  it('carries the remainder rather than dropping it', () => {
    // A 100Hz display: 10ms frames against a 16.67ms step. Two frames should
    // not yet produce a step; the third should.
    let acc = 0
    let total = 0
    for (let i = 0; i < 3; i++) {
      const r = stepsFor(acc, 10)
      total += r.steps
      acc = r.remainderMs
    }
    expect(total).toBe(1)
    expect(acc).toBeCloseTo(30 - STEP_MS, 9)
  })

  it('runs several steps for a slow frame', () => {
    expect(stepsFor(0, 100).steps).toBe(6)
  })

  it('clamps a backgrounded tab instead of running thousands of steps', () => {
    // The case this clamp exists for: a tab hidden for a minute returns a
    // 60000ms delta. Unclamped that is 3600 updates in one frame, which
    // freezes the page and produces an even larger delta next time.
    const { steps } = stepsFor(0, 60_000)
    expect(steps).toBe(Math.floor(MAX_FRAME_MS / STEP_MS))
    expect(steps).toBeLessThanOrEqual(15)
  })

  it('never returns a remainder at or beyond a full step', () => {
    for (const elapsed of [0, 1, 7, 16, 16.7, 33, 99, 250, 5000]) {
      const { remainderMs } = stepsFor(0, elapsed)
      expect(remainderMs).toBeGreaterThanOrEqual(0)
      expect(remainderMs).toBeLessThan(STEP_MS)
    }
  })
})
