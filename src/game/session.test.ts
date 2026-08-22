import { describe, expect, it } from 'vitest'
import { atExit, createSession, finishLevel, formatTime, percent, tickRun } from './session.ts'
import { parseLevel } from './world/level.ts'
import e1m1 from './world/levels/e1m1.ts'

const level = parseLevel(e1m1)

describe('percent', () => {
  it('calls nothing out of nothing a clean sweep', () => {
    // A level with no secrets in it has had all of its secrets found. The
    // alternative is `NaN%` on the intermission screen.
    expect(percent(0, 0)).toBe(100)
  })

  it('floors rather than rounds', () => {
    // 2 of 3 is 66. Rounding shows 67, and two thirds of the way through a
    // level rounding up towards 100 is the one lie a completion percentage
    // must not tell.
    expect(percent(2, 3)).toBe(66)
    expect(percent(5, 6)).toBe(83)
  })

  it('is 100 only when the total is actually reached', () => {
    expect(percent(3, 3)).toBe(100)
    expect(percent(99, 100)).toBe(99)
  })

  it('is 0 for nothing found', () => {
    expect(percent(0, 7)).toBe(0)
  })
})

describe('formatTime', () => {
  it('zero-pads the seconds', () => {
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(74.35)).toBe('1:14')
  })

  it('handles the ends', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(59.99)).toBe('0:59')
    expect(formatTime(600)).toBe('10:00')
  })

  it('never shows a negative clock', () => {
    expect(formatTime(-5)).toBe('0:00')
  })
})

describe('createSession', () => {
  it('converts par from milliseconds to seconds', () => {
    // level.par is 90_000. Comparing that against an elapsed in seconds would
    // put the par at twenty-five hours.
    const session = createSession(level, 4, 8)
    expect(session.par).toBe(90)
    expect(level.par).toBe(90_000)
  })

  it('takes the secret total from the level itself', () => {
    expect(createSession(level, 4, 8).secretsTotal).toBe(level.secretCount)
  })

  it('starts at zero and playing', () => {
    const session = createSession(level, 4, 8)
    expect(session.elapsed).toBe(0)
    expect(session.phase).toBe('playing')
    expect([session.kills, session.items, session.secrets]).toEqual([0, 0, 0])
  })
})

describe('tickRun', () => {
  it('advances while playing', () => {
    const session = createSession(level, 4, 8)
    tickRun(session, 0.5)
    tickRun(session, 0.25)
    expect(session.elapsed).toBeCloseTo(0.75, 6)
  })

  it('stops the moment the level is finished', () => {
    // Otherwise the clock runs on through the tally screen, so the time shown
    // is not the time taken and the best time saved is whatever the player
    // happened to be looking at when they pressed fire.
    const session = createSession(level, 4, 8)
    tickRun(session, 10)
    finishLevel(session)
    tickRun(session, 30)
    expect(session.elapsed).toBe(10)
  })

  it('stops while dead', () => {
    const session = createSession(level, 4, 8)
    session.phase = 'dead'
    tickRun(session, 5)
    expect(session.elapsed).toBe(0)
  })
})

describe('finishLevel', () => {
  it('does not resurrect a run that ended in death', () => {
    const session = createSession(level, 4, 8)
    session.phase = 'dead'
    finishLevel(session)
    expect(session.phase).toBe('dead')
  })
})

describe('atExit', () => {
  const exit = level.cells.find((c) => c.exit)!

  it('is true standing on the exit cell', () => {
    expect(atExit(level, exit.x + 0.5, exit.z + 0.5)).toBe(true)
  })

  it('is false in the cell next door', () => {
    // The centre cell, not the swept circle: the player's radius lets their
    // edge poke into the exit from outside it, and finishing a level by
    // brushing past its doorway is maddening.
    expect(atExit(level, exit.x - 0.02, exit.z + 0.5)).toBe(false)
  })

  it('is false off the grid entirely', () => {
    expect(atExit(level, -5, -5)).toBe(false)
  })
})
