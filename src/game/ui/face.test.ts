import { describe, expect, it } from 'vitest'
import { FRAME_HEIGHT, FRAME_WIDTH, frameOffset, sheetWidth, type Expression } from './face.ts'

const EXPRESSIONS: Expression[] = ['neutral', 'snarl', 'hurt', 'left', 'right']
const BUCKETS = [0, 1, 2, 3, 4, 5]

describe('frameOffset', () => {
  it('lands on a frame boundary for every combination', () => {
    // A fractional offset would blit half of one face and half of another,
    // which at 36x41 reads as a corrupt portrait rather than an off-by-one.
    for (const bucket of BUCKETS) {
      for (const expression of EXPRESSIONS) {
        const { x, y } = frameOffset(bucket, expression)
        expect(x % FRAME_WIDTH, `x for ${bucket}/${expression}`).toBe(0)
        expect(y % FRAME_HEIGHT, `y for ${bucket}/${expression}`).toBe(0)
      }
    }
  })

  it('stays inside the sheet', () => {
    for (const bucket of BUCKETS) {
      for (const expression of EXPRESSIONS) {
        const { x, y } = frameOffset(bucket, expression)
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x + FRAME_WIDTH).toBeLessThanOrEqual(sheetWidth)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y + FRAME_HEIGHT).toBeLessThanOrEqual(6 * FRAME_HEIGHT)
      }
    }
  })

  it('walks down a row per damage bucket', () => {
    const rows = [0, 1, 2, 3, 4].map((b) => frameOffset(b, 'neutral').y)
    expect(rows).toEqual([0, 1, 2, 3, 4].map((r) => r * FRAME_HEIGHT))
  })

  it('gives each expression its own column', () => {
    const cols = EXPRESSIONS.map((e) => frameOffset(0, e).x)
    expect(new Set(cols).size).toBe(EXPRESSIONS.length)
  })

  it('uses the death frame at bucket 5, whatever the expression', () => {
    // Row 5 holds only three frames, so the usual row/column lookup would run
    // off the end of the sheet and blit empty space.
    for (const expression of EXPRESSIONS) {
      expect(frameOffset(5, expression)).toEqual({
        x: 2 * FRAME_WIDTH,
        y: 5 * FRAME_HEIGHT,
      })
    }
  })

  it('clamps a bucket beyond the range rather than sampling off the sheet', () => {
    expect(frameOffset(99, 'neutral')).toEqual(frameOffset(5, 'neutral'))
    expect(frameOffset(-4, 'neutral')).toEqual(frameOffset(0, 'neutral'))
  })

  it('falls back to neutral for an unknown expression', () => {
    expect(frameOffset(0, 'nonsense' as Expression)).toEqual(frameOffset(0, 'neutral'))
  })
})
