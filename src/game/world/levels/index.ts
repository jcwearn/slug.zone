import type { LevelSource } from '../types.ts'
import e1m1 from './e1m1.ts'
import e1m2 from './e1m2.ts'
import e1m3 from './e1m3.ts'

/**
 * The episode, in order.
 *
 * Position in this array IS the progression. There is no `next` field on a
 * level, because two levels naming the same successor is a state an array
 * cannot represent and a field can -- and the failure would be a silent loop
 * rather than an error.
 *
 * Nothing globs the directory: the order has to be readable, and a file that
 * is present but not listed should be a test failure rather than something
 * that quietly joins the episode. `level.test.ts` holds that both ways.
 */
export const LEVELS: readonly LevelSource[] = [e1m1, e1m2, e1m3]

export function levelIndex(id: string): number {
  return LEVELS.findIndex((level) => level.id === id)
}

export function levelById(id: string): LevelSource | undefined {
  return LEVELS[levelIndex(id)]
}

/**
 * The level after `id`, or null at the end of the episode.
 *
 * An unknown id is also null rather than an error. This is read on the
 * intermission screen -- the one moment the player has just won something --
 * and `save/scores.ts` already sets the precedent that nothing on that path
 * throws.
 */
export function nextLevel(id: string): LevelSource | null {
  const at = levelIndex(id)
  if (at < 0) return null
  return LEVELS[at + 1] ?? null
}
