import { describe, expect, it } from 'vitest'
import { drawText, hasGlyph, measureText } from './font.ts'
import { ENEMIES } from '../enemies/definitions.ts'
import { WEAPONS } from '../weapons/definitions.ts'

/** Records fillRect calls so drawing can be checked without a canvas. */
function fakeContext() {
  const rects: [number, number, number, number][] = []
  const ctx = {
    fillStyle: '',
    fillRect: (x: number, y: number, w: number, h: number) => rects.push([x, y, w, h]),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects }
}

describe('measureText', () => {
  it('is zero for an empty string', () => {
    expect(measureText('')).toBe(0)
  })

  it('has no trailing gap after the last glyph', () => {
    // 5px glyph, 1px tracking: one glyph is 5 wide, not 6.
    expect(measureText('A', 1, 1)).toBe(5)
    expect(measureText('AB', 1, 1)).toBe(11)
  })

  it('scales', () => {
    expect(measureText('AB', 2, 1)).toBe(22)
  })
})

describe('drawText', () => {
  it('draws one rect per lit pixel', () => {
    const { ctx, rects } = fakeContext()
    drawText(ctx, 'I', 0, 0, '#fff', 1)
    expect(rects.length).toBeGreaterThan(0)
    for (const [, , w, h] of rects) {
      expect(w).toBe(1)
      expect(h).toBe(1)
    }
  })

  it('draws nothing at all for a space', () => {
    const { ctx, rects } = fakeContext()
    drawText(ctx, ' ', 0, 0, '#fff', 1)
    expect(rects).toHaveLength(0)
  })

  it('keeps every pixel inside the glyph box', () => {
    const { ctx, rects } = fakeContext()
    drawText(ctx, 'W', 10, 20, '#fff', 3)
    for (const [x, y, w, h] of rects) {
      expect(x).toBeGreaterThanOrEqual(10)
      expect(x + w).toBeLessThanOrEqual(10 + 5 * 3)
      expect(y).toBeGreaterThanOrEqual(20)
      expect(y + h).toBeLessThanOrEqual(20 + 7 * 3)
    }
  })

  it('is case-insensitive', () => {
    const upper = fakeContext()
    drawText(upper.ctx, 'ABC', 0, 0, '#fff', 1)
    const lower = fakeContext()
    drawText(lower.ctx, 'abc', 0, 0, '#fff', 1)
    expect(lower.rects).toEqual(upper.rects)
  })

  it('renders an unknown character as a visible box, not a blank', () => {
    // A missing glyph that draws nothing looks like a bug in the HUD layout
    // rather than a missing glyph.
    const { ctx, rects } = fakeContext()
    drawText(ctx, '@', 0, 0, '#fff', 1)
    expect(rects.length).toBeGreaterThan(0)
  })
})

describe('glyph coverage', () => {
  it('covers every character the HUD actually shows', () => {
    const strings = [
      'HEALTH',
      'ARMOUR',
      '0123456789',
      '%',
      '--',
      ...Object.values(WEAPONS).map((w) => w.name.toUpperCase()),
      ...Object.values(ENEMIES).map((e) => e.name.toUpperCase()),
    ]
    const missing = new Set<string>()
    for (const text of strings) {
      for (const ch of text) if (!hasGlyph(ch)) missing.add(ch)
    }
    expect([...missing], 'characters with no glyph').toEqual([])
  })
})
