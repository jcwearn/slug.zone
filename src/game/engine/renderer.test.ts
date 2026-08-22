import { describe, expect, it } from 'vitest'
import { fitViewport, RT_HEIGHT, RT_WIDTH } from './renderer.ts'

describe('fitViewport', () => {
  it('picks the largest whole-number scale that fits', () => {
    expect(fitViewport(1280, 800).scale).toBe(4)
    expect(fitViewport(1920, 1080).scale).toBe(5)
    expect(fitViewport(640, 400).scale).toBe(2)
  })

  it('never returns a fractional scale', () => {
    // 800/320 = 2.5. A 2.5x upscale makes some source pixels two screen pixels
    // wide and others three, which shimmers when the camera turns -- the whole
    // reason this is floored rather than fitted.
    const { scale, width } = fitViewport(800, 700)
    expect(Number.isInteger(scale)).toBe(true)
    expect(scale).toBe(2)
    expect(width).toBe(RT_WIDTH * 2)
  })

  it('is limited by whichever axis is tighter', () => {
    // Wide but short: height decides.
    expect(fitViewport(4000, 420).scale).toBe(2)
    // Tall but narrow: width decides.
    expect(fitViewport(700, 4000).scale).toBe(2)
  })

  it('centres vertically', () => {
    const { height, marginTop } = fitViewport(1280, 900)
    expect(marginTop).toBeCloseTo((900 - height) / 2, 9)
  })

  it('clamps to 1x rather than going sub-pixel on a tiny viewport', () => {
    const fit = fitViewport(200, 150)
    expect(fit.scale).toBe(1)
    expect(fit.width).toBe(RT_WIDTH)
    expect(fit.height).toBe(RT_HEIGHT)
  })

  it('never reports a negative margin when the canvas overflows', () => {
    expect(fitViewport(200, 150).marginTop).toBe(0)
  })
})
