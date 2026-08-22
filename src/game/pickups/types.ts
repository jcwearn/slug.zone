import type { AmmoKind } from '../weapons/types.ts'

/** Which of the three keycards. The HUD pips key off exactly these names. */
export type KeyColour = 'red' | 'blue' | 'yellow'

/**
 * What collecting an item does.
 *
 * A union rather than a bag of optional fields, so `collect` has to handle
 * every kind and a new one cannot be silently ignored by the switch.
 */
export type ItemEffect =
  | { kind: 'health'; amount: number }
  | { kind: 'armour'; amount: number }
  | { kind: 'ammo'; ammo: AmmoKind; amount: number }
  /** A weapon plus the rounds it arrives loaded with. */
  | { kind: 'weapon'; weapon: string; ammo: AmmoKind; amount: number }
  | { kind: 'key'; key: KeyColour }

export interface ItemDef {
  id: string
  /** Shown on the HUD message line when collected. */
  name: string
  effect: ItemEffect
  color: number
  /** Height as a fraction of the room, matching EnemyDef.height. */
  height: number
  /** Which shape the renderer builds. */
  shape: 'cross' | 'shield' | 'box' | 'gun' | 'card'
}
