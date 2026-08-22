import * as THREE from 'three'
import { RetroRenderer } from './engine/renderer.ts'
import { Loop } from './engine/loop.ts'
import { Input } from './engine/input.ts'
import { parseLevel } from './world/level.ts'
import { buildLevelMeshes } from './world/geometry.ts'
import { createPlayer, EYE_HEIGHT, updatePlayer } from './player/controller.ts'
import { SLUG_BROWN, SLUG_DARK } from './data/palette.ts'
import e1m1 from './world/levels/e1m1.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')
if (!canvas) throw new Error('#viewport canvas missing')

const level = parseLevel(e1m1)
const view = new RetroRenderer(canvas)
const overlay = document.querySelector<HTMLElement>('#gate')
const s = level.cellSize

// Fog doubles as the far clip: it reaches full density before the camera's
// far plane, so the level ends in darkness rather than in a visible edge.
view.scene.fog = new THREE.FogExp2(0x0a1405, level.fog)
view.scene.background = new THREE.Color(0x0a1405)
view.scene.add(new THREE.AmbientLight(0xffffff, 0.75))

// A light on the camera, Doom-style: the world has no light sources of its
// own, so what you can see is what you are near.
const lantern = new THREE.PointLight(0xbfe08a, 60, 22, 1.6)
view.scene.add(lantern)

const meshes = buildLevelMeshes(level)
view.scene.add(meshes.group)

// Placeholder enemy markers until the real creatures land. Positioned from the
// level's own entity list so the map data is already driving them.
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
  marker.position.set(entity.x * s, isPickup ? 0.6 * s * 0.5 : 0.5 * s * 0.5, entity.z * s)
  marker.scale.setScalar(isPickup ? s * 0.18 : s * 0.3)
  view.scene.add(marker)
}

const player = createPlayer(level)
const input = new Input(canvas, () => overlay?.classList.add('hidden'))

new Loop({
  update(dt) {
    if (!input.isEngaged) {
      overlay?.classList.remove('hidden')
      return
    }
    updatePlayer(player, level, input, dt)
  },

  render() {
    const eyeY = (EYE_HEIGHT + player.eyeOffset) * level.wallHeight
    view.camera.position.set(player.x * s, eyeY, player.z * s)
    view.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')
    lantern.position.copy(view.camera.position)
    view.render()
  },
}).start()
