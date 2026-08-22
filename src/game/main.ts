import * as THREE from 'three'
import { RetroRenderer } from './engine/renderer.ts'
import { Loop } from './engine/loop.ts'
import { Input } from './engine/input.ts'
import { mulberry32 } from './engine/math.ts'
import { raycast } from './engine/collision.ts'
import { parseLevel } from './world/level.ts'
import { buildLevelMeshes } from './world/geometry.ts'
import { createPlayer, EYE_HEIGHT, updatePlayer } from './player/controller.ts'
import { SLUG_BROWN, SLUG_DARK } from './data/palette.ts'
import {
  addAmmo,
  createArsenal,
  cycleWeapon,
  definition,
  fire,
  giveWeapon,
  selectSlot,
  tickArsenal,
} from './weapons/arsenal.ts'
import { Viewmodel } from './weapons/viewmodel.ts'
import { Tracers } from './weapons/tracers.ts'
import {
  playDryFire,
  playGrinderBlast,
  playImpact,
  playSaltBlast,
  playSwitch,
  unlockAudio,
} from './audio/sfx.ts'
import e1m1 from './world/levels/e1m1.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')
if (!canvas) throw new Error('#viewport canvas missing')

const level = parseLevel(e1m1)
const view = new RetroRenderer(canvas)
const overlay = document.querySelector<HTMLElement>('#gate')
const s = level.cellSize
const rng = mulberry32(0xc0ffee)

view.scene.fog = new THREE.FogExp2(0x0a1405, level.fog)
view.scene.background = new THREE.Color(0x0a1405)
view.scene.add(new THREE.AmbientLight(0xffffff, 0.75))

const lantern = new THREE.PointLight(0xbfe08a, 60, 22, 1.6)
view.scene.add(lantern)

const meshes = buildLevelMeshes(level)
view.scene.add(meshes.group)

const tracers = new Tracers()
view.scene.add(tracers.mesh)

const markerGeo = new THREE.IcosahedronGeometry(0.5, 0)
for (const entity of level.entities) {
  const isPickup = entity.type === 'pickup'
  const marker = new THREE.Mesh(
    markerGeo,
    new THREE.MeshLambertMaterial({
      color: isPickup ? 0x54e508 : SLUG_BROWN,
      emissive: isPickup ? 0x143a02 : SLUG_DARK,
      flatShading: true,
    }),
  )
  marker.position.set(entity.x * s, isPickup ? 0.3 * s : 0.25 * s, entity.z * s)
  marker.scale.setScalar(isPickup ? s * 0.18 : s * 0.3)
  view.scene.add(marker)
}

const player = createPlayer(level)
const arsenal = createArsenal()
const viewmodel = new Viewmodel()

// Both weapons from the start while there is nothing to pick them up from.
// The pickup system in G5 is what makes this earned.
giveWeapon(arsenal, 'grinder')
addAmmo(arsenal, 'coarse', 24)

const input = new Input(canvas, () => {
  overlay?.classList.add('hidden')
  unlockAudio()
})

let lastPhase = arsenal.phase

/** Hitscan one pellet and draw what it did. */
function shootPellet(angleOffset: number): void {
  const yaw = player.yaw + angleOffset
  // Same basis as movement: a three.js camera looks down its own -Z.
  const dirX = -Math.sin(yaw)
  const dirZ = -Math.cos(yaw)
  const def = definition(arsenal)

  const hit = raycast(level, player.x, player.z, dirX, dirZ, def.range)
  const distance = hit ? hit.distance : def.range

  const eyeY = (EYE_HEIGHT + player.eyeOffset) * level.wallHeight
  const muzzleY = eyeY - 0.12 * level.wallHeight
  const endX = (player.x + dirX * distance) * s
  const endZ = (player.z + dirZ * distance) * s
  // Pitch only tilts the tracer; the hitscan itself is on the ground plane
  // until enemies have height in G3.
  const endY = eyeY + Math.tan(player.pitch) * distance * s * -1

  tracers.emitShot(player.x * s, muzzleY, player.z * s, endX, endY, endZ, 5)

  if (hit) {
    tracers.emitImpact(endX, endY, endZ, hit.normalX, hit.normalZ, rng)
    playImpact()
  }
}

new Loop({
  update(dt) {
    if (!input.isEngaged) {
      overlay?.classList.remove('hidden')
      return
    }

    const before = { x: player.x, z: player.z }
    updatePlayer(player, level, input, dt)
    const moving = Math.hypot(player.x - before.x, player.z - before.z) > 1e-5

    for (const slot of input.consumeSlots()) selectSlot(arsenal, slot)
    const wheel = input.consumeWheel()
    if (wheel !== 0) cycleWeapon(arsenal, wheel > 0 ? 1 : -1)

    if (input.isDown('fire')) {
      const result = fire(arsenal, rng)
      if (result.fired) {
        for (const angle of result.angles!) shootPellet(angle)
        viewmodel.onFire()
        if (result.def!.id === 'grinder') playGrinderBlast(rng())
        else playSaltBlast(rng())
        // Semi-automatic: drop the held flag so the shot needs a fresh click.
        if (!result.def!.automatic) input.releaseFire()
      } else if (result.reason === 'no-ammo') {
        playDryFire()
        input.releaseFire()
      }
    }

    tickArsenal(arsenal, dt)
    if (lastPhase === 'lowering' && arsenal.phase === 'raising') playSwitch()
    lastPhase = arsenal.phase

    viewmodel.update(arsenal, dt, player.bobPhase, moving)
    tracers.update(dt)
  },

  render() {
    const eyeY = (EYE_HEIGHT + player.eyeOffset) * level.wallHeight
    view.camera.position.set(player.x * s, eyeY, player.z * s)
    view.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')
    lantern.position.copy(view.camera.position)
    view.render(viewmodel)
  },
}).start()
