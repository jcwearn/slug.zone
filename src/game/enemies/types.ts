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
  /**
   * How far into a wind-up an attack becomes un-cancellable, as a fraction of
   * `attackWindup`. 1 leaves it interruptible to the last instant.
   *
   * Without this a fast weapon deletes attacks faster than they complete: the
   * stagger overwrites the wind-up clock, and because the cooldown keeps
   * running through the stagger the creature restarts a FULL wind-up the
   * moment it recovers. That loop is why the roster died without fighting
   * back -- measured over 400 seeds, a Grub landed a hit in 0% of its lives
   * and a Brute in 48%, and tripling everyone's health did not fix it because
   * the loop is a race between the wind-up and the trigger, not the health
   * pool.
   *
   * Past the commit point the creature still takes the damage and can still
   * be killed mid-swing; it just cannot have the swing taken off it.
   */
  commitAt: number
  /** Seconds the death animation runs before the corpse settles. */
  dyingTime: number
  /** Half-angle of its forward vision, radians. */
  sightCone: number
  /** Grid units it can notice the player from. */
  sightRange: number
  /**
   * Damage in one hit at or above this gibs it instead of a normal death.
   *
   * "One hit" means one VOLLEY -- `resolveVolley` sums a shotgun's pellets per
   * creature before applying them. While each pellet landed separately the
   * largest single instance in the game was 12 against a lowest threshold of
   * 20, so this was unreachable and `playGib` was dead code.
   */
  gibThreshold: number
  /** Seconds after alerting before it starts moving. */
  reactionTime: number
  color: number
  darkColor: number
  /**
   * Which body the renderer builds. Colour and scale alone make a recoloured
   * Grub, not a new creature.
   */
  shape: 'slug' | 'bloat' | 'brute' | 'shell' | 'matriarch'
  /**
   * Armour that only covers one side, or null for a soft-all-over slug.
   *
   * `arc` is the half-angle around its facing that the plating covers, and
   * `multiplier` is what a hit inside it is scaled by. This is the one thing
   * in the roster that asks the player to move rather than to aim, so the arc
   * is wide enough that walking around it is the answer rather than strafing
   * a few degrees and carrying on.
   */
  armour: { arc: number; multiplier: number } | null
  /**
   * Backs away when the player gets nearer than this, in grid units. 0 for an
   * enemy that always closes.
   *
   * Kiting, not fleeing: it still attacks whenever its cooldown is up, and
   * only gives ground between shots. An enemy that retreats INSTEAD of
   * attacking becomes harmless the moment it is cornered, which turns the one
   * dangerous thing in the room into a free kill.
   */
  standoff: number
  /**
   * Speed while winding up an attack, in grid units per second, or null for
   * an enemy that plants its feet to swing.
   *
   * A charger closes during the telegraph rather than before it, so the
   * wind-up reads as a lunge you have to move out of rather than a pause.
   */
  charge: number | null
  /**
   * Damage dealt to everything within `radius` when it dies, or null.
   *
   * The counterweight to the shotgun: something that punishes killing it from
   * arm's length gives the Salt Shaker a job at range that the Grinder cannot
   * do for it.
   */
  deathBurst: { damage: number; radius: number } | null
  /**
   * Fields that replace theirs once it is hurt badly enough, or null.
   *
   * The whole of what separates a boss from a large Brute. A creature with one
   * behaviour is a creature you solve once and then execute; a second set of
   * numbers on the far side of a health threshold means the answer that got
   * you there stops working, and you have to find another one while losing.
   *
   * Deliberately a partial def rather than a state machine: a phase is not a
   * different creature, it is the same creature fighting differently, and
   * everything that reads a stat already goes through one function.
   */
  enrage: { below: number; def: Partial<EnemyDef> } | null

  /**
   * Ranged attack, or null for a melee enemy.
   *
   * Melee damage lands the instant the wind-up ends. Ranged damage is carried
   * by a glob that has to travel and can be dodged -- which is what makes a
   * ranged enemy a different problem rather than a melee one with more reach.
   */
  projectile: { speed: number; radius: number } | null
}
