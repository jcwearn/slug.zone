export type EnemyState = 'idle' | 'alert' | 'chase' | 'attack' | 'pain' | 'dying' | 'dead'

export interface EnemyDef {
  id: string
  name: string
  hp: number
  /** Grid units per second. */
  speed: number
  /** Collision and hit radius, grid units. */
  radius: number
  /** Height as a fraction of the room height. */
  height: number
  damage: number
  /** Grid units. Inside this, it attacks instead of chasing. */
  attackRange: number
  /** Seconds between attacks. */
  attackCooldown: number
  /** Seconds spent winding up before the hit lands. */
  attackWindup: number
  /** 0..1 chance a hit staggers it. */
  painChance: number
  /** Seconds a stagger lasts. */
  painTime: number
  /** Seconds the death animation runs before the corpse settles. */
  dyingTime: number
  /** Half-angle of its forward vision, radians. */
  sightCone: number
  /** Grid units it can notice the player from. */
  sightRange: number
  /** Damage in one hit at or above this gibs it instead of a normal death. */
  gibThreshold: number
  /** Seconds after alerting before it starts moving. */
  reactionTime: number
  color: number
  darkColor: number
}
