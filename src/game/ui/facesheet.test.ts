/// <reference types="node" />
// Scoped to this file rather than adding "node" to tsconfig.app.json: the app
// itself is browser code and must not see Node globals. This test reads a
// committed asset from disk, so it is the one place that needs them.

import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { FRAME_HEIGHT, FRAME_WIDTH } from './face.ts'

/**
 * The portrait sheet is a committed binary and the one asset here that cannot
 * be regenerated from source, so its invariants are asserted rather than
 * assumed. A re-export at the wrong size or with a stray band of the source
 * page still attached fails here instead of showing up as a sliced or
 * white-streaked portrait in the HUD.
 */

const PATH = 'public/faces.png'
const buf = readFileSync(PATH)

/** Minimal PNG reader: 8-bit RGBA, non-interlaced, which is what we write. */
function decode() {
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const colourType = buf[25]

  let off = 8
  const idat: Buffer[] = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len))
    if (type === 'IEND') break
    off += 12 + len
  }

  const bpp = colourType === 6 ? 4 : 3
  const stride = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const out = Buffer.alloc(height * stride)

  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= bpp ? prev[i - bpp] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[i] = v & 0xff
    }
  }
  return { width, height, bpp, stride, data: out }
}

describe('public/faces.png', () => {
  it('is a PNG', () => {
    expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  it('is exactly six frames wide and six tall', () => {
    expect(buf.readUInt32BE(16)).toBe(6 * FRAME_WIDTH)
    expect(buf.readUInt32BE(20)).toBe(6 * FRAME_HEIGHT)
  })

  it('stays small enough to ship without thought', () => {
    expect(statSync(PATH).size).toBeLessThan(80 * 1024)
  })

  it('has no leftover gutter in any frame', () => {
    // The extraction crops each face out of a white page, and a leftover row or
    // column of that page is the characteristic failure -- a pale strip down
    // the side of the portrait.
    //
    // Checked as a MEAN across the line, because the line that actually caused
    // this is half gutter and half cheek: no single pixel is white enough to
    // fail a per-pixel test, but the average is exactly what a downsample
    // produces and it is obviously wrong on screen.
    const img = decode()
    const bright = (x: number, y: number) => {
      const i = y * img.stride + x * img.bpp
      return (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3
    }

    const offenders: string[] = []
    // Row 5 holds only three frames; the rest of it is intentionally empty.
    const filled = (r: number, c: number) => r < 5 || c < 3

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (!filled(r, c)) continue
        const x0 = c * FRAME_WIDTH
        const y0 = r * FRAME_HEIGHT

        for (let dx = 0; dx < FRAME_WIDTH; dx++) {
          let sum = 0
          for (let dy = 0; dy < FRAME_HEIGHT; dy++) sum += bright(x0 + dx, y0 + dy)
          if (sum / FRAME_HEIGHT > 200) offenders.push(`r${r}c${c} column ${dx}`)
        }
        for (let dy = 0; dy < FRAME_HEIGHT; dy++) {
          let sum = 0
          for (let dx = 0; dx < FRAME_WIDTH; dx++) sum += bright(x0 + dx, y0 + dy)
          if (sum / FRAME_WIDTH > 200) offenders.push(`r${r}c${c} row ${dy}`)
        }
      }
    }
    expect(offenders, 'lines bright enough to be leftover page').toEqual([])
  })

  it('has no holes punched through the faces', () => {
    // An earlier extraction cleared every near-white pixel to transparent to
    // catch gutter fragments, and took the glasses' lens highlights and the
    // brightest skin with it -- the portraits came out full of gaps. Every
    // frame that should hold a face must be solid.
    const img = decode()
    if (img.bpp !== 4) return

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (!(r < 5 || c < 3)) continue
        let clear = 0
        for (let dy = 0; dy < FRAME_HEIGHT; dy++) {
          for (let dx = 0; dx < FRAME_WIDTH; dx++) {
            const i = (r * FRAME_HEIGHT + dy) * img.stride + (c * FRAME_WIDTH + dx) * 4
            if (img.data[i + 3] < 255) clear++
          }
        }
        expect(clear, `frame r${r}c${c} has transparent pixels`).toBe(0)
      }
    }
  })
})
