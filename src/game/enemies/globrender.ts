import * as THREE from 'three'
import type { Globs } from './projectiles.ts'

/**
 * Acid globs as one InstancedMesh, same reasoning as the salt tracers: a pool
 * of transforms rather than a stream of short-lived meshes.
 *
 * MeshBasicMaterial with `fog: false`, so a glob keeps its brightness at the
 * far end of a corridor. It is a warning, and a warning that fades into the
 * fog at exactly the distance you most need to see it is no use.
 */
export class GlobRenderer {
  readonly mesh: THREE.InstancedMesh
  private readonly dummy = new THREE.Object3D()

  constructor(count: number) {
    const geo = new THREE.IcosahedronGeometry(1, 0)
    const mat = new THREE.MeshBasicMaterial({ color: 0x9cff3a, fog: false })
    this.mesh = new THREE.InstancedMesh(geo, mat, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
  }

  sync(globs: Globs, cellSize: number): void {
    globs.items.forEach((glob, i) => {
      if (glob.active) {
        this.dummy.position.set(glob.x * cellSize, glob.worldY, glob.z * cellSize)
        // Wobble as it flies, so it reads as a thrown blob of something wet
        // rather than a bullet.
        const wobble = 1 + Math.sin(glob.age * 22) * 0.18
        this.dummy.scale.set(
          glob.radius * cellSize * wobble,
          glob.radius * cellSize * (2 - wobble),
          glob.radius * cellSize * wobble,
        )
        this.dummy.rotation.set(glob.age * 6, glob.age * 4, 0)
      } else {
        this.dummy.scale.setScalar(0)
        this.dummy.position.set(0, 0, 0)
        this.dummy.rotation.set(0, 0, 0)
      }
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }
}
