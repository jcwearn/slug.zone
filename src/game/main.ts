import * as THREE from 'three'
import { RetroRenderer } from './engine/renderer.ts'
import { Loop } from './engine/loop.ts'
import { Input, moveVector } from './engine/input.ts'
import { clamp } from './engine/math.ts'
import { LIME, SLUG_BROWN, WALL_BRICK, FLOOR_DAMP } from './data/palette.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')
if (!canvas) throw new Error('#viewport canvas missing')

const view = new RetroRenderer(canvas)
const overlay = document.querySelector<HTMLElement>('#gate')

// Fog in the site's lime, which is what gives the scene its depth cueing --
// and, not incidentally, hides the far clip plane the way Doom's did.
view.scene.fog = new THREE.Fog(0x0a1405, 4, 44)
view.scene.background = new THREE.Color(0x0a1405)

view.scene.add(new THREE.AmbientLight(0xffffff, 0.55))
const lamp = new THREE.PointLight(LIME, 40, 60)
lamp.position.set(0, 3, 0)
view.scene.add(lamp)

// A placeholder room. Real geometry arrives with the level format; this exists
// so movement, collision-free walking, and the upscale can all be judged
// against something with edges and a floor.
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshLambertMaterial({ color: FLOOR_DAMP }),
)
floor.rotation.x = -Math.PI / 2
view.scene.add(floor)

const pillarGeo = new THREE.BoxGeometry(2, 5, 2)
const pillarMat = new THREE.MeshLambertMaterial({ color: WALL_BRICK })
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2
  const pillar = new THREE.Mesh(pillarGeo, pillarMat)
  pillar.position.set(Math.cos(a) * 12, 2.5, Math.sin(a) * 12)
  view.scene.add(pillar)
}

const blob = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1, 1),
  new THREE.MeshLambertMaterial({ color: SLUG_BROWN, flatShading: true }),
)
blob.position.set(0, 1.2, -6)
view.scene.add(blob)

const player = { x: 0, y: 1.6, z: 6, yaw: 0, pitch: 0 }
let elapsed = 0
const SPEED = 6
const RUN_MULTIPLIER = 1.7

const input = new Input(canvas, () => overlay?.classList.add('hidden'))

const loop = new Loop({
  update(dt) {
    if (!input.isEngaged) {
      overlay?.classList.remove('hidden')
      return
    }

    const look = input.consumeLook()
    player.yaw += look.yaw
    // Clamped just shy of straight up/down. At exactly +/-PI/2 the camera
    // basis degenerates and the view rolls.
    player.pitch = clamp(player.pitch + look.pitch, -1.5, 1.5)

    const move = moveVector((a) => input.isDown(a))
    const speed = SPEED * (input.isDown('run') ? RUN_MULTIPLIER : 1) * dt
    const sin = Math.sin(player.yaw)
    const cos = Math.cos(player.yaw)
    player.x += (move.x * cos - move.z * sin) * speed
    player.z += (move.x * sin + move.z * cos) * speed

    elapsed += dt
    blob.rotation.y += dt * 0.8
    blob.position.y = 1.2 + Math.sin(elapsed * 1.6) * 0.15
  },

  render() {
    view.camera.position.set(player.x, player.y, player.z)
    view.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')
    view.render()
  },
})

loop.start()
