import type { Level } from './level.ts'

/**
 * The one place that knows how grid coordinates become world coordinates.
 *
 * This exists because of a bug it would have prevented. geometry.ts scales X
 * and Z by `cellSize` but builds walls from 0 to `wallHeight` on Y, unscaled --
 * so the room is `wallHeight` units tall. Firing code, written later and in
 * another file, scaled Y by `cellSize` as well. The muzzle ended up at 8.8 in a
 * room 4 tall and every salt grain spawned above the ceiling, invisible.
 *
 * Nothing about that is catchable by checking the maths: the trig was right and
 * the numbers were internally consistent. Two files simply disagreed about what
 * a unit meant. The fix is to stop having two files decide.
 */
export interface WorldSpace {
  /** Grid units to world units, on the horizontal plane. */
  toWorldXZ(grid: number): number
  /** Floor plane, world units. */
  readonly floorY: number
  /** Ceiling plane, world units. Y is NOT scaled by cellSize. */
  readonly ceilingY: number
  /** Eye height for a given 0..1 fraction of the room's height. */
  eyeY(fraction: number): number
}

export function worldSpace(level: Level): WorldSpace {
  return {
    toWorldXZ: (grid) => grid * level.cellSize,
    floorY: 0,
    ceilingY: level.wallHeight,
    eyeY: (fraction) => fraction * level.wallHeight,
  }
}
