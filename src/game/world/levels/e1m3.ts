import type { LevelSource } from '../types.ts'

/**
 * E1M3 -- The Brine Vats.
 *
 * The first level with a key CHAIN rather than a keyed side room: the yellow
 * card opens the north-east wing, and the blue card that opens the way out is
 * inside it. `reachableFromStart` runs a fixed point over exactly this -- a
 * single pass would assume the player already holds both and certify a level
 * that cannot be finished -- and this is the first shipped map that actually
 * exercises it.
 *
 * The hall is built around the vats: four 2x2 blocks that break an eleven-cell
 * room into lanes. An open box that size is where a Spitter is at its best and
 * everything else is at its worst, because there is nothing to break the line
 * and nothing to put between you and a lunge. The vats are what make it a room
 * rather than a field.
 *
 * The bulkhead across row 9 is there for a different reason, and the bot found
 * it: `provoked` never resets, so everything that once had sight of you keeps
 * coming forever. One undivided hall therefore is not eleven encounters, it is
 * one encounter with eleven creatures in it, and the bot died three times over
 * pinned in the doorway with six of them on top of it. The two gaps in the
 * bulkhead make the north and the south separate fights that can still hear
 * each other.
 *
 * 30x18, wider than either level before it. The automap scale is a whole
 * number of pixels per cell down to 33 cells and no further, so this is
 * deliberately close to that edge without going over it.
 *
 * It carries a Grinder near the spawn even though the player should arrive
 * with one. Dying restarts the level you are on with a Salt Shaker and nothing
 * else, so every level has to be winnable from that -- and a level this size
 * fought entirely with the Shaker is a long evening.
 */
const level: LevelSource = {
  id: 'e1m3',
  name: 'The Brine Vats',
  music: 'cellar',
  cellSize: 4,
  wallHeight: 4,
  floorTex: 'damp',
  ceilingTex: 'concrete',
  // Thinner again than E1M2. The hall is eleven cells across and the gallery
  // twenty, and fog that hides the far wall turns a room into a corridor.
  fog: 0.038,
  legend: {
    '#': { wall: 'brick' },
    '=': { wall: 'metal' },
    '%': { wall: 'slime' },
    '.': { floor: true },
    ' ': { void: true },
    Y: { door: { key: 'yellow' } },
    B: { door: { key: 'blue' } },
    S: { secretWall: 'brick' },
    X: { exit: true },
  },
  grid: [
    '##########%%%%%%%%%%%#=======#',
    '#.....###%...........%.......=',
    '#.....###%...........%.......=',
    '#....................%.......=',
    '#.....###%...........Y.......=',
    '#.....###%..%%...%%..%.......=',
    '###.#####%..%%...%%..%.......=',
    '#.....###%...........%.......=',
    '###.####..S..........%=======#',
    '###.####..%.%%%%%%%..%########',
    '###.#####%..%%...%%..%########',
    '###.#####%..%%...%%..%########',
    '###.#####%...........%.......#',
    '###.#####%...........%.......#',
    '#.........%%%%%.%%%%%#.......#',
    '#....................B.......#',
    '#....................#....X..#',
    '##############################',
  ],
  entities: [
    { type: 'player', x: 2.5, z: 3.5, angle: -Math.PI / 2 },

    // Row 3 runs unbroken from the spawn to the far side of the hall, which is
    // the longest sightline on the level and the first thing you look down.
    // The Spitter is at the end of it, so the opening is a ranged threat you
    // have to close on through two Grubs rather than a swarm you back away
    // from.
    { type: 'grub', x: 7.5, z: 3.5 },
    { type: 'grub', x: 9.5, z: 3.5 },
    { type: 'spitter', x: 16.5, z: 3.5 },

    // The north bay, which is eleven cells across and four deep with no vats in
    // it -- the room the Shellback needs. It sat one lane further south to
    // begin with and walked itself into the mouth of the corridor, where the
    // vat beside it left nothing to go around: a bot with perfect aim lost the
    // level standing at arm's length plinking at an armoured front for nine
    // seconds. An enemy whose whole answer is movement has to be somewhere
    // there is room to move.
    { type: 'shellback', x: 15.5, z: 2.5 },
    { type: 'grub', x: 19.5, z: 6.5 },
    { type: 'slimebloat', x: 15.5, z: 7.5 },

    // The south half of the hall is the widest open floor in the episode, and
    // the Brute is in the middle of it. Its lunge travels a fixed line, so
    // this is the one place on the level with room to make that matter in
    // every direction rather than just sideways.
    { type: 'brute', x: 15.5, z: 12.5 },
    { type: 'grub', x: 11.5, z: 12.5 },
    { type: 'grub', x: 19.5, z: 12.5 },
    { type: 'spitter', x: 11.5, z: 13.5 },
    { type: 'slimebloat', x: 11.5, z: 10.5 },

    // The north-east wing, behind the yellow door, holding the blue card. The
    // reward for the detour is the way out, so this one is not optional the
    // way E1M1's vault was.
    { type: 'brute', x: 25.5, z: 4.5 },
    { type: 'shellback', x: 23.5, z: 2.5 },
    { type: 'pickup', item: 'bluekey', x: 27.5, z: 1.5 },
    { type: 'pickup', item: 'medkit', x: 27.5, z: 3.5 },
    { type: 'pickup', item: 'coarsebox', x: 23.5, z: 5.5 },

    // The sump, holding the yellow card. Two Slimebloats a cell apart in a
    // room you have to cross to reach it.
    { type: 'slimebloat', x: 4.5, z: 15.5 },
    { type: 'slimebloat', x: 5.5, z: 15.5 },
    { type: 'grub', x: 2.5, z: 15.5 },
    { type: 'pickup', item: 'yellowkey', x: 8.5, z: 16.5 },
    { type: 'pickup', item: 'medkit', x: 8.5, z: 14.5 },
    { type: 'pickup', item: 'coarse', x: 6.5, z: 15.5 },

    // The gallery is twenty cells long and two deep, which is a shooting lane
    // rather than a room -- so the Spitter owns it and the Shellback guards
    // the far end where the way out is.
    { type: 'spitter', x: 18.5, z: 16.5 },
    { type: 'shellback', x: 24.5, z: 14.5 },
    { type: 'grub', x: 27.5, z: 13.5 },
    { type: 'pickup', item: 'coarsebox', x: 24.5, z: 16.5 },
    { type: 'pickup', item: 'health', x: 27.5, z: 15.5 },

    // A Grinder at the spawn, for the pistol start a death on this level
    // hands you.
    { type: 'pickup', item: 'grinder', x: 2.5, z: 4.5 },
    { type: 'pickup', item: 'health', x: 1.5, z: 7.5 },
    { type: 'pickup', item: 'armourshard', x: 3.5, z: 10.5 },
    { type: 'pickup', item: 'armour', x: 15.5, z: 1.5 },
    { type: 'pickup', item: 'coarse', x: 14.5, z: 8.5 },
    { type: 'pickup', item: 'health', x: 19.5, z: 13.5 },
    { type: 'pickup', item: 'armourshard', x: 12.5, z: 15.5 },

    // Behind the panel on the hall's west face.
    { type: 'pickup', item: 'coarsebox', x: 8.5, z: 8.5 },
    { type: 'pickup', item: 'medkit', x: 9.5, z: 9.5 },
  ],
  par: 210_000,
}

export default level
