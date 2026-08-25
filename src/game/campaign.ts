import type { PlayerHealth } from './player/health.ts'
import type { Arsenal } from './weapons/arsenal.ts'
import { nextLevel } from './world/levels/index.ts'
import type { LevelSource } from './world/types.ts'

/**
 * What happens when a level ends, and what the player takes with them.
 *
 * Pure: no three.js, no DOM, no storage -- the same split `session.ts` and
 * `tally.ts` use. The point is that "keycards do not carry between levels" is a
 * unit test rather than a line in `main.ts` that someone can delete while
 * tidying, because the consequence of deleting it is a level whose locked door
 * is already open and whose design silently stops working.
 */

export type Onward =
  | { kind: 'advance'; next: LevelSource }
  /**
   * The end of the episode, or a level that is not in the registry at all.
   * Replaying is what the game did before there was anywhere else to go, and
   * an end-of-episode screen is not this change's job.
   */
  | { kind: 'replay' }

export function onward(finishedId: string): Onward {
  const next = nextLevel(finishedId)
  return next ? { kind: 'advance', next } : { kind: 'replay' }
}

/**
 * Carry the player into the next level: Doom's rule.
 *
 * You keep what you are holding -- health, armour, weapons, ammo -- and lose
 * what the level gave you. Keys are taken here rather than left to the caller
 * for the reason above.
 *
 * Two sets of transient state have to be cleared even though the things
 * carrying them survive. `painFlash` and `immunity` would otherwise arrive on
 * the next level as a red screen and a moment of invulnerability. The weapon
 * phase would arrive mid-switch, leaving the viewmodel stuck lowering and
 * `lastPhase` desynced so the switch sound fires at nothing.
 *
 * Note what is NOT here: a pistol start on death. Dying restarts the level you
 * are on with a fresh arsenal, which means every level has to be beatable from
 * a Salt Shaker and nothing else. That is an authoring constraint no test can
 * check.
 */
export function carryInto(health: PlayerHealth, arsenal: Arsenal, keys: Set<string>): void {
  health.immunity = 0
  health.justDied = false
  health.dead = false
  health.painFlash = 0

  arsenal.pending = null
  arsenal.phase = 'ready'
  arsenal.timer = 0
  arsenal.cooldown = 0

  keys.clear()
}
