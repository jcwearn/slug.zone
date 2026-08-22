import * as THREE from 'three'

/**
 * Salt grains in flight and the puffs they leave on impact.
 *
 * A fixed pool, reused. The Grinder emits eight per shot and the Ice Melter
 * will emit far more, so allocating a mesh per grain would produce hundreds of
 * short-lived objects a second -- and the resulting GC pauses land as visible
 * hitches in a game running a fixed timestep.
 *
 * All grains share one geometry and one material, and the whole pool is a
 * single InstancedMesh, so the cost is one draw call regardless of how many
 * are alive.
 */

const MAX_GRAINS = 512
const PUFF_LIFETIME = 0.3

interface Grain {
  alive: boolean
  age: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  scale: number
}

export class Tracers {
  readonly mesh: THREE.InstancedMesh
  private readonly grains: Grain[] = []
  private readonly dummy = new THREE.Object3D()
  private next = 0

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshBasicMaterial({ color: 0xfdfbf0, fog: false })
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_GRAINS)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.mesh.count = MAX_GRAINS

    for (let i = 0; i < MAX_GRAINS; i++) {
      this.grains.push({
        alive: false,
        age: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 0,
      })
    }
    // Park every instance at zero scale so nothing shows before first use.
    this.sync()
  }

  /**
   * Spray grains from the muzzle toward the impact point.
   *
   * The shot itself is hitscan -- damage already happened -- but grains that
   * simply appear along the line read as a flicker, not as salt leaving a
   * shaker. So each grain is launched from the muzzle with a velocity that
   * carries it most of the way there within its lifetime, with lateral jitter
   * and a little gravity. The eye reads travel, which is the whole point.
   *
   * Sizes are in WORLD units, where a cell is `cellSize` across. The first
   * version used 0.035, which is well under a pixel at any real distance --
   * technically drawn, entirely invisible.
   */
  emitShot(
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
    rng: () => number,
  ): void {
    const dx = toX - fromX
    const dy = toY - fromY
    const dz = toZ - fromZ
    const distance = Math.hypot(dx, dy, dz)
    if (distance < 1e-6) return

    const ux = dx / distance
    const uy = dy / distance
    const uz = dz / distance

    // Perpendicular basis for the jitter, so scatter is across the shot rather
    // than along it.
    const px = -uz
    const pz = ux
    const TRAVEL = 0.11

    for (let i = 0; i < 16; i++) {
      // Grains fall short by varying amounts, which gives the spray a tail
      // instead of a solid bar.
      const reach = 0.45 + rng() * 0.55
      const life = TRAVEL * (0.55 + rng() * 0.45)
      const speed = (distance * reach) / TRAVEL

      const spreadSide = (rng() - 0.5) * 0.09
      const spreadUp = (rng() - 0.5) * 0.09

      this.spawn(
        fromX + ux * 0.05,
        fromY + uy * 0.05,
        fromZ + uz * 0.05,
        (ux + px * spreadSide) * speed,
        (uy + spreadUp) * speed,
        (uz + pz * spreadSide) * speed,
        0.055 + rng() * 0.075,
        life,
      )
    }

    // A few grains that spill out of the shaker and drop, rather than being
    // fired. Cheap, and it sells the object as a condiment.
    for (let i = 0; i < 3; i++) {
      this.spawn(
        fromX,
        fromY,
        fromZ,
        ux * (0.4 + rng()) + (rng() - 0.5) * 0.8,
        0.4 + rng() * 0.6,
        uz * (0.4 + rng()) + (rng() - 0.5) * 0.8,
        0.05 + rng() * 0.04,
        0.45,
      )
    }
  }

  /** Grains scattering off a surface. */
  emitImpact(x: number, y: number, z: number, nx: number, nz: number, rng: () => number): void {
    for (let i = 0; i < 10; i++) {
      this.spawn(
        x,
        y,
        z,
        nx * (0.8 + rng() * 2.2) + (rng() - 0.5) * 1.6,
        1.4 + rng() * 2.2,
        nz * (0.8 + rng() * 2.2) + (rng() - 0.5) * 1.6,
        0.05 + rng() * 0.05,
        PUFF_LIFETIME,
      )
    }
  }

  private spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    scale: number,
    lifetime: number,
  ): void {
    // Round-robin. When the pool is exhausted the oldest grain is overwritten,
    // which is the right failure mode: a dropped particle nobody notices,
    // rather than a growing array nobody bounded.
    const grain = this.grains[this.next]
    this.next = (this.next + 1) % MAX_GRAINS
    grain.alive = true
    grain.age = lifetime
    grain.x = x
    grain.y = y
    grain.z = z
    grain.vx = vx
    grain.vy = vy
    grain.vz = vz
    grain.scale = scale
  }

  update(dt: number): void {
    for (const grain of this.grains) {
      if (!grain.alive) continue
      grain.age -= dt
      if (grain.age <= 0) {
        grain.alive = false
        continue
      }
      grain.vy -= 9 * dt
      grain.x += grain.vx * dt
      grain.y += grain.vy * dt
      grain.z += grain.vz * dt
    }
    this.sync()
  }

  private sync(): void {
    for (let i = 0; i < MAX_GRAINS; i++) {
      const grain = this.grains[i]
      if (grain.alive) {
        this.dummy.position.set(grain.x, grain.y, grain.z)
        this.dummy.scale.setScalar(grain.scale)
      } else {
        // Zero scale rather than moving it away: a degenerate instance is
        // cheaper to reject than one that still has to be transformed and
        // clipped.
        this.dummy.scale.setScalar(0)
        this.dummy.position.set(0, 0, 0)
      }
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }
}
