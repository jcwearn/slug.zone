import { describe, expect, it } from 'vitest'
import { MAX_SPAN, minimapLayout } from './minimap.ts'

describe('minimapLayout', () => {
  it('grows a small level up to the largest whole scale that fits', () => {
    expect(minimapLayout({ width: 10, height: 8 }).scale).toBe(5)
  })

  it('never scales above 5, however small the level', () => {
    // A three-cell closet drawn at 22 pixels per cell would be a bigger map
    // than the biggest level's.
    expect(minimapLayout({ width: 3, height: 3 }).scale).toBe(5)
  })

  it('shrinks to fit as the level grows', () => {
    const small = minimapLayout({ width: 12, height: 12 }).scale
    const large = minimapLayout({ width: 30, height: 30 }).scale
    expect(large).toBeLessThan(small)
  })

  it('measures against the longer side, not the width', () => {
    // A tall thin level scaled by its width would run off the bottom of the
    // screen instead of off the side, which is the same bug wearing a hat.
    const tall = minimapLayout({ width: 8, height: 30 })
    const wide = minimapLayout({ width: 30, height: 8 })
    expect(tall.scale).toBe(wide.scale)
    expect(Math.max(tall.width, tall.height)).toBeLessThanOrEqual(MAX_SPAN)
  })

  it('sizes the canvas as cells times scale', () => {
    const layout = minimapLayout({ width: 26, height: 22 })
    expect(layout.width).toBe(26 * layout.scale)
    expect(layout.height).toBe(22 * layout.scale)
  })

  it('holds the two-pixel floor', () => {
    // Below two, a wall and the corridor beside it are the same line.
    expect(minimapLayout({ width: 200, height: 200 }).scale).toBe(2)
  })

  it('overflows the screen once a level passes 33 cells', () => {
    // Documenting a real limit rather than pretending it is not there. The
    // scale floor beats MAX_SPAN, so past 33 the map overhangs its corner. No
    // shipped level is near it -- `level.test.ts` holds that -- and the fix
    // when one is would be to allow a 1px scale for huge maps, not to let this
    // pass silently.
    expect(Math.max(...Object.values(minimapLayout({ width: 34, height: 34 })))).toBeGreaterThan(
      MAX_SPAN,
    )
    expect(minimapLayout({ width: 33, height: 33 }).width).toBeLessThanOrEqual(MAX_SPAN)
  })
})
