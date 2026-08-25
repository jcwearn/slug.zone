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
 * Has a wind-up gone far enough that the swing can no longer be taken off it?
 *
 * Rolling the pain chance is not enough on its own. A stagger overwrites
 * `timer`, which IS the wind-up clock, so the pending strike is discarded --
 * and because `attackCooldown` keeps running through the stagger, the creature
 * restarts a FULL wind-up the instant it recovers. A weapon that fires faster
 * than the wind-up completes therefore deletes attacks in a loop, and the
 * creature dies having never once hit back.
 *
 * That is not a health problem and cannot be fixed with one: over 400 seeded
 * lives a Grub landed a hit in 0% of them, and tripling every health pool in
 * the roster still left it silent in 91%. It is a race between the wind-up and
 * the trigger, so the fix belongs at the wind-up.
 */
function committed(mind: EnemyMind, def: EnemyDef): boolean {
  if (mind.state !== 'attack' || def.attackWindup <= 0) return false
  const progress = 1 - mind.timer / def.attackWindup
  return progress >= def.commitAt
}

/**
 * Apply damage.
 *
 * Pain is rolled, not guaranteed. Guaranteed stagger means a fast enough weapon
 * locks an enemy in place permanently -- the classic chaingun stunlock -- and
 * removes any reason to move. It is also why the roll takes an injected rng:
 * "does this weapon stunlock" is a question worth answering in a test.
 *
 * A committed swing is immune to the stagger but NOT to the damage: shoot it
 * early and you interrupt it, shoot it late and you wear the hit even if the
 * shot kills it. Dying still beats commitment -- a corpse does not swing.
 */
export function damage(mind: EnemyMind, def: EnemyDef, amount: number, rng: () => number): void {
  if (!isAlive(mind)) return

  const locked = committed(mind, def)

  mind.hp -= amount
  mind.provoked = true

  if (mind.hp <= 0) {
    mind.state = 'dying'
    mind.timer = def.dyingTime
    mind.justDied = true
    mind.gibbed = amount >= def.gibThreshold
    return
  }

  if (!locked && rng() < def.painChance) {
    mind.state = 'pain'
    mind.timer = def.painTime
  }
}

export interface Intent {
  /**
   * Signed speed along the line to the player, in grid units per second.
   * Positive closes, negative gives ground, zero holds.
   *
   * A number rather than a "should it move" flag because two of the three
   * things that make a slug feel different are speeds: a Spitter backing off
   * between shots moves at its own pace, and a Brute lunging during its
   * wind-up moves at a different one from the one it walks at. The caller
   * still owns the actual movement, because that needs the level.
   */
  velocity: number
  /** Should it turn to face the player. */
  turn: boolean
}

const HOLD: Intent = { velocity: 0, turn: false }
const WATCH: Intent = { velocity: 0, turn: true }

/**
 * Advance one fixed step. Returns what the enemy wants to do; the caller owns
 * actually moving it, because movement needs the level and collision.
 */
export function step(mind: EnemyMind, def: EnemyDef, perception: Perception, dt: number): Intent {
  mind.didStrike = false
  mind.justDied = false

  if (mind.state === 'dead') return HOLD

  mind.attackCooldown = Math.max(0, mind.attackCooldown - dt)

  if (mind.state === 'dying') {
    mind.timer -= dt
    if (mind.timer <= 0) mind.state = 'dead'
    return HOLD
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
      return HOLD

    case 'alert':
      mind.timer -= dt
      if (mind.timer <= 0) mind.state = 'chase'
      // Turns during the reaction beat, so the wind-up is visible.
      return WATCH

    case 'pain':
      mind.timer -= dt
      if (mind.timer <= 0) mind.state = 'chase'
      return HOLD

    case 'chase':
      // Attacking is tested FIRST, before giving ground. The other order lets
      // a cornered kiter back into a wall and stay there refusing to shoot,
      // which turns the most dangerous thing in the room into a free kill.
      if (
        perception.distance <= def.attackRange &&
        perception.hasLineOfSight &&
        mind.attackCooldown <= 0
      ) {
        mind.state = 'attack'
        mind.timer = def.attackWindup
        return WATCH
      }
      // Too close for comfort: back off between shots rather than letting the
      // player walk into its face and stay there.
      if (mind.provoked && def.standoff > 0 && perception.distance < def.standoff) {
        return { velocity: -def.speed, turn: true }
      }
      if (perception.distance <= def.attackRange && perception.hasLineOfSight) {
        // In range and reloading: hold position rather than shuffling into
        // the player's face.
        return WATCH
      }
      // Keeps chasing once provoked even with sight broken, so breaking line
      // of sight is cover rather than an off switch.
      return { velocity: mind.provoked ? def.speed : 0, turn: true }

    case 'attack':
      mind.timer -= dt
      if (mind.timer <= 0) {
        // The strike lands at the END of the windup, which is what makes the
        // telegraph mean something: step out of range during it and it misses.
        mind.didStrike = perception.distance <= def.attackRange && perception.hasLineOfSight
        mind.attackCooldown = def.attackCooldown
        mind.state = 'chase'
        return WATCH
      }
      // A charger closes during its own telegraph, so the wind-up is a lunge
      // you step out of rather than a pause you shoot through.
      return { velocity: def.charge ?? 0, turn: true }

    default:
      return HOLD
  }
}
