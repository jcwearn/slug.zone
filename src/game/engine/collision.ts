import { isSolid, type Level } from '../world/level.ts'

/**
 * Circle-vs-grid collision in cell space, plus a DDA raycast.
 *
 * Everything here is pure and takes the level as an argument, so the awkward
 * cases -- corners, thresholds, grazing a wall at a shallow angle -- are unit
 * tests rather than something you find by walking into scenery.
 *
 * Positions are in GRID units, not world units: cell (3,4) spans x 3..4. The
 * renderer multiplies by cellSize. Keeping collision in cell space means the
 * maths never has to divide by it, and an off-by-one in the scale cannot make
 * a body fall through the floor.
 */

export const PLAYER_RADIUS = 0.28

/** Keeps a resting body a hair off the surface it stopped against. */
const EPSILON = 1e-6

/**
 * Resolve movement one axis at a time.
 *
 * Axis separation is what produces wall-sliding: run diagonally into a wall
 * and the blocked axis is cancelled while the other survives, so you slide
 * along instead of stopping dead. Resolving both together would need the
 * contact normal and would stick on corners.
 */
export function moveWithCollision(
  level: Level,
  x: number,
  z: number,
  dx: number,
  dz: number,
  radius = PLAYER_RADIUS,
): { x: number; z: number; hitX: boolean; hitZ: boolean } {
  const afterX = sweepAxis(level, x, z, dx, radius, 'x')
  const afterZ = sweepAxis(level, afterX.value, z, dz, radius, 'z')

  let nx = afterX.value
  let nz = afterZ.value

  // Belt and braces for the diagonal corner case: each axis is exact on its
  // own, but a body can clear both faces and still clip the corner point
  // between them.
  if (!circleFits(level, nx, nz, radius)) {
    if (circleFits(level, nx, z, radius)) nz = z
    else if (circleFits(level, x, nz, radius)) nx = x
    else {
      nx = x
      nz = z
    }
  }

  return { x: nx, z: nz, hitX: afterX.blocked, hitZ: afterZ.blocked }
}

/**
 * Move along one axis and stop flush against the first blocking cell.
 *
 * Scans cell by cell from where the body is to where it wants to be, rather
 * than snapping to the boundary of the destination cell. Snapping to the
 * destination is wrong for any step longer than one cell: it lands past
 * intervening geometry, fails its own fit check, and the whole move gets
 * reverted -- so a fast body stops dead in open floor instead of sliding.
 *
 * Because it scans every cell crossed, it also cannot tunnel.
 */
function sweepAxis(
  level: Level,
  x: number,
  z: number,
  delta: number,
  radius: number,
  axis: 'x' | 'z',
): { value: number; blocked: boolean } {
  const position = axis === 'x' ? x : z
  if (delta === 0) return { value: position, blocked: false }

  const target = position + delta
  const other = axis === 'x' ? z : x
  // Cells the body spans on the perpendicular axis.
  const perpMin = Math.floor(other - radius)
  const perpMax = Math.floor(other + radius)

  const solidAt = (along: number, perp: number) =>
    axis === 'x' ? isSolid(level, along, perp) : isSolid(level, perp, along)

  const forward = delta > 0
  const leadingEdge = forward ? position + radius : position - radius
  const targetEdge = forward ? target + radius : target - radius

  const from = Math.floor(leadingEdge)
  const to = Math.floor(targetEdge)
  const step = forward ? 1 : -1

  for (let cell = from; forward ? cell <= to : cell >= to; cell += step) {
    let blocked = false
    for (let perp = perpMin; perp <= perpMax; perp++) {
      if (solidAt(cell, perp)) {
        blocked = true
        break
      }
    }
    if (!blocked) continue

    // Rest against the face of this cell. EPSILON keeps the body a hair off
    // the surface so the next frame's fit check does not see a touch as an
    // overlap.
    const face = forward ? cell - radius - EPSILON : cell + 1 + radius + EPSILON
    // Guard the already-overlapping case: if the face is behind where the body
    // already is, hold position rather than teleporting it backwards through
    // the wall it is stuck in.
    const clamped = forward ? Math.max(face, position) : Math.min(face, position)
    return { value: clamped, blocked: true }
  }

  return { value: target, blocked: false }
}

/**
 * Whether a circle at (x,z) overlaps any solid cell.
 *
 * Tests the cells the bounding box touches rather than just the centre cell:
 * a radius-0.28 circle straddles a cell boundary most of the time, and
 * checking only the centre lets a body's edge sink into a wall.
 */
export function circleFits(level: Level, x: number, z: number, radius = PLAYER_RADIUS): boolean {
  const minX = Math.floor(x - radius)
  const maxX = Math.floor(x + radius)
  const minZ = Math.floor(z - radius)
  const maxZ = Math.floor(z + radius)

  for (let cz = minZ; cz <= maxZ; cz++) {
    for (let cx = minX; cx <= maxX; cx++) {
      if (!isSolid(level, cx, cz)) continue
      // Closest point on the cell's AABB to the circle centre.
      const closestX = Math.min(Math.max(x, cx), cx + 1)
      const closestZ = Math.min(Math.max(z, cz), cz + 1)
      const ddx = x - closestX
      const ddz = z - closestZ
      if (ddx * ddx + ddz * ddz < radius * radius) return false
    }
  }
  return true
}

export interface RayHit {
  /** Distance travelled, in grid units. */
  distance: number
  /** The solid cell that was hit. */
  cellX: number
  cellZ: number
  /** Face normal of the hit, one axis +/-1 and the other 0. */
  normalX: number
  normalZ: number
}

/**
 * Amanatides-Woo DDA. Steps cell boundary to cell boundary rather than
 * sampling along the ray, so it cannot miss a thin wall or step past a corner
 * -- both of which fixed-step sampling does, and both of which show up as
 * shots passing through geometry.
 *
 * Returns null if nothing solid is hit within maxDistance.
 */
export function raycast(
  level: Level,
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
  maxDistance = 64,
): RayHit | null {
  const length = Math.hypot(dirX, dirZ)
  if (length === 0) return null
  const rdx = dirX / length
  const rdz = dirZ / length

  let cellX = Math.floor(originX)
  let cellZ = Math.floor(originZ)

  if (isSolid(level, cellX, cellZ)) {
    return { distance: 0, cellX, cellZ, normalX: 0, normalZ: 0 }
  }

  const stepX = rdx > 0 ? 1 : -1
  const stepZ = rdz > 0 ? 1 : -1

  // Guard the axis-aligned case: 1/0 is Infinity, which compares correctly in
  // the loop below, but 0/0 would be NaN and every comparison would be false.
  const deltaX = rdx === 0 ? Infinity : Math.abs(1 / rdx)
  const deltaZ = rdz === 0 ? Infinity : Math.abs(1 / rdz)

  let sideX = rdx === 0 ? Infinity : (rdx > 0 ? cellX + 1 - originX : originX - cellX) * deltaX
  let sideZ = rdz === 0 ? Infinity : (rdz > 0 ? cellZ + 1 - originZ : originZ - cellZ) * deltaZ

  let normalX = 0
  let normalZ = 0
  let distance = 0

  while (distance <= maxDistance) {
    if (sideX < sideZ) {
      distance = sideX
      sideX += deltaX
      cellX += stepX
      normalX = -stepX
      normalZ = 0
    } else {
      distance = sideZ
      sideZ += deltaZ
      cellZ += stepZ
      normalX = 0
      normalZ = -stepZ
    }

    if (distance > maxDistance) return null
    if (isSolid(level, cellX, cellZ)) {
      return { distance, cellX, cellZ, normalX, normalZ }
    }
  }

  return null
}

/** Line of sight between two points, used for enemy awareness. */
export function hasLineOfSight(
  level: Level,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): boolean {
  const dx = bx - ax
  const dz = bz - az
  const distance = Math.hypot(dx, dz)
  if (distance === 0) return true
  const hit = raycast(level, ax, az, dx, dz, distance)
  return hit === null
}

/** Clearance left between bodies after a push, so they end up properly apart. */
const SEPARATION_MARGIN = 1e-3

/** A circular obstacle in the horizontal plane: a creature, or the player. */
export interface Disc {
  x: number
  z: number
  radius: number
}

/** Whether a circle at (x,z) overlaps any of the discs. */
export function overlapsDisc(x: number, z: number, radius: number, discs: Iterable<Disc>): boolean {
  for (const disc of discs) {
    const dx = x - disc.x
    const dz = z - disc.z
    const reach = radius + disc.radius
    if (dx * dx + dz * dz < reach * reach) return true
  }
  return false
}

/**
 * Move from `from` to `to`, blocked by discs, sliding along them.
 *
 * Blocking rather than pushing, and it matters which. Two bodies that each
 * shove the other apart end up separated by twice the overlap every frame, so
 * brushing against a slug flings you off it. Blocking just stops you, and the
 * axis-at-a-time fallback is what turns "stopped" into "slid around", exactly
 * as the wall collision does.
 *
 * Order matters on the diagonal: the axis carrying more of the movement is
 * tried first, so a glancing approach keeps the component that was doing the
 * work.
 */
export function slideAlongDiscs(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  radius: number,
  discs: Iterable<Disc>,
): { x: number; z: number; blocked: boolean } {
  const list = [...discs]
  if (list.length === 0) return { x: toX, z: toZ, blocked: false }

  if (!overlapsDisc(toX, toZ, radius, list)) return { x: toX, z: toZ, blocked: false }

  // Already inside something before moving -- an enemy walked onto us, or one
  // spawned here. Refusing to move would trap the player inside a slug, so let
  // the move through and let the enemy's own push-out resolve it.
  if (overlapsDisc(fromX, fromZ, radius, list)) {
    return { x: toX, z: toZ, blocked: false }
  }

  const preferX = Math.abs(toX - fromX) >= Math.abs(toZ - fromZ)
  const first = preferX ? { x: toX, z: fromZ } : { x: fromX, z: toZ }
  const second = preferX ? { x: fromX, z: toZ } : { x: toX, z: fromZ }

  if (!overlapsDisc(first.x, first.z, radius, list)) {
    return { x: first.x, z: first.z, blocked: true }
  }
  if (!overlapsDisc(second.x, second.z, radius, list)) {
    return { x: second.x, z: second.z, blocked: true }
  }
  return { x: fromX, z: fromZ, blocked: true }
}

/**
 * Push a circle out of the discs it overlaps, without leaving the level.
 *
 * Used for the enemy side, where a slug that has ended up on top of the player
 * -- because the player walked backwards into it, or it spawned there -- has to
 * be moved out rather than merely stopped.
 */
export function pushOutOfDiscs(
  level: Level,
  x: number,
  z: number,
  radius: number,
  discs: Iterable<Disc>,
): { x: number; z: number } {
  let px = x
  let pz = z

  for (const disc of discs) {
    const dx = px - disc.x
    const dz = pz - disc.z
    const distance = Math.hypot(dx, dz)
    const reach = radius + disc.radius
    if (distance >= reach) continue

    // Direction and magnitude computed separately, deliberately. Folding the
    // coincident fallback into `distance` and then deriving the push from it
    // makes the push NEGATIVE -- reach minus the substituted distance -- so
    // two bodies in exactly the same spot pull together instead of apart.
    let nx: number
    let nz: number
    if (distance < 1e-6) {
      // The direction has to come from somewhere deterministic, or the same
      // situation resolves differently on every run.
      const angle = (disc.x * 12.9898 + disc.z * 78.233) % (Math.PI * 2)
      nx = Math.cos(angle)
      nz = Math.sin(angle)
    } else {
      nx = dx / distance
      nz = dz / distance
    }

    // A hair beyond touching. Pushing exactly `reach` lands on the boundary,
    // where floating point leaves the body a fraction inside and the overlap
    // test still reports a hit -- so it gets pushed again every single frame.
    const push = reach - distance + SEPARATION_MARGIN
    const moved = moveWithCollision(level, px, pz, nx * push, nz * push, radius)
    px = moved.x
    pz = moved.z
  }

  return { x: px, z: pz }
}
