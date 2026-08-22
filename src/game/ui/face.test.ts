import { describe, expect, it } from 'vitest'
import { drawFace, FACE_HEIGHT, FACE_WIDTH, facePixels } from './face.ts'

const BUCKETS = [0, 1, 2, 3, 4, 5]

/** The topmost pixel of a given colour, or null. */
const countOf = (bucket: number, colour: string) =>
  facePixels(bucket).filter((p) => p.colour === colour).length

describe('the pixel grid', () => {
  it('produces pixels for every bucket', () => {
    for (const bucket of BUCKETS) {
      expect(facePixels(bucket).length, `bucket ${bucket}`).toBeGreaterThan(400)
    }
  })

  it('has no transparent gaps enclosed by the head', () => {
    // A stray space inside the silhouette is a hole punched through the face,
    // and at 32x32 it is small enough to miss entirely until someone squints
    // at the HUD. There was exactly one.
    for (const bucket of BUCKETS) {
      const filled = new Set(facePixels(bucket).map((p) => `${p.x},${p.y}`))
      for (let y = 0; y < FACE_HEIGHT; y++) {
        const xs = [...Array(FACE_WIDTH).keys()].filter((x) => filled.has(`${x},${y}`))
        if (xs.length === 0) continue
        for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
          expect(filled.has(`${x},${y}`), `gap at ${x},${y} in bucket ${bucket}`).toBe(true)
        }
      }
    }
  })

  it('sculpts with a real range of tones rather than flat fills', () => {
    // The first version had one skin tone and one hair tone and read as a
    // generic person at any size. Form comes from the ramp, not the resolution.
    const colours = new Set(facePixels(0).map((p) => p.colour))
    expect(colours.size).toBeGreaterThanOrEqual(14)
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
    // Sampled at a known cheek pixel, not by "most common colour" -- the most
    // common colour is now the outline, which is identical in every bucket, so
    // that version reported one distinct tone across all six.
    const cheek = BUCKETS.map((b) => {
      const p = facePixels(b).find((q) => q.x === 8 && q.y === 17)
      expect(p, `no pixel at the cheek sample in bucket ${b}`).toBeDefined()
      return p!.colour
    })
    expect(new Set(cheek).size, 'distinct skin tones across buckets').toBe(BUCKETS.length)
  })

  it('shifts the whole skin ramp together, not one tone', () => {
    // Moving a single tone leaves the face patchy: a drained cheek beside an
    // undrained jaw.
    const sample = (b: number, x: number, y: number) =>
      facePixels(b).find((q) => q.x === x && q.y === y)?.colour
    for (const [x, y] of [
      [8, 17],
      [16, 19],
      [10, 26],
    ] as const) {
      const tones = BUCKETS.map((b) => sample(b, x, y))
      expect(new Set(tones).size, `tone at ${x},${y} should vary by bucket`).toBe(BUCKETS.length)
    }
  })

  it('shows no blood when unhurt and more as it worsens', () => {
    const blood = (b: number) => countOf(b, '#a81e12') + countOf(b, '#7d1409')
    expect(blood(0)).toBe(0)
    expect(blood(1)).toBe(0)
    expect(blood(3)).toBeGreaterThan(blood(2))
    expect(blood(4)).toBeGreaterThan(blood(3))
  })

  it('has open eyes while alive and closed eyes when dead', () => {
    const white = '#f2ece0'
    for (const bucket of [0, 1, 2]) {
      expect(countOf(bucket, white), `bucket ${bucket}`).toBeGreaterThan(0)
    }
    expect(countOf(5, white)).toBe(0)
  })

  it('draws the closed lids inside the portrait when dead', () => {
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
      expect(countOf(bucket, '#2b1d12'), `hair, bucket ${bucket}`).toBeGreaterThan(30)
      expect(countOf(bucket, '#2a1a0e'), `moustache, bucket ${bucket}`).toBeGreaterThan(25)
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
