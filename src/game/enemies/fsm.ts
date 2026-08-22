import type { EnemyDef, EnemyState } from './types.ts'

/**
 * The shared enemy state machine.
 *
 * Pure: it takes what the enemy can perceive and returns the next state plus
 * what it wants to do. No three.js, no level, no audio. Every enemy type runs
 * this same machine with different numbers, so a transition bug is one bug
 * rather than seven, and the awkward cases -- dying mid-windup, taking a hit
 * during a stagger, losing sight mid-chase -- are unit tests instead of
 * something you hope to notice while playing.
 *
 *   idle -> alert -> chase -> attack
 *     ^                 |       |
 *     +----- (lost) ----+       v
 *   any live state -> pain -> chase
 *   any live state -> dying -> dead
 */

export interface EnemyMind {
  state: EnemyState
  hp: number
  /** Seconds left in whatever timed state it is in. */
  timer: number
  /** Seconds until it may attack again. */
  attackCooldown: number
  /** Set once it has ever seen the player; it does not go back to idle. */
  provoked: boolean
  /** True while an attack's windup has completed this tick. */
  didStrike: boolean
  /** True on the tick it entered dying. */
  justDied: boolean
  /** True if that death was a gib. */
  gibbed: boolean
}

export interface Perception {
  /** Straight-line distance to the player, grid units. */
  distance: number
  /** Clear line of sight, ignoring the sight cone. */
  hasLineOfSight: boolean
  /** Absolute angle between its facing and the player, radians. */
  angleToPlayer: number
}

export function createMind(def: EnemyDef): EnemyMind {
  return {
    state: 'idle',
    hp: def.hp,
    timer: 0,
    attackCooldown: 0,
    provoked: false,
    didStrike: false,
    justDied: false,
    gibbed: false,
  }
}

export const isAlive = (mind: EnemyMind) => mind.state !== 'dying' && mind.state !== 'dead'

/** Can it currently see the player: line of sight, in range, within its cone. */
export function canSee(def: EnemyDef, perception: Perception): boolean {
  return (
    perception.hasLineOfSight &&
    perception.distance <= def.sightRange &&
    perception.angleToPlayer <= def.sightCone
  )
}

/**
 * Apply damage.
 *
 * Pain is rolled, not guaranteed. Guaranteed stagger means a fast enough weapon
 * locks an enemy in place permanently -- the classic chaingun stunlock -- and
 * removes any reason to move. It is also why the roll takes an injected rng:
 * "does this weapon stunlock" is a question worth answering in a test.
 */
export function damage(mind: EnemyMind, def: EnemyDef, amount: number, rng: () => number): void {
  if (!isAlive(mind)) return

  mind.hp -= amount
  mind.provoked = true

  if (mind.hp <= 0) {
    mind.state = 'dying'
    mind.timer = def.dyingTime
    mind.justDied = true
    mind.gibbed = amount >= def.gibThreshold
    return
  }

  if (rng() < def.painChance) {
    mind.state = 'pain'
    mind.timer = def.painTime
  }
}

export interface Intent {
  /** Should it move toward the player this tick. */
  move: boolean
  /** Should it turn to face the player. */
  turn: boolean
}

/**
 * Advance one fixed step. Returns what the enemy wants to do; the caller owns
 * actually moving it, because movement needs the level and collision.
 */
export function step(mind: EnemyMind, def: EnemyDef, perception: Perception, dt: number): Intent {
  mind.didStrike = false
  mind.justDied = false

  if (mind.state === 'dead') return { move: false, turn: false }

  mind.attackCooldown = Math.max(0, mind.attackCooldown - dt)

  if (mind.state === 'dying') {
    mind.timer -= dt
    if (mind.timer <= 0) mind.state = 'dead'
    return { move: false, turn: false }
  }

  const sees = canSee(def, perception)
  if (sees) mind.provoked = true

  switch (mind.state) {
    case 'idle':
      if (sees) {
        mind.state = 'alert'
        mind.timer = def.reactionTime
      }
      // Turning while idle would make it track the player before noticing
      // them, which reads as the enemy cheating.
      return { move: false, turn: false }

    case 'alert':
      mind.timer -= dt
      if (mind.timer <= 0) mind.state = 'chase'
      // Turns during the reaction beat, so the wind-up is visible.
      return { move: false, turn: true }

    case 'pain':
      mind.timer -= dt
      if (mind.timer <= 0) mind.state = 'chase'
      return { move: false, turn: false }

    case 'chase':
      if (perception.distance <= def.attackRange && perception.hasLineOfSight) {
        if (mind.attackCooldown <= 0) {
          mind.state = 'attack'
          mind.timer = def.attackWindup
          return { move: false, turn: true }
        }
        // In range but reloading: hold position rather than shuffling into
        // the player's face.
        return { move: false, turn: true }
      }
      // Keeps chasing once provoked even with sight broken, so breaking line
      // of sight is cover rather than an off switch.
      return { move: mind.provoked, turn: true }

    case 'attack':
      mind.timer -= dt
      if (mind.timer <= 0) {
        // The strike lands at the END of the windup, which is what makes the
        // telegraph mean something: step out of range during it and it misses.
        mind.didStrike = perception.distance <= def.attackRange && perception.hasLineOfSight
        mind.attackCooldown = def.attackCooldown
        mind.state = 'chase'
      }
      return { move: false, turn: true }

    default:
      return { move: false, turn: false }
  }
}
