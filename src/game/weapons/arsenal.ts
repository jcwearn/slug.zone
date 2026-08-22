import { WEAPONS, BY_SLOT } from './definitions.ts'
import type { AmmoKind, WeaponDef } from './types.ts'

/**
 * Which weapons the player has, how much ammo, and what the weapon is doing
 * right now.
 *
 * Pure state plus pure transitions: no three.js, no audio, no DOM. Firing
 * returns a description of what happened and the caller turns that into
 * raycasts, sounds and muzzle flashes. That split is what makes fire-rate
 * gating, ammo accounting and the switch sequence unit-testable, which matters
 * because all three are the kind of thing that only misbehaves under fast
 * input.
 */

export type WeaponPhase = 'ready' | 'firing' | 'lowering' | 'raising'

export interface Arsenal {
  owned: Set<string>
  ammo: Record<AmmoKind, number>
  ammoMax: Record<AmmoKind, number>
  current: string
  /** Set while a switch is in flight; becomes `current` after lowering. */
  pending: string | null
  phase: WeaponPhase
  /** Seconds remaining in the current phase. */
  timer: number
  /** Seconds until the weapon can fire again. */
  cooldown: number
}

export const LOWER_TIME = 0.14

export function createArsenal(): Arsenal {
  return {
    owned: new Set(['saltshaker']),
    ammo: { fine: 0, coarse: 0, brine: 0, licks: 0 },
    ammoMax: { fine: 200, coarse: 60, brine: 300, licks: 3 },
    current: 'saltshaker',
    pending: null,
    phase: 'ready',
    timer: 0,
    cooldown: 0,
  }
}

export const definition = (arsenal: Arsenal): WeaponDef => WEAPONS[arsenal.current]

export function hasAmmoFor(arsenal: Arsenal, def: WeaponDef): boolean {
  if (def.ammo === null) return true
  return arsenal.ammo[def.ammo] >= def.ammoPerShot
}

/** Returns how much was actually taken, which is less than asked at the cap. */
export function addAmmo(arsenal: Arsenal, kind: AmmoKind, amount: number): number {
  const before = arsenal.ammo[kind]
  arsenal.ammo[kind] = Math.min(arsenal.ammoMax[kind], before + amount)
  return arsenal.ammo[kind] - before
}

export function giveWeapon(arsenal: Arsenal, id: string): boolean {
  if (!WEAPONS[id]) throw new Error(`unknown weapon: ${id}`)
  const isNew = !arsenal.owned.has(id)
  arsenal.owned.add(id)
  return isNew
}

/**
 * Begin switching. Returns false if the switch is refused.
 *
 * Refused rather than queued: queueing means mashing 1-2-1-2 builds a backlog
 * the player then has to watch play out, which feels broken. Dropping the
 * input keeps the weapon responsive to whatever key was pressed last that the
 * game could actually honour.
 */
export function selectWeapon(arsenal: Arsenal, id: string): boolean {
  if (!arsenal.owned.has(id)) return false
  if (id === arsenal.current && arsenal.pending === null) return false
  if (arsenal.phase === 'lowering' || arsenal.phase === 'raising') return false

  arsenal.pending = id
  arsenal.phase = 'lowering'
  arsenal.timer = LOWER_TIME
  return true
}

export function selectSlot(arsenal: Arsenal, slot: number): boolean {
  const id = BY_SLOT.get(slot)
  return id ? selectWeapon(arsenal, id) : false
}

/** Next owned weapon by slot order, wrapping. For the mouse wheel. */
export function cycleWeapon(arsenal: Arsenal, direction: 1 | -1): boolean {
  const owned = Object.values(WEAPONS)
    .filter((w) => arsenal.owned.has(w.id))
    .sort((a, b) => a.slot - b.slot)
  if (owned.length < 2) return false

  const index = owned.findIndex((w) => w.id === arsenal.current)
  const next = owned[(index + direction + owned.length) % owned.length]
  return selectWeapon(arsenal, next.id)
}

export function tickArsenal(arsenal: Arsenal, dt: number): void {
  arsenal.cooldown = Math.max(0, arsenal.cooldown - dt)

  if (arsenal.phase === 'ready') return

  arsenal.timer -= dt
  if (arsenal.timer > 0) return

  if (arsenal.phase === 'lowering') {
    // The swap happens at the bottom of the animation, which is what makes a
    // switch read as a swap rather than a teleport.
    if (arsenal.pending) arsenal.current = arsenal.pending
    arsenal.pending = null
    arsenal.phase = 'raising'
    arsenal.timer = definition(arsenal).raiseTime
    return
  }

  // 'raising' and 'firing' both settle back to ready. Carry the overshoot so a
  // long frame does not silently lengthen the animation.
  const overshoot = -arsenal.timer
  arsenal.phase = 'ready'
  arsenal.timer = 0
  arsenal.cooldown = Math.max(0, arsenal.cooldown - overshoot)
}

export type FireRefusal = 'cooldown' | 'switching' | 'no-ammo'

export interface FireResult {
  fired: boolean
  reason?: FireRefusal
  def?: WeaponDef
  /** Spread angles in radians, one per pellet, offset from the aim direction. */
  angles?: number[]
  ammoLeft?: number
}

/**
 * Attempt to fire.
 *
 * `rng` is passed in rather than reached for, so a shot is reproducible: the
 * same arsenal state and the same seed produce the same pellet pattern. That
 * is what lets the spread be asserted rather than merely sampled.
 */
export function fire(arsenal: Arsenal, rng: () => number): FireResult {
  if (arsenal.phase === 'lowering' || arsenal.phase === 'raising') {
    return { fired: false, reason: 'switching' }
  }
  if (arsenal.cooldown > 0) return { fired: false, reason: 'cooldown' }

  const def = definition(arsenal)
  if (!hasAmmoFor(arsenal, def)) return { fired: false, reason: 'no-ammo' }

  if (def.ammo !== null) arsenal.ammo[def.ammo] -= def.ammoPerShot
  arsenal.cooldown = def.cooldown
  arsenal.phase = 'firing'
  arsenal.timer = Math.min(def.cooldown, 0.08)

  const angles: number[] = []
  for (let i = 0; i < def.pellets; i++) {
    // Single-pellet weapons still get a little wander, but a shotgun's first
    // pellet is dead centre so point-blank aim is honest.
    if (def.pellets > 1 && i === 0) angles.push(0)
    else angles.push((rng() * 2 - 1) * def.spread)
  }

  return {
    fired: true,
    def,
    angles,
    ammoLeft: def.ammo === null ? Infinity : arsenal.ammo[def.ammo],
  }
}

/** Linear falloff from full damage at the muzzle to `def.falloff` at max range. */
export function damageAtRange(def: WeaponDef, distance: number): number {
  if (distance >= def.range) return 0
  const t = distance / def.range
  return def.damage * (1 - t * (1 - def.falloff))
}
