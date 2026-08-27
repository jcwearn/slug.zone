import type { LevelSource } from '../types.ts'

/**
 * E1M5 -- The Nest.
 *
 * The last level of the episode, and the only one with two ways into the place
 * that matters. The nest is gated north by the blue card and south by the
 * yellow, and each card is at the END the OTHER door is at: the yellow is in
 * the north antechamber and the yellow door is in the south wall.
 *
 * That crossing is the level. Written the obvious way round -- each card by
 * its own door -- the bot took the north route, skipped the entire southern
 * half and finished in twenty seconds having taken less damage than either
 * level before it, which is not a finale. Swapping them means whichever half
 * you walk first, you walk the other one afterwards.
 *
 * The nest itself is eleven cells by eighteen, the largest room in the game,
 * with six pillar pairs in it. It is deliberately the shape a boss fight wants
 * (G7), and deliberately not full of creatures: an open room that size with
 * everything in it is one encounter rather than fifteen, which E1M3 and E1M4
 * both had to be rebuilt to learn. The pillars break the sightlines and the
 * roster is spread rather than stacked.
 *
 * 32x20. The automap draws whole pixels per cell down to 33 and no further, so
 * this is as large as a level can currently be.
 */
const level: LevelSource = {
  id: 'e1m5',
  name: 'The Nest',
  music: 'cellar',
  cellSize: 4,
  wallHeight: 4,
  floorTex: 'damp',
  ceilingTex: 'metal',
  fog: 0.035,
  legend: {
    '#': { wall: 'brick' },
    '=': { wall: 'metal' },
    '.': { floor: true },
    ' ': { void: true },
    B: { door: { key: 'blue' } },
    Y: { door: { key: 'yellow' } },
    S: { secretWall: 'brick' },
    X: { exit: true },
  },
  grid: [
    '####################===========#',
    '#.....####.......#.............=',
    '#.....####.......#.............=',
    '#.................B............=',
    '#.....####.......#.............=',
    '#.....####.......#.....==..==..=',
    '##.#######.......#.....==......=',
    '##.#######.########=.======....=',
    '##.#######.########=...........=',
    '##.####..#.########=..........X#',
    '##.####..S.########=...........=',
    '##.####..#.########=...........=',
    '##.#######.########=.======....=',
    '#........#.#######.........==..=',
    '#........#.#######.............=',
    '#................#.............=',
    '#.................Y............=',
    '#................#.............=',
    '#................#.............=',
    '####################===========#',
  ],
  entities: [
    { type: 'player', x: 2.5, z: 3.5, angle: -Math.PI / 2 },

    { type: 'grub', x: 7.5, z: 3.5 },
    { type: 'grub', x: 9.5, z: 3.5 },

    // The antechamber, holding the blue card. The Shellback is off the z=3
    // line the corridor arrives on, because on that line it is an armoured
    // front in a doorway with a wall on either side -- which is the same
    // mistake E1M3 was built with and the bot spotted there too. Two cells
    // south of it there is a room to walk around it in.
    { type: 'shellback', x: 14.5, z: 5.5 },
    { type: 'grub', x: 11.5, z: 5.5 },
    { type: 'spitter', x: 15.5, z: 1.5 },
    { type: 'pickup', item: 'yellowkey', x: 16.5, z: 3.5 },
    { type: 'pickup', item: 'coarsebox', x: 11.5, z: 1.5 },
    { type: 'pickup', item: 'health', x: 13.5, z: 1.5 },

    // The sump, holding the yellow card. The other route, and the longer one.
    { type: 'slimebloat', x: 4.5, z: 15.5 },
    { type: 'slimebloat', x: 5.5, z: 16.5 },
    { type: 'grub', x: 2.5, z: 14.5 },
    { type: 'brute', x: 6.5, z: 17.5 },
    { type: 'pickup', item: 'bluekey', x: 7.5, z: 18.5 },
    { type: 'pickup', item: 'medkit', x: 1.5, z: 18.5 },

    // The lower gallery, between the sump and the south door.
    { type: 'spitter', x: 14.5, z: 17.5 },
    { type: 'grub', x: 11.5, z: 16.5 },
    { type: 'pickup', item: 'armour', x: 15.5, z: 15.5 },

    // The nest, north half. The pillars are what make this a fight rather than
    // a firing squad in both directions.
    { type: 'shellback', x: 22.5, z: 3.5 },
    { type: 'grub', x: 25.5, z: 2.5 },
    { type: 'spitter', x: 29.5, z: 2.5 },
    { type: 'slimebloat', x: 26.5, z: 6.5 },

    // The nest, south half. The Brute is in the far corner rather than facing
    // the door: arriving through the yellow card at the end of a long walk and
    // meeting a lunge on the threshold is not a fight, it is a toll.
    { type: 'brute', x: 28.5, z: 17.5 },
    { type: 'grub', x: 21.5, z: 14.5 },
    { type: 'grub', x: 29.5, z: 16.5 },
    { type: 'spitter', x: 26.5, z: 17.5 },

    // The middle band, between the two ways in and the way out. The room was
    // built to this shape before there was anything to put in it.
    { type: 'matriarch', x: 25.5, z: 9.5 },
    { type: 'grub', x: 21.5, z: 10.5 },

    { type: 'pickup', item: 'grinder', x: 1.5, z: 1.5 },
    { type: 'pickup', item: 'health', x: 4.5, z: 5.5 },
    { type: 'pickup', item: 'coarse', x: 2.5, z: 9.5 },
    { type: 'pickup', item: 'armourshard', x: 9.5, z: 15.5 },
    { type: 'pickup', item: 'health', x: 21.5, z: 1.5 },
    { type: 'pickup', item: 'coarsebox', x: 29.5, z: 5.5 },
    { type: 'pickup', item: 'medkit', x: 21.5, z: 18.5 },
    { type: 'pickup', item: 'coarsebox', x: 29.5, z: 13.5 },
    { type: 'pickup', item: 'health', x: 25.5, z: 10.5 },

    // Behind the panel on the spine.
    { type: 'pickup', item: 'medkit', x: 7.5, z: 10.5 },
    { type: 'pickup', item: 'armour', x: 8.5, z: 9.5 },
  ],
  par: 270_000,
}

export default level
