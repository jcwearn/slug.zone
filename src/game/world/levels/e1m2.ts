import type { LevelSource } from '../types.ts'

/**
 * E1M2 -- The Sorting Floor.
 *
 * Written to the lesson E1M1 taught rather than to its shape. E1M1 puts seven
 * creatures on a 20x17 grid and almost every one of them is fought alone, so
 * the roster's whole premise -- that no two of them are answered by the same
 * habit -- never actually comes up. Here they are placed in groups that argue
 * with each other: a Spitter behind a swarm so backing off the swarm walks you
 * into the glob, a Slimebloat in the doorway you want to retreat through, a
 * Shellback covering the approach to the thing you came for.
 *
 * 26x22 rather than E1M1's 20x17, deliberately: the automap and the fog-of-war
 * grid are both sized from the level, and a second level of identical
 * dimensions would not have exercised either.
 *
 * The three areas are skinned differently -- brick west, metal in the east
 * wing, slime around the sorting floor -- because at 320x200 through fog the
 * wall texture is most of what tells you where you are. `slime` had been
 * defined in `textures.ts` since G1 and no level had ever asked for it.
 */
const level: LevelSource = {
  id: 'e1m2',
  name: 'The Sorting Floor',
  music: 'cellar',
  cellSize: 4,
  wallHeight: 4,
  floorTex: 'concrete',
  ceilingTex: 'metal',
  // Thinner than E1M1's 0.06. The hall and the sorting floor are big enough
  // that E1M1's fog would have hidden the far wall of both, and a room you
  // cannot see the end of reads as a corridor.
  fog: 0.045,
  legend: {
    '#': { wall: 'brick' },
    '=': { wall: 'metal' },
    '%': { wall: 'slime' },
    '.': { floor: true },
    ' ': { void: true },
    B: { door: { key: 'blue' } },
    S: { secretWall: 'brick' },
    X: { exit: true },
  },
  grid: [
    '##########################',
    '#.....####.........#=====#',
    '#.....####.........=.....=',
    '#...........#...#..=.....=',
    '#.....####.........B.....=',
    '#.....####.........=.....=',
    '###.####..S........=.....=',
    '###.####..#.#...#..=.....=',
    '###.######.........#=====#',
    '###.######.........#######',
    '###.#########...##########',
    '###.#########...##########',
    '##%.%%%%%%%%%...%%%%%%%%%#',
    '#%.......................%',
    '#%.......%......%........%',
    '#%....%..............%...%',
    '#%..........%............%',
    '#%.......................%',
    '##......%%%%%%%%%%%%%%B%%#',
    '##......##############...#',
    '##......##############.X.#',
    '##########################',
  ],
  entities: [
    // Facing +x, straight down the corridor at z=3 into the hall. The Grubs
    // are already in that sightline.
    { type: 'player', x: 2.5, z: 2.5, angle: -Math.PI / 2 },

    // The corridor. Two Grubs come at you down a one-cell channel where there
    // is nowhere to sidestep to, which is the cheapest possible lesson in what
    // the Grub now does since it started biting.
    { type: 'grub', x: 7.5, z: 3.5 },
    { type: 'grub', x: 9.5, z: 3.5 },

    // The hall. The first fight on this level that is more than one thing at
    // once: three Grubs closing while a Spitter works from the far side, so
    // giving ground from the swarm walks you back into the glob. The pillars
    // are the answer to the Spitter and the reason the swarm can flank.
    { type: 'grub', x: 11.5, z: 2.5 },
    { type: 'grub', x: 11.5, z: 8.5 },
    { type: 'grub', x: 14.5, z: 5.5 },
    { type: 'spitter', x: 17.5, z: 5.5 },

    // Guarding the blue door, and facing it. A Shellback is armoured across
    // the front 172 degrees, so taking it head-on in the mouth of a corridor
    // is the worst available option and there is room in the hall to go round.
    { type: 'shellback', x: 17.5, z: 3.5 },

    // The east wing, behind the blue door. Bait: the medkit and the armour are
    // visible from the doorway and the Brute is beside them, in a room with
    // one way out. It now commits to its lunge, so the room is the fight.
    { type: 'brute', x: 22.5, z: 4.5 },
    { type: 'pickup', item: 'medkit', x: 23.5, z: 2.5 },
    { type: 'pickup', item: 'armour', x: 23.5, z: 6.5 },
    { type: 'pickup', item: 'coarsebox', x: 20.5, z: 6.5 },

    // The sorting floor. Two Slimebloats and two Spitters in the largest open
    // space on the level: the Spitters want you at range and the Slimebloats
    // punish closing, and the burst radius reaches 2.6 cells so killing one
    // near the other chains. The pillars are the only cover.
    { type: 'slimebloat', x: 7.5, z: 15.5 },
    { type: 'slimebloat', x: 8.5, z: 16.5 },
    { type: 'spitter', x: 14.5, z: 13.5 },
    { type: 'spitter', x: 17.5, z: 16.5 },
    { type: 'grub', x: 4.5, z: 14.5 },
    { type: 'grub', x: 5.5, z: 16.5 },

    // The south-west limb holds the card, with a Brute standing on it. The
    // limb is 6x3 -- room enough to sidestep a lunge, and not much more.
    { type: 'brute', x: 5.5, z: 19.5 },
    { type: 'pickup', item: 'bluekey', x: 3.5, z: 19.5 },
    { type: 'pickup', item: 'coarse', x: 6.5, z: 18.5 },

    // The exit approach, past the second blue door. A Shellback with its back
    // to you if you come the obvious way.
    { type: 'shellback', x: 22.5, z: 15.5 },
    { type: 'pickup', item: 'health', x: 23.5, z: 13.5 },

    // Along the way.
    { type: 'pickup', item: 'grinder', x: 13.5, z: 11.5 },
    { type: 'pickup', item: 'coarse', x: 3.5, z: 8.5 },
    { type: 'pickup', item: 'armourshard', x: 3.5, z: 12.5 },
    { type: 'pickup', item: 'health', x: 2.5, z: 13.5 },
    { type: 'pickup', item: 'coarse', x: 18.5, z: 17.5 },

    // Behind the panel at (10,6): the pocket is two cells and worth the walk.
    { type: 'pickup', item: 'medkit', x: 8.5, z: 6.5 },
    { type: 'pickup', item: 'coarsebox', x: 8.5, z: 7.5 },
  ],
  // E1M1 is 90s for 7 creatures on 20x17. This has 17 on 26x22 with a keyed
  // detour, so a shade under three minutes.
  par: 170_000,
}

export default level
