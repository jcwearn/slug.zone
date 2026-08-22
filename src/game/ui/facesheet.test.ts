/// <reference types="node" />
// Scoped to this file rather than adding "node" to tsconfig.app.json: the app
// itself is browser code and must not see Node globals. This test reads a
// committed asset from disk, so it is the one place that needs them.
import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { FRAME_HEIGHT, FRAME_WIDTH } from './face.ts'

/**
 * The portrait sheet is a committed binary, which is the one asset in this
 * project that cannot be regenerated from source. These assert the properties
 * the code depends on, so a re-export at the wrong size fails here rather than
 * showing up as a sliced face in the HUD.
 */
describe('public/faces.png', () => {
  const path = 'public/faces.png'
  const buf = readFileSync(path)

  it('is a PNG', () => {
    expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  })

  it('is exactly six frames wide and six tall', () => {
    // IHDR width and height are the first two big-endian u32s of the chunk.
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    expect(width).toBe(6 * FRAME_WIDTH)
    expect(height).toBe(6 * FRAME_HEIGHT)
  })

  it('stays small enough to ship without thought', () => {
    expect(statSync(path).size).toBeLessThan(80 * 1024)
  })
})
