import type { LevelSource } from '../types.ts'

/**
 * E1M4 -- The Cold Store.
 *
 * A ring rather than a hall. Everything before this has been rooms strung
 * along corridors, which means there is always a direction that is "back" and
 * the player always knows which one it is. A loop does not have one: every
 * fight can be walked away from in two directions and every fight can arrive
 * from two, and retreating down a corridor you have already cleared is no
 * longer automatically safe.
 *
 * The four chambers hang inwards off the ring and each has two ways in, so
 * none of them is a trap -- which matters more here than elsewhere, because
 * the creatures that punish being cornered are all in them.
 *
 * The core is sealed behind the red card and holds the exit. The card is in
 * the south-west chamber, diagonally as far from the door as the level allows,
 * so the level is walked twice: once to find it and once to spend it.
 *
 * 24x24, square, and the first of those too.
 */
const level: LevelSource = {
  id: 'e1m4',
  name: 'The Cold Store',
  music: 'cellar',
  cellSize: 4,
  wallHeight: 4,
  floorTex: 'concrete',
  ceilingTex: 'concrete',
  // The ring legs are two cells wide and twenty long. Any thicker and you
  // cannot see far enough down one to know which way the swarm is coming.
  fog: 0.04,
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
    '########################',
    '#......................#',
    '#......................#',
    '#..###D##########D###..#',
    '#..#......####......#..#',
    '#..#......####......#..#',
    '#.........####.........#',
    '#..#......####......#..#',
    '#..#......####......#..#',
    '#..##########.R######..#',
    '#..#######....#######..#',
    '#..#######....#######..#',
    '#..#######....#######..#',
    '#..#######..X.#######..#',
    '#..##################..#',
    '#..#......####......#..#',
    '#..#......####......#..#',
    '#..S......####.........#',
    '#..#......####......#..#',
    '#..#......####......#..#',
    '#..###.##########.###..#',
    '#......................#',
    '#......................#',
    '########################',
  ],
  entities: [
    { type: 'player', x: 2.5, z: 2.5, angle: -Math.PI / 2 },

    // The north leg is twenty-two cells long and two deep. A Spitter owns that
    // and the Grubs make closing on it the problem.
    { type: 'grub', x: 6.5, z: 1.5 },
    { type: 'grub', x: 9.5, z: 2.5 },
    { type: 'spitter', x: 19.5, z: 2.5 },

    // North-west chamber, six by five, two ways in. Room to go round the
    // Shellback, which is the only reason it is allowed to be in here with a
    // Slimebloat.
    { type: 'shellback', x: 6.5, z: 6.5 },
    { type: 'grub', x: 4.5, z: 4.5 },
    { type: 'slimebloat', x: 8.5, z: 7.5 },

    // North-east chamber, which holds the red door. The Brute is between you
    // and it.
    { type: 'brute', x: 16.5, z: 6.5 },
    { type: 'shellback', x: 18.5, z: 4.5 },
    { type: 'grub', x: 14.5, z: 7.5 },

    // South-west chamber, holding the card. Two Slimebloats close enough to
    // chain, in the room you have to cross to reach it.
    { type: 'slimebloat', x: 6.5, z: 17.5 },
    { type: 'slimebloat', x: 7.5, z: 18.5 },
    { type: 'grub', x: 4.5, z: 16.5 },
    { type: 'pickup', item: 'redkey', x: 8.5, z: 19.5 },
    { type: 'pickup', item: 'medkit', x: 4.5, z: 19.5 },

    // South-east chamber.
    { type: 'brute', x: 16.5, z: 17.5 },
    { type: 'spitter', x: 18.5, z: 15.5 },
    { type: 'grub', x: 14.5, z: 18.5 },
    { type: 'pickup', item: 'coarsebox', x: 18.5, z: 18.5 },

    // The south leg, on the way back with the card.
    { type: 'spitter', x: 6.5, z: 21.5 },
    { type: 'grub', x: 13.5, z: 22.5 },

    // One creature on the legs, not four. A loop accumulates: `provoked` never
    // resets and a Grub runs at 2.4 against a 2.6 walk, so anything roused on
    // the way round is still behind you when you get where you were going.
    // With four out here the bot arrived at the last chamber towing a train
    // and met eight creatures at once.
    { type: 'grub', x: 1.5, z: 12.5 },

    { type: 'pickup', item: 'grinder', x: 1.5, z: 4.5 },
    { type: 'pickup', item: 'health', x: 21.5, z: 2.5 },
    { type: 'pickup', item: 'coarse', x: 5.5, z: 5.5 },
    { type: 'pickup', item: 'coarsebox', x: 17.5, z: 8.5 },
    { type: 'pickup', item: 'armour', x: 2.5, z: 21.5 },
    { type: 'pickup', item: 'armourshard', x: 21.5, z: 20.5 },
    { type: 'pickup', item: 'health', x: 1.5, z: 17.5 },
    { type: 'pickup', item: 'coarse', x: 22.5, z: 6.5 },
    { type: 'pickup', item: 'medkit', x: 11.5, z: 12.5 },
    { type: 'pickup', item: 'health', x: 15.5, z: 21.5 },
  ],
  par: 240_000,
}

export default level
