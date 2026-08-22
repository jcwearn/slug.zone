import { KEY_COLOURS } from '../data/palette.ts'
import type { ItemDef } from './types.ts'

/**
 * Everything you can pick up off the floor.
 *
 * The catalogue is deliberately limited to what the arsenal can actually use
 * today -- there is no `fine`, `brine` or `licks` ammo here, because the two
 * shipped weapons are a Salt Shaker with no ammo pool at all and a Grinder that
 * eats `coarse`. An item that tops up a pool nothing spends is a pickup that
 * silently refuses itself, which reads as a broken pickup.
 *
 * Nothing restores a bar in one go. A single item that fills you to the cap
 * removes the reason to look in the next room, which is the whole job the
 * pickups are here to do.
 */
export const ITEMS: Record<string, ItemDef> = {
  health: {
    id: 'health',
    name: 'MEDIKIT',
    effect: { kind: 'health', amount: 25 },
    color: 0xd8e4dc,
    height: 0.16,
    shape: 'cross',
  },

  medkit: {
    id: 'medkit',
    name: 'FIRST AID CRATE',
    effect: { kind: 'health', amount: 50 },
    color: 0xe8e4d8,
    height: 0.22,
    shape: 'cross',
  },

  armourshard: {
    id: 'armourshard',
    name: 'SALT PLATE',
    effect: { kind: 'armour', amount: 15 },
    color: 0x7fc8a8,
    height: 0.16,
    shape: 'shield',
  },

  armour: {
    id: 'armour',
    name: 'SALT VEST',
    effect: { kind: 'armour', amount: 50 },
    color: 0x4fb488,
    height: 0.24,
    shape: 'shield',
  },

  coarse: {
    id: 'coarse',
    name: 'COARSE ROUNDS',
    effect: { kind: 'ammo', ammo: 'coarse', amount: 8 },
    color: 0xb0a68c,
    height: 0.12,
    shape: 'box',
  },

  coarsebox: {
    id: 'coarsebox',
    name: 'BOX OF COARSE',
    effect: { kind: 'ammo', ammo: 'coarse', amount: 20 },
    color: 0x8c8470,
    height: 0.18,
    shape: 'box',
  },

  grinder: {
    id: 'grinder',
    // Arrives loaded, so picking it up is immediately worth something even if
    // you never find another box of coarse.
    name: 'THE GRINDER',
    effect: { kind: 'weapon', weapon: 'grinder', ammo: 'coarse', amount: 8 },
    color: 0x9aa0a8,
    height: 0.2,
    shape: 'gun',
  },

  redkey: {
    id: 'redkey',
    name: 'RED KEYCARD',
    effect: { kind: 'key', key: 'red' },
    color: KEY_COLOURS.red,
    height: 0.14,
    shape: 'card',
  },

  bluekey: {
    id: 'bluekey',
    name: 'BLUE KEYCARD',
    effect: { kind: 'key', key: 'blue' },
    color: KEY_COLOURS.blue,
    height: 0.14,
    shape: 'card',
  },

  yellowkey: {
    id: 'yellowkey',
    name: 'YELLOW KEYCARD',
    effect: { kind: 'key', key: 'yellow' },
    color: KEY_COLOURS.yellow,
    height: 0.14,
    shape: 'card',
  },
}
