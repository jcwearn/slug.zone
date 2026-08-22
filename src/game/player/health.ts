/**
 * Player health and armour.
 *
 * Pure: no three.js, no audio, no DOM. Damage arrives as a number and the
 * result is a description of what happened, which the caller turns into a
 * screen flash, a grunt, and a face portrait. Keeping it that way is what makes
 * armour absorption and the invulnerability window testable, and both are the
 * kind of rule that is quietly wrong for weeks otherwise.
 */

export interface PlayerHealth {
  hp: number
  hpMax: number
  armour: number
  armourMax: number
  /** Seconds of damage immunity left after being hit. */
  immunity: number
  /** True on the tick the player died. */
  justDied: boolean
  dead: boolean
  /** Rises on damage, decays over time. Drives the red screen flash. */
  painFlash: number
}

/**
 * Doom's green armour: soaks a third of incoming damage until it runs out.
 *
 * A fraction rather than a flat reduction, so armour matters as much against a
 * Banana Brute's charge as against a Grub's nibble. Flat reduction makes chip
 * damage free and heavy hits unchanged, which inverts the intent.
 */
export const ARMOUR_ABSORB = 1 / 3

/**
 * Damage immunity after a hit.
 *
 * Short, but not zero. Without it a pack of four Grubs whose attacks happen to
 * land on the same tick deletes a third of your health in one frame, with a
 * single flash and no chance to react -- it reads as a bug rather than as a
 * mistake you made.
 */
export const IMMUNITY_TIME = 0.12

export function createHealth(): PlayerHealth {
  return {
    hp: 100,
    hpMax: 100,
    armour: 0,
    armourMax: 100,
    immunity: 0,
    justDied: false,
    dead: false,
    painFlash: 0,
  }
}

export interface DamageResult {
  /** False if the hit was ignored -- immunity, or already dead. */
  applied: boolean
  /** Health actually lost, after armour. */
  hpLost: number
  armourLost: number
  died: boolean
}

export function damagePlayer(health: PlayerHealth, amount: number): DamageResult {
  if (health.dead || health.immunity > 0 || amount <= 0) {
    return { applied: false, hpLost: 0, armourLost: 0, died: false }
  }

  let toHp = amount
  let armourLost = 0

  if (health.armour > 0) {
    const absorbed = Math.min(health.armour, amount * ARMOUR_ABSORB)
    armourLost = absorbed
    health.armour -= absorbed
    toHp = amount - absorbed
  }

  health.hp -= toHp
  health.immunity = IMMUNITY_TIME
  // Scaled by the size of the hit, capped, so a big hit flashes harder without
  // a huge one whiting out the screen.
  health.painFlash = Math.min(1, health.painFlash + toHp / 45)

  if (health.hp <= 0) {
    health.hp = 0
    health.dead = true
    health.justDied = true
    health.painFlash = 1
    return { applied: true, hpLost: toHp, armourLost, died: true }
  }

  return { applied: true, hpLost: toHp, armourLost, died: false }
}

/** Returns how much was actually taken, which is less than asked at the cap. */
export function heal(health: PlayerHealth, amount: number): number {
  if (health.dead) return 0
  const before = health.hp
  health.hp = Math.min(health.hpMax, before + amount)
  return health.hp - before
}

export function addArmour(health: PlayerHealth, amount: number): number {
  const before = health.armour
  health.armour = Math.min(health.armourMax, before + amount)
  return health.armour - before
}

export function tickHealth(health: PlayerHealth, dt: number): void {
  health.justDied = false
  health.immunity = Math.max(0, health.immunity - dt)
  // Fades fast enough not to linger, slow enough to be seen at 60fps.
  health.painFlash = Math.max(0, health.painFlash - dt * 2.2)
}

/**
 * Which of five damage buckets the face portrait should show.
 *
 * 0 is unhurt, 4 is nearly dead. Buckets rather than a continuous value
 * because the portrait is a handful of drawn expressions, and because a face
 * that changes every frame reads as noise.
 */
export function faceBucket(health: PlayerHealth): number {
  if (health.dead) return 5
  const fraction = health.hp / health.hpMax
  if (fraction > 0.8) return 0
  if (fraction > 0.6) return 1
  if (fraction > 0.4) return 2
  if (fraction > 0.2) return 3
  return 4
}
