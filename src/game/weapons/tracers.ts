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

const MAX_GRAINS = 256
const GRAIN_LIFETIME = 0.42
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
   * Emit a streak of grains along a shot, from muzzle to impact point.
   *
   * The shot is hitscan -- the damage already happened -- so this is purely
   * the visual, spread along the path so the eye reads a direction rather than
   * a dot appearing at the far end.
   */
  emitShot(
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
    count = 5,
  ): void {
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1)
      this.spawn(
        fromX + (toX - fromX) * t,
        fromY + (toY - fromY) * t,
        fromZ + (toZ - fromZ) * t,
        0,
        0,
        0,
        0.035,
        GRAIN_LIFETIME * (0.3 + t * 0.7),
      )
    }
  }

  /** Grains scattering off a surface. */
  emitImpact(x: number, y: number, z: number, nx: number, nz: number, rng: () => number): void {
    for (let i = 0; i < 7; i++) {
      this.spawn(
        x,
        y,
        z,
        nx * (0.6 + rng() * 1.6) + (rng() - 0.5) * 1.2,
        1.2 + rng() * 1.8,
        nz * (0.6 + rng() * 1.6) + (rng() - 0.5) * 1.2,
        0.03,
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
