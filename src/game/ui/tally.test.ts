import { describe, expect, it } from 'vitest'
import { createTally, pressTally, READ_TIME, snapTally, stepTally } from './tally.ts'
import { createSession, type Session } from '../session.ts'
import { parseLevel } from '../world/level.ts'
import e1m1 from '../world/levels/e1m1.ts'

const level = parseLevel(e1m1)
const STEP = 1 / 60

/**
 * A finished run, with a par fixed here rather than taken from E1M1.
 *
 * These are tests about counting and formatting; pinning them to whatever par
 * the first level currently ships with makes retuning a level fail the tally
 * suite for no reason.
 */
const PAR_MS = 90_000

function run(kills = 4, killsTotal = 4, items = 4, itemsTotal = 8): Session {
  const session = createSession({ ...level, par: PAR_MS }, killsTotal, itemsTotal)
  session.kills = kills
  session.items = items
  session.secrets = 1
  session.elapsed = 74.35
  return session
}

/** Tick until the tally is done, or give up. Returns how many digits clicked. */
function toEnd(tally: ReturnType<typeof createTally>): { ticks: number; frames: number } {
  let ticks = 0
  let frames = 0
  while (!tally.done && frames < 10_000) {
    if (stepTally(tally, STEP).ticked) ticks++
    frames++
  }
  return { ticks, frames }
}

describe('createTally', () => {
  it('starts every row at zero', () => {
    const tally = createTally(run(), null, false)
    expect(tally.rows.map((r) => r.value)).toEqual([0, 0, 0])
    expect(tally.done).toBe(false)
  })

  it('targets the percentages the session actually holds', () => {
    const tally = createTally(run(4, 4, 4, 8), null, false)
    expect(tally.rows.map((r) => r.target)).toEqual([100, 50, 100])
  })

  it('formats the times, and leaves best blank until there is one', () => {
    expect(createTally(run(), null, false).best).toBe('')
    expect(createTally(run(), 61, false).best).toBe('1:01')
    expect(createTally(run(), 61, false).time).toBe('1:14')
    expect(createTally(run(), 61, false).par).toBe('1:30')
  })
})

describe('stepTally', () => {
  it('fills one row at a time', () => {
    // The sequential reveal is the whole character of the screen. Advancing
    // every row together makes it a static readout that fades in.
    const tally = createTally(run(4, 4, 4, 8), null, false)
    stepTally(tally, STEP * 4)
    expect(tally.rows[0].value).toBeGreaterThan(0)
    expect(tally.rows[1].value).toBe(0)
    expect(tally.rows[2].value).toBe(0)
  })

  it('never overshoots a target', () => {
    const tally = createTally(run(4, 4, 4, 8), null, false)
    for (let i = 0; i < 400; i++) {
      stepTally(tally, STEP)
      for (const row of tally.rows) expect(row.value).toBeLessThanOrEqual(row.target)
    }
  })

  it('finishes, and says so exactly once', () => {
    const tally = createTally(run(), null, false)
    let finishes = 0
    for (let i = 0; i < 600; i++) if (stepTally(tally, STEP).finished) finishes++
    expect(tally.done).toBe(true)
    expect(finishes).toBe(1)
    expect(tally.rows.map((r) => r.value)).toEqual(tally.rows.map((r) => r.target))
  })

  it('clicks once per changed digit, not once per frame', () => {
    // A click every frame at 60fps is not a tally, it is a buzz. The count of
    // ticks must track the numbers climbed, not the frames spent climbing.
    const tally = createTally(run(4, 4, 4, 8), null, false)
    const climbed = tally.rows.reduce((n, r) => n + r.target, 0)
    const { ticks, frames } = toEnd(tally)

    expect(frames).toBeGreaterThan(ticks)
    // One per integer crossed, plus the frame each row lands on.
    expect(ticks).toBeLessThanOrEqual(climbed + tally.rows.length)
    expect(ticks).toBeGreaterThan(climbed / 2)
  })

  it('does not click on a row that has nothing to count', () => {
    const tally = createTally(run(0, 4, 0, 8), null, false)
    tally.rows[2].target = 0
    const { ticks } = toEnd(tally)
    expect(ticks).toBeLessThanOrEqual(tally.rows.length)
  })

  it('holds after finishing rather than doing anything further', () => {
    const tally = createTally(run(), null, false)
    toEnd(tally)
    const snapshot = tally.rows.map((r) => r.value)
    const step = stepTally(tally, STEP)
    expect(step).toEqual({ ticked: false, finished: false })
    expect(tally.rows.map((r) => r.value)).toEqual(snapshot)
    expect(tally.hold).toBeGreaterThan(0)
  })
})

describe('snapTally', () => {
  it('jumps straight to the end', () => {
    const tally = createTally(run(4, 4, 4, 8), null, false)
    stepTally(tally, STEP)
    snapTally(tally)
    expect(tally.done).toBe(true)
    expect(tally.rows.map((r) => r.value)).toEqual(tally.rows.map((r) => r.target))
  })

  it('resets the hold, so the same click cannot also restart the level', () => {
    const tally = createTally(run(), null, false)
    toEnd(tally)
    stepTally(tally, 5)
    snapTally(tally)
    expect(tally.hold).toBe(0)
  })
})

describe('pressTally', () => {
  it('skips the count-up while it is still counting', () => {
    const tally = createTally(run(), null, false)
    expect(pressTally(tally)).toBe('snap')
    stepTally(tally, STEP)
    expect(pressTally(tally)).toBe('snap')
  })

  it('ignores the click that finished the level', () => {
    // The fire button is still down from whatever was shot last. Without the
    // hold, the press that skipped the count-up also restarts, and the tally
    // is gone before anyone can read it.
    const tally = createTally(run(), null, false)
    snapTally(tally)
    expect(tally.hold).toBe(0)
    expect(pressTally(tally)).toBe('ignored')
  })

  it('replays once the tally has been up long enough to read', () => {
    const tally = createTally(run(), null, false)
    snapTally(tally)
    for (let t = 0; t <= READ_TIME + STEP; t += STEP) stepTally(tally, STEP)
    expect(pressTally(tally)).toBe('restart')
  })

  it('holds the line right at the threshold', () => {
    const tally = createTally(run(), null, false)
    snapTally(tally)
    stepTally(tally, READ_TIME)
    expect(pressTally(tally), 'exactly at the threshold is still too soon').toBe('ignored')
    stepTally(tally, STEP)
    expect(pressTally(tally)).toBe('restart')
  })
})
