import { describe, expect, it } from 'vitest'
import { drawFace, FACE_HEIGHT, FACE_WIDTH, facePixels } from './face.ts'

const BUCKETS = [0, 1, 2, 3, 4, 5]

/** The topmost pixel of a given colour, or null. */
const countOf = (bucket: number, colour: string) =>
  facePixels(bucket).filter((p) => p.colour === colour).length

describe('the pixel grid', () => {
  it('produces pixels for every bucket', () => {
    for (const bucket of BUCKETS) {
      expect(facePixels(bucket).length, `bucket ${bucket}`).toBeGreaterThan(200)
    }
  })

  it('keeps every pixel inside the portrait, so it cannot bleed into the HUD', () => {
    for (const bucket of BUCKETS) {
      for (const pixel of facePixels(bucket)) {
        expect(pixel.x, `bucket ${bucket}`).toBeGreaterThanOrEqual(0)
        expect(pixel.x).toBeLessThan(FACE_WIDTH)
        expect(pixel.y).toBeGreaterThanOrEqual(0)
        expect(pixel.y).toBeLessThan(FACE_HEIGHT)
      }
    }
  })

  it('gives every pixel a real colour', () => {
    for (const bucket of BUCKETS) {
      for (const pixel of facePixels(bucket)) {
        expect(pixel.colour, `bucket ${bucket} at ${pixel.x},${pixel.y}`).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it('clamps a bucket outside the range rather than drawing nothing', () => {
    expect(facePixels(-3).length).toBe(facePixels(0).length)
    expect(facePixels(99).length).toBe(facePixels(5).length)
  })
})

describe('damage states', () => {
  it('drains the skin tone as health drops', () => {
    // Each bucket must have its own skin, or four of the six portraits are
    // indistinguishable and the face stops being readable at a glance.
    const skins = BUCKETS.map((b) => {
      const counts = new Map<string, number>()
      for (const p of facePixels(b)) counts.set(p.colour, (counts.get(p.colour) ?? 0) + 1)
      return [...counts.entries()].sort((a, b2) => b2[1] - a[1])[0][0]
    })
    expect(new Set(skins).size).toBe(BUCKETS.length)
  })

  it('shows no blood when unhurt and more as it worsens', () => {
    const blood = (b: number) => countOf(b, '#a51f14') + countOf(b, '#8e1a11')
    expect(blood(0)).toBe(0)
    expect(blood(1)).toBe(0)
    expect(blood(3)).toBeGreaterThan(blood(2))
    expect(blood(4)).toBeGreaterThan(blood(3))
  })

  it('has open eyes while alive and crossed-out eyes when dead', () => {
    const white = '#efe7d8'
    for (const bucket of [0, 1, 2]) {
      expect(countOf(bucket, white), `bucket ${bucket}`).toBeGreaterThan(0)
    }
    expect(countOf(5, white)).toBe(0)
  })

  it('draws the crossings inside the portrait when dead', () => {
    const dead = facePixels(5)
    expect(dead.length).toBeGreaterThan(200)
    for (const pixel of dead) {
      expect(pixel.x).toBeLessThan(FACE_WIDTH)
      expect(pixel.y).toBeLessThan(FACE_HEIGHT)
    }
  })

  it('keeps the hair and moustache across every state', () => {
    // The likeness has to survive being hurt -- it is the same person.
    for (const bucket of BUCKETS) {
      expect(countOf(bucket, '#2e2016'), `hair, bucket ${bucket}`).toBeGreaterThan(30)
      expect(countOf(bucket, '#2a1c12'), `moustache, bucket ${bucket}`).toBeGreaterThan(15)
    }
  })
})

describe('drawFace', () => {
  it('draws one rect per pixel at the requested scale and offset', () => {
    const rects: [number, number, number, number][] = []
    const ctx = {
      fillStyle: '',
      fillRect: (x: number, y: number, w: number, h: number) => rects.push([x, y, w, h]),
    } as unknown as CanvasRenderingContext2D

    drawFace(ctx, 0, 10, 20, 2)
    expect(rects.length).toBe(facePixels(0).length)
    for (const [x, y, w, h] of rects) {
      expect(w).toBe(2)
      expect(h).toBe(2)
      expect(x).toBeGreaterThanOrEqual(10)
      expect(x).toBeLessThan(10 + FACE_WIDTH * 2)
      expect(y).toBeGreaterThanOrEqual(20)
      expect(y).toBeLessThan(20 + FACE_HEIGHT * 2)
    }
  })
})
