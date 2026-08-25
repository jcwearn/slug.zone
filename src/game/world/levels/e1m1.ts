import type { LevelSource } from '../types.ts'

// Rows are z, columns are x. Kept as a string grid rather than a nested array
// because a level you can read in the editor is a level you will actually
// edit -- and level.test.ts parses every file in this directory, so a typo
// here fails the suite rather than shipping.
const level: LevelSource = {
  id: 'e1m1',
  name: 'The Damp Cellar',
  music: 'cellar',
  cellSize: 4,
  wallHeight: 4,
  floorTex: 'damp',
  ceilingTex: 'concrete',
  fog: 0.06,
  legend: {
    '#': { wall: 'brick' },
    '=': { wall: 'metal' },
    '.': { floor: true },
    ' ': { void: true },
    D: { door: { key: null } },
    R: { door: { key: 'red' } },
    S: { secretWall: 'brick' },
    X: { exit: true },
  },
  grid: [
    '####################',
    '#........#.........#',
    '#.####...#...####..#',
    '#.#..#...D...#..S..#',
    '#.#..#####...#..#..#',
    '#.#......#...#..#..#',
    '#.####...#####..####',
    '#....#.............#',
    '####.#####.#########',
    '#..................#',
    '#.########.#.#####.#',
    '#.#......#.#.#...#.#',
    '#.#.####.#.#.#...#.#',
    '#.#.#..#...#.R.#.#.#',
    '#.#.#..#####.#.#.#.#',
    '#...#........#...#X#',
    '####################',
  ],
  entities: [
    // angle -PI/2 faces +x. Facing is (-sin(yaw), -cos(yaw)), so the default
    // angle 0 faces -z -- which from this corner is the north wall, one cell
    // away. The player was spawning nose-first into brickwork.
    { type: 'player', x: 1.5, z: 1.5, angle: -Math.PI / 2 },

    // Three Grubs east so the swarm reads as a swarm, a fourth down the west
    // column so there is a second direction to watch, and the Spitter behind
    // it at four cells -- inside its 7.5 reach, so it opens fire while the
    // swarm closes. Only two sightlines exist from this corner, east along
    // row 1 and south down column 1, and both of them now have something in
    // them. `visibility.test.ts` holds that line.
    { type: 'grub', x: 4.5, z: 1.5 },
    { type: 'grub', x: 6.5, z: 1.5 },
    { type: 'grub', x: 8.5, z: 1.5 },
    { type: 'grub', x: 1.5, z: 3.5 },
    { type: 'spitter', x: 1.5, z: 5.5 },

    // The 3x5 room past the unkeyed door is one of exactly two places on this
    // level with room to walk around anything, which is why the Shellback is
    // in it. The Grub is there so that walking around it costs something --
    // circling an armoured front while being chased from behind is the fight,
    // and a Shellback alone in a room is just a slow puzzle.
    { type: 'shellback', x: 11.5, z: 4.5 },
    // Deep in the room rather than by the door: at nine cells from the start
    // it counted as part of the opening encounter, which must be visible from
    // spawn, and it is behind a shut door. `visibility.test.ts` measures that
    // distance straight through walls, so "near" and "part of the first fight"
    // are the same thing to it.
    { type: 'grub', x: 12.5, z: 2.5 },

    // The long z=7 corridor, which had nothing in it at all. A Slimebloat is
    // the right thing for a one-cell channel: there is no getting past it and
    // no room to be inside the burst, so it has to be shot from down the hall
    // -- which is the Salt Shaker's job and the reason the Shaker still has
    // one after the Grinder turns up.
    { type: 'slimebloat', x: 11.5, z: 7.5 },

    // Row 9 runs the full width of the map and is the longest sightline in the
    // level. It was empty. A Spitter at the far end works the whole corridor
    // while two Grubs close from the middle: backing off the Grubs walks you
    // down the Spitter's lane, and charging the Spitter walks you through the
    // Grubs.
    { type: 'spitter', x: 14.5, z: 9.5 },
    { type: 'grub', x: 9.5, z: 9.5 },
    { type: 'grub', x: 11.5, z: 9.5 },

    // Two Slimebloats a cell apart in the southern corridor, sharing it with
    // the Grinder. Killing either one inside 2.6 cells of the other sets the
    // second off, which is the chain the burst exists for -- and this is the
    // spot where the shotgun you have just picked up is most tempting and
    // most wrong.
    { type: 'slimebloat', x: 7.5, z: 11.5 },
    { type: 'slimebloat', x: 8.5, z: 11.5 },

    // The red vault. The Brute sits in the 3x2 opening at the top rather than
    // in one of the one-cell columns below it: the lunge travels a fixed line
    // now, so it is dodged by stepping sideways, and a charger in a corridor
    // is a creature with the dodge designed out of it.
    { type: 'brute', x: 15.5, z: 11.5 },
    { type: 'grub', x: 14.5, z: 14.5 },

    { type: 'pickup', item: 'grinder', x: 5.5, z: 11.5 },
    { type: 'pickup', item: 'health', x: 14.5, z: 4.5 },
    { type: 'pickup', item: 'redkey', x: 3.5, z: 13.5 },

    { type: 'pickup', item: 'armourshard', x: 3.5, z: 5.5 },
    { type: 'pickup', item: 'coarse', x: 7.5, z: 7.5 },
    // Row 9 is a longer fight than it was, so it is supplied for one.
    { type: 'pickup', item: 'coarse', x: 6.5, z: 9.5 },
    { type: 'pickup', item: 'health', x: 2.5, z: 9.5 },
    { type: 'pickup', item: 'coarsebox', x: 16.5, z: 9.5 },
    { type: 'pickup', item: 'armour', x: 11.5, z: 15.5 },
    { type: 'pickup', item: 'medkit', x: 18.5, z: 12.5 },

    // The vault is reachable without ever opening it, so what is inside has to
    // be worth the detour on its own rather than because the level forces you
    // through it.
    { type: 'pickup', item: 'coarsebox', x: 14.5, z: 11.5 },
    { type: 'pickup', item: 'medkit', x: 16.5, z: 11.5 },
  ],
  // Fifteen creatures rather than seven, so the ninety seconds that was par
  // for a shooting gallery is not par for a fight.
  par: 120_000,
}

export default level
