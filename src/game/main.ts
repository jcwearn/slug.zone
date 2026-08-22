import * as THREE from 'three'
import { RetroRenderer } from './engine/renderer.ts'
import { Loop } from './engine/loop.ts'
import { Input } from './engine/input.ts'
import { mulberry32 } from './engine/math.ts'
import { PLAYER_RADIUS, raycast, type Disc } from './engine/collision.ts'
import { parseLevel } from './world/level.ts'
import { worldSpace } from './world/space.ts'
import { buildLevelMeshes } from './world/geometry.ts'
import { createPlayer, EYE_HEIGHT, updatePlayer } from './player/controller.ts'
import { createHealth, damagePlayer, tickHealth } from './player/health.ts'
import { ScreenLayer } from './ui/screen.ts'
import type { Expression } from './ui/face.ts'
import { aimDirection, shotEndpoint } from './player/aim.ts'
import {
  enemyCylinder,
  separateEnemies,
  spawnEnemy,
  targetable,
  updateEnemy,
  type Enemy,
} from './enemies/enemy.ts'
import { buildEnemyView, poseEnemy, type EnemyView } from './enemies/render.ts'
import { damage as damageEnemy, isAlive } from './enemies/fsm.ts'
import { nearestHit, verticalAutoAim } from './enemies/hitscan.ts'
import { Globs } from './enemies/projectiles.ts'
import { GlobRenderer } from './enemies/globrender.ts'
import {
  addAmmo,
  createArsenal,
  cycleWeapon,
  damageAtRange,
  definition,
  fire,
  giveWeapon,
  selectSlot,
  tickArsenal,
} from './weapons/arsenal.ts'
import { Viewmodel } from './weapons/viewmodel.ts'
import { Tracers } from './weapons/tracers.ts'
import {
  playAlert,
  playDryFire,
  playGib,
  playSquelch,
  playGrinderBlast,
  playImpact,
  playDeath,
  playHurt,
  playSaltBlast,
  playSplat,
  playSpit,
  playSwitch,
  unlockAudio,
} from './audio/sfx.ts'
import e1m1 from './world/levels/e1m1.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')
if (!canvas) throw new Error('#viewport canvas missing')

const level = parseLevel(e1m1)
const view = new RetroRenderer(canvas)
const overlay = document.querySelector<HTMLElement>('#gate')
const space = worldSpace(level)
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

const globs = new Globs()
const globRenderer = new GlobRenderer(globs.items.length)
view.scene.add(globRenderer.mesh)

// Pickups are still inert markers; they become real in G5.
const markerGeo = new THREE.IcosahedronGeometry(0.5, 0)
const markerMat = new THREE.MeshLambertMaterial({
  color: 0x54e508,
  emissive: 0x143a02,
  flatShading: true,
})
for (const entity of level.entities.filter((e) => e.type === 'pickup')) {
  const marker = new THREE.Mesh(markerGeo, markerMat)
  marker.position.set(entity.x * s, 0.3 * level.wallHeight, entity.z * s)
  marker.scale.setScalar(s * 0.18)
  view.scene.add(marker)
}

interface Live {
  enemy: Enemy
  view: EnemyView
  /** Whether it had noticed the player last tick, for the alert sound. */
  wasIdle: boolean
  /** Where it started, so a restart can put it back. */
  spawnX: number
  spawnZ: number
}

const live: Live[] = []
for (const entity of level.entities) {
  if (entity.type === 'pickup') continue
  const enemy = spawnEnemy(entity.type, entity.x, entity.z)
  const enemyView = buildEnemyView(enemy.def)
  view.scene.add(enemyView.group)
  live.push({ enemy, view: enemyView, wasIdle: true, spawnX: entity.x, spawnZ: entity.z })
}

const player = createPlayer(level)
const health = createHealth()
const arsenal = createArsenal()
const screen = new ScreenLayer()
const keys = new Set<string>()

/**
 * Which portrait frame to show.
 *
 * Ordered by urgency: pain beats everything, then firing, then which way you
 * are turning. The look frames key off actual yaw change rather than which
 * key is held, so turning with the mouse counts too -- and the threshold stops
 * the face flickering on tiny mouse jitter while you stand still.
 */
let snarlTimer = 0
let previousYaw = player.yaw

function expressionNow(): Expression {
  if (health.painFlash > 0.25) return 'hurt'
  if (snarlTimer > 0) return 'snarl'
  const turn = player.yaw - previousYaw
  if (turn > 0.02) return 'left'
  if (turn < -0.02) return 'right'
  return 'neutral'
}
const viewmodel = new Viewmodel()

// Both weapons from the start while there is nothing to pick them up from.
// The pickup system in G5 is what makes this earned.
giveWeapon(arsenal, 'grinder')
addAmmo(arsenal, 'coarse', 24)

const input = new Input(canvas, () => {
  overlay?.classList.add('hidden')
  unlockAudio()
})

const deathScreen = document.querySelector<HTMLElement>('#dead')

/**
 * Put everything back for another go.
 *
 * A full reset rather than a page reload: reloading rebuilds the level meshes
 * and regenerates every texture, which is a visible pause for something that
 * should be instant.
 */
function restart(): void {
  const fresh = createPlayer(level)
  Object.assign(player, fresh)

  Object.assign(health, createHealth())

  for (const entry of live) {
    const spawn = level.entities.find(
      (e) => e.type === entry.enemy.def.id && e.x === entry.spawnX && e.z === entry.spawnZ,
    )
    entry.enemy = spawnEnemy(entry.enemy.def.id, entry.spawnX, entry.spawnZ)
    entry.wasIdle = true
    void spawn
  }

  globs.clear()
  keys.clear()
  deathScreen?.classList.add('hidden')
}

let lastPhase = arsenal.phase

/** Hitscan one pellet and draw what it did. */
/**
 * Doom-style vertical aim assist, in radians.
 *
 * A Grub is knee-high and the player's eye is well above it, so a level shot
 * passes over its head. Doom avoided this by not having free look at all. The
 * cone is a full 3D angle, so aiming deliberately at the ceiling still misses.
 */
const AUTOAIM_CONE = 0.25

function shootPellet(angleOffset: number): void {
  const def = definition(arsenal)
  const raw = aimDirection(player.yaw + angleOffset, player.pitch)

  const targets = targetable(live.map((l) => l.enemy)).map((enemy) => ({
    target: enemy,
    cylinder: enemyCylinder(enemy, s, level.wallHeight),
  }))

  // Y is NOT scaled by cellSize. geometry.ts builds walls from 0 to
  // `wallHeight` while X and Z are multiplied by `cellSize`, so the room is
  // wallHeight units tall and the camera sits at eyeY directly. worldSpace is
  // the one place that knows this.
  const eyeY = space.eyeY(EYE_HEIGHT + player.eyeOffset)

  const dir = verticalAutoAim(
    player.x * s,
    eyeY,
    player.z * s,
    raw.x,
    raw.y,
    raw.z,
    targets,
    def.range * s,
    AUTOAIM_CONE,
  )

  // The wall raycast is 2D on the ground plane, so it yields a HORIZONTAL
  // distance; shotEndpoint converts that to a distance along the pitched ray
  // and clips it against the floor and ceiling.
  const horizontal = Math.hypot(dir.x, dir.z)
  const wallHit =
    horizontal > 1e-6 ? raycast(level, player.x, player.z, dir.x, dir.z, def.range) : null

  const end = shotEndpoint(
    eyeY,
    dir,
    (wallHit ? wallHit.distance : Infinity) * s,
    def.range * s,
    space.floorY,
    space.ceilingY,
  )

  const originX = player.x * s
  const originZ = player.z * s

  // Offset the visual origin down and to the right so the spray leaves the
  // shaker in your hand rather than the middle of your forehead.
  const rightX = Math.cos(player.yaw)
  const rightZ = -Math.sin(player.yaw)
  const muzzleX = originX + rightX * 0.35 + dir.x * 0.5
  const muzzleZ = originZ + rightZ * 0.35 + dir.z * 0.5
  const muzzleY = eyeY - 0.22

  const endX = originX + dir.x * end.distance
  const endY = eyeY + dir.y * end.distance
  const endZ = originZ + dir.z * end.distance

  // Enemies are tested only out to the wall distance, so a shot can never
  // kill something in the next room.
  const struck = nearestHit(muzzleX, muzzleY, muzzleZ, dir.x, dir.y, dir.z, targets, end.distance)

  if (struck) {
    const dealt = damageAtRange(def, struck.distance / s)
    const wasAlive = isAlive(struck.target.mind)
    damageEnemy(struck.target.mind, struck.target.def, dealt, rng)

    const hx = muzzleX + dir.x * struck.distance
    const hy = muzzleY + dir.y * struck.distance
    const hz = muzzleZ + dir.z * struck.distance
    tracers.emitShot(muzzleX, muzzleY, muzzleZ, hx, hy, hz, rng)
    tracers.emitImpact(hx, hy, hz, -dir.x, -dir.z, rng)

    if (wasAlive && struck.target.mind.justDied) {
      if (struck.target.mind.gibbed) playGib()
      else playSquelch(rng())
    } else {
      playSquelch(rng() * 0.5)
    }
    return
  }

  tracers.emitShot(muzzleX, muzzleY, muzzleZ, endX, endY, endZ, rng)

  if (end.stoppedBy !== 'range') {
    // Scatter off whatever was actually hit, using that surface's normal.
    const nx = end.stoppedBy === 'wall' && wallHit ? wallHit.normalX : 0
    const nz = end.stoppedBy === 'wall' && wallHit ? wallHit.normalZ : 0
    tracers.emitImpact(endX, endY, endZ, nx, nz, rng)
    playImpact()
  }
}

new Loop({
  update(dt) {
    if (!input.isEngaged) {
      overlay?.classList.remove('hidden')
      return
    }

    if (health.dead) {
      deathScreen?.classList.remove('hidden')
      // Fire restarts. The button is already down from whatever killed you, so
      // it has to be released first or the click that killed you also skips
      // the death screen.
      if (input.isDown('fire')) {
        input.releaseFire()
        restart()
      }
      tickHealth(health, dt)
      screen.update(health, arsenal, keys)
      return
    }

    const before = { x: player.x, z: player.z }
    // Live slugs only -- corpses are scenery you walk over.
    const blockers: Disc[] = targetable(live.map((l) => l.enemy)).map((e) => ({
      x: e.x,
      z: e.z,
      radius: e.def.radius,
    }))
    updatePlayer(player, level, input, dt, blockers)
    const moving = Math.hypot(player.x - before.x, player.z - before.z) > 1e-5

    for (const slot of input.consumeSlots()) selectSlot(arsenal, slot)
    const wheel = input.consumeWheel()
    if (wheel !== 0) cycleWeapon(arsenal, wheel > 0 ? 1 : -1)

    if (input.isDown('fire')) {
      const result = fire(arsenal, rng)
      if (result.fired) {
        for (const angle of result.angles!) shootPellet(angle)
        viewmodel.onFire()
        snarlTimer = 0.35
        if (result.def!.id === 'grinder') playGrinderBlast(rng())
        else playSaltBlast(rng())
        // Semi-automatic: drop the held flag so the shot needs a fresh click.
        if (!result.def!.automatic) input.releaseFire()
      } else if (result.reason === 'no-ammo') {
        playDryFire()
        input.releaseFire()
      }
    }

    for (const entry of live) {
      updateEnemy(entry.enemy, level, player.x, player.z, dt, PLAYER_RADIUS)
      const nowIdle = entry.enemy.mind.state === 'idle'
      if (entry.wasIdle && !nowIdle) playAlert(rng())
      entry.wasIdle = nowIdle

      // The strike lands at the end of the wind-up, and only if the player is
      // still in range -- the FSM already decided that.
      if (entry.enemy.mind.didStrike) {
        const ranged = entry.enemy.def.projectile
        if (ranged) {
          // Launched from the creature's own height toward the player's chest,
          // so the arc is visible against the floor rather than skimming it.
          const glob = globs.spawn(
            entry.enemy.x,
            entry.enemy.z,
            entry.enemy.def.height * level.wallHeight * 0.8,
            player.x,
            player.z,
            space.eyeY(EYE_HEIGHT) - 0.35,
            ranged.speed,
            entry.enemy.def.damage,
          )
          if (glob) {
            glob.radius = ranged.radius
            playSpit(rng())
          }
        } else {
          const result = damagePlayer(health, entry.enemy.def.damage)
          if (result.died) playDeath()
          else if (result.applied) playHurt(rng())
        }
      }
    }

    // After everyone has moved, so the push resolves the positions they
    // actually ended up in rather than the ones they started from.
    separateEnemies(
      live.map((l) => l.enemy),
      level,
    )

    for (const outcome of globs.step(
      level,
      dt,
      player.x,
      player.z,
      PLAYER_RADIUS,
      level.wallHeight,
      space.floorY,
      // A little above the eye, so a glob aimed at your face connects rather
      // than clipping past the top of the hitbox.
      space.eyeY(EYE_HEIGHT + player.eyeOffset) + 0.25,
    )) {
      const worldX = outcome.kind === 'none' ? 0 : outcome.x * s
      const worldZ = outcome.kind === 'none' ? 0 : outcome.z * s
      if (outcome.kind === 'hit') {
        const result = damagePlayer(health, outcome.damage)
        if (result.died) playDeath()
        else if (result.applied) playHurt(rng())
        tracers.emitImpact(worldX, outcome.worldY, worldZ, 0, 0, rng)
      } else if (outcome.kind === 'wall' || outcome.kind === 'expired') {
        tracers.emitImpact(worldX, outcome.worldY, worldZ, 0, 0, rng)
        playSplat()
      }
    }

    tickArsenal(arsenal, dt)
    if (lastPhase === 'lowering' && arsenal.phase === 'raising') playSwitch()
    lastPhase = arsenal.phase

    for (const entry of live) poseEnemy(entry.view, entry.enemy, s, level.wallHeight, dt)

    tickHealth(health, dt)
    snarlTimer = Math.max(0, snarlTimer - dt)
    screen.update(health, arsenal, keys, expressionNow())
    previousYaw = player.yaw
    viewmodel.update(arsenal, dt, player.bobPhase, moving)
    tracers.update(dt)
    globRenderer.sync(globs, s)
  },

  render() {
    const eyeY = space.eyeY(EYE_HEIGHT + player.eyeOffset)
    view.camera.position.set(player.x * s, eyeY, player.z * s)
    view.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')
    lantern.position.copy(view.camera.position)
    view.render(viewmodel, screen)
  },
}).start()
