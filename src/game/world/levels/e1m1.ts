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
    { type: 'player', x: 1.5, z: 1.5, angle: 0 },
    { type: 'grub', x: 8.5, z: 5.5 },
    { type: 'grub', x: 15.5, z: 3.5 },
    { type: 'spitter', x: 12.5, z: 13.5 },
    { type: 'pickup', item: 'grinder', x: 5.5, z: 11.5 },
    { type: 'pickup', item: 'health', x: 14.5, z: 4.5 },
    { type: 'pickup', item: 'redkey', x: 3.5, z: 13.5 },
  ],
  par: 90_000,
}

export default level
