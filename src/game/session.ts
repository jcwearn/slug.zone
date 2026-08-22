import { cellAt, type Level } from './world/level.ts'

/**
 * One run through a level: the clock and the three tallies.
 *
 * Pure -- no three.js, no DOM, no storage. The intermission screen renders
 * whatever this says, and the counting-up animation lives in `ui/tally.ts`.
 */

export type SessionPhase = 'playing' | 'dead' | 'finished'

export interface Session {
  levelId: string
  phase: SessionPhase
  /**
   * Seconds of GAME time. The loop runs a fixed 1/60 step, so this is
   * deterministic and a backgrounded tab cannot inflate it.
   */
  elapsed: number
  /** Seconds. `level.par` is milliseconds; converted once, here. */
  par: number
  kills: number
  killsTotal: number
  items: number
  itemsTotal: number
  secrets: number
  secretsTotal: number
}

export function createSession(level: Level, killsTotal: number, itemsTotal: number): Session {
  return {
    levelId: level.id,
    phase: 'playing',
    elapsed: 0,
    par: level.par / 1000,
    kills: 0,
    killsTotal,
    items: 0,
    itemsTotal,
    secrets: 0,
    secretsTotal: level.secretCount,
  }
}

/**
 * Advance the clock, but only while the level is actually being played.
 *
 * Without the phase guard the clock runs on through the tally screen, so the
 * time you are shown is not the time you took and the best time saved is
 * whatever you happened to be looking at when you pressed fire.
 */
export function tickRun(session: Session, dt: number): void {
  if (session.phase !== 'playing') return
  session.elapsed += dt
}

export function finishLevel(session: Session): void {
  if (session.phase === 'playing') session.phase = 'finished'
}

/**
 * A tally as a whole percentage.
 *
 * Nothing out of nothing is 100, not NaN -- a level with no secrets in it has
 * had all of its secrets found. Floored rather than rounded, so 2 of 3 reads
 * 66: showing 100% for a level you have not actually cleared is the one
 * mistake a completion percentage cannot make.
 */
export function percent(got: number, total: number): number {
  if (total <= 0) return 100
  return Math.floor((got / total) * 100)
}

/** M:SS. Every glyph is already in the bitmap font. */
export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * Whether the player is standing on the exit.
 *
 * The centre cell, not the swept circle. The player's radius lets their edge
 * poke into the exit from the corridor outside it, and ending a level by
 * brushing past its doorway is maddening.
 */
export function atExit(level: Level, x: number, z: number): boolean {
  return Boolean(cellAt(level, Math.floor(x), Math.floor(z))?.exit)
}
