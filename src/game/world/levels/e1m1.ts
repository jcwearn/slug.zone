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

    // Clustered at the spawn on purpose while there is no HUD, automap or kill
    // counter to find them with.
    //
    // Only two sightlines exist from this corner: east along row 1, and south
    // down column 1. Everything else is around a bend, which is how the last
    // arrangement ended up with two of four enemies invisible despite sitting
    // on open, reachable ground. visibility.test.ts now holds that line.
    //
    // Three Grubs east so the swarm reads as a swarm, and the Spitter south so
    // there is a second direction to worry about -- at four cells it is inside
    // its 7.5 range and will open fire while the Grubs close.
    { type: 'grub', x: 4.5, z: 1.5 },
    { type: 'grub', x: 6.5, z: 1.5 },
    { type: 'grub', x: 8.5, z: 1.5 },
    { type: 'spitter', x: 1.5, z: 5.5 },
    // The Grinder is no longer handed out at spawn, so this is the only one in
    // the level and it is a long way south of where you start -- the first
    // encounter is deliberately meant to be fought with the Shaker.
    { type: 'pickup', item: 'grinder', x: 5.5, z: 11.5 },
    { type: 'pickup', item: 'health', x: 14.5, z: 4.5 },
    { type: 'pickup', item: 'redkey', x: 3.5, z: 13.5 },

    { type: 'pickup', item: 'armourshard', x: 3.5, z: 5.5 },
    { type: 'pickup', item: 'coarse', x: 7.5, z: 7.5 },
    { type: 'pickup', item: 'coarsebox', x: 16.5, z: 9.5 },
    { type: 'pickup', item: 'armour', x: 11.5, z: 15.5 },
    { type: 'pickup', item: 'medkit', x: 18.5, z: 12.5 },

    // The vault behind the red door at 13,13. Fourteen cells, and the exit is
    // reachable without ever opening it -- so this has to be worth the detour
    // on its own rather than because the level forces you through it.
    { type: 'pickup', item: 'coarsebox', x: 15.5, z: 11.5 },
    { type: 'pickup', item: 'medkit', x: 15.5, z: 12.5 },
  ],
  par: 90_000,
}

export default level
