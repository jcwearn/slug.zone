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
import { ScreenLayer, type Notice } from './ui/screen.ts'
import type { Expression } from './ui/face.ts'
import { collect, createPickups, pickupsTouching, resetPickups } from './pickups/pickups.ts'
import { buildPickupView, posePickup } from './pickups/render.ts'
import { LIME } from './data/palette.ts'
import { buildDoors, resetDoors, tickDoors, tryOpen, useHint, useTarget } from './world/doors.ts'
import { DoorViews } from './world/doorview.ts'
import { createExplored, resetExplored, revealFrom } from './world/explored.ts'
import { atExit, createSession, finishLevel, tickRun } from './session.ts'
import { createTally, snapTally, stepTally, type Tally } from './ui/tally.ts'
import { browserStorage, loadRecords, recordTime, saveRecords } from './save/scores.ts'
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
  createArsenal,
  cycleWeapon,
  damageAtRange,
  definition,
  fire,
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
  playPickup,
  playKeyPickup,
  playDoor,
  playLocked,
  playSecret,
  playExit,
  playTallyTick,
  unlockAudio,
} from './audio/sfx.ts'
import e1m1 from './world/levels/e1m1.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')
if (!canvas) throw new Error('#viewport canvas missing')

/** The site lime, as the message line's CSS colour. Derived, never retyped. */
const LIME_TEXT = `#${LIME.toString(16).padStart(6, '0')}`
/** A refusal reads in the same red the status bar warns in. */
const LOCKED_TEXT = '#c8341a'

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

// The leaves are separate meshes because a face merged into the level's static
// batches cannot move. geometry.ts emits the floor and ceiling they uncover.
const doors = buildDoors(level)
const doorViews = new DoorViews(doors, level)
view.scene.add(doorViews.group)

const tracers = new Tracers()
view.scene.add(tracers.mesh)

const globs = new Globs()
const globRenderer = new GlobRenderer(globs.items.length)
view.scene.add(globRenderer.mesh)

const pickups = createPickups(level)
const pickupViews = pickups.map((pickup) => {
  const pickupView = buildPickupView(pickup.def)
  view.scene.add(pickupView.group)
  return pickupView
})

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
const screen = new ScreenLayer(level)
const keys = new Set<string>()

const explored = createExplored(level)
/**
 * How many cells the map holds, so the minimap knows when to repaint.
 *
 * Counted rather than recomputed from the fog every frame: `revealFrom` already
 * reports what it added, and summing that is free next to walking every cell.
 */
let charted = 0

const session = createSession(level, live.length, pickups.length)
const store = browserStorage()
let tally: Tally | null = null

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
/** Shared animation phase for every item on the floor. */
let itemClock = 0

function expressionNow(): Expression {
  if (health.painFlash > 0.25) return 'hurt'
  if (snarlTimer > 0) return 'snarl'
  const turn = player.yaw - previousYaw
  if (turn > 0.02) return 'left'
  if (turn < -0.02) return 'right'
  return 'neutral'
}
const viewmodel = new Viewmodel()

/**
 * The top-of-screen notice, and how long it has left.
 *
 * Long enough to read while running, short enough that it is gone before the
 * next one arrives -- a line that lingers turns a fight through a supply room
 * into a stack of stale text.
 */
const NOTICE_TIME = 2.2
let notice: Notice = { text: '', colour: '' }
let noticeTimer = 0

function say(text: string, colour: string): void {
  notice = { text, colour }
  noticeTimer = NOTICE_TIME
}

/**
 * The line under the crosshair telling you what use would do right now.
 *
 * Recomputed every frame from the same `peekUse` the use key itself calls, so
 * the hint cannot promise a door the key would refuse to open. It costs one
 * short DDA raycast, and the band only repaints when the text changes.
 *
 * A closed secret deliberately shows nothing -- `useHint` is where that lives.
 */
function promptNow(): Notice {
  const hint = useHint(level, doors, player.x, player.z, player.yaw, keys)
  if (hint.kind === 'open') return { text: 'PRESS E TO OPEN', colour: LIME_TEXT }
  if (hint.kind === 'locked') {
    return { text: `${hint.key.toUpperCase()} KEYCARD REQUIRED`, colour: LOCKED_TEXT }
  }
  return { text: '', colour: '' }
}

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
  // Back to the Salt Shaker and nothing else. Keeping the Grinder across a
  // death would make the first run the only one that has to find it.
  Object.assign(arsenal, createArsenal())

  for (const entry of live) {
    entry.enemy = spawnEnemy(entry.enemy.def.id, entry.spawnX, entry.spawnZ)
    entry.wasIdle = true
  }

  resetPickups(pickups)
  resetExplored(explored)
  charted = 0
  screen.clearMinimap()
  // `cell.open` outlives a restart because the Level object is reused -- that
  // is the whole reason this is not a page reload. Without resetDoors the
  // second run starts with every door already standing open.
  resetDoors(doors, level)
  doorViews.sync(doors, level)

  globs.clear()
  keys.clear()
  notice = { text: '', colour: '' }
  noticeTimer = 0

  Object.assign(session, createSession(level, live.length, pickups.length))
  tally = null
  screen.hideTally()
  deathScreen?.classList.add('hidden')
}

/** The card a locked door wants, phrased for the message line. */
function lockedMessage(key: string): string {
  return `YOU NEED THE ${key.toUpperCase()} KEYCARD`
}

/**
 * Reaching the exit: stop the clock, save the time, and build the tally.
 *
 * The record is read and written here rather than on the intermission screen,
 * so the number shown is the one that was actually stored.
 */
function completeLevel(): void {
  finishLevel(session)
  const records = loadRecords(store)
  const result = recordTime(records, level.id, session.elapsed)
  if (result.improved) saveRecords(store, records)
  tally = createTally(session, result.previous ?? result.best, result.improved)
  playExit()
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
      session.phase = 'dead'
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

    if (tally) {
      const step = stepTally(tally, dt)
      if (step.ticked) playTallyTick()

      // The same two-stage press the death screen uses, for the same reason:
      // the fire button is still down from the last thing you shot. The first
      // press skips the count-up, the second replays -- with a beat in between
      // so a held button cannot do both.
      if (input.isDown('fire')) {
        input.releaseFire()
        if (!tally.done) snapTally(tally)
        else if (tally.hold > 0.4) restart()
      }

      screen.showTally(level.name, tally)
      screen.update(health, arsenal, keys, 'neutral', { text: '', colour: '' })
      // Doors keep moving so a leaf caught mid-rise is not frozen behind the
      // tally, and the enemies are deliberately left where they stood.
      tickDoors(doors, level, dt)
      doorViews.sync(doors, level)
      return
    }

    tickRun(session, dt)

    const before = { x: player.x, z: player.z }
    // Live slugs only -- corpses are scenery you walk over.
    const blockers: Disc[] = targetable(live.map((l) => l.enemy)).map((e) => ({
      x: e.x,
      z: e.z,
      radius: e.def.radius,
    }))
    updatePlayer(player, level, input, dt, blockers)
    const moving = Math.hypot(player.x - before.x, player.z - before.z) > 1e-5

    // Collected where the player ACTUALLY ended up, after walls and slugs have
    // had their say -- testing the position they asked for would let you grab
    // an item through a door you were standing against.
    for (const item of pickupsTouching(pickups, player.x, player.z, PLAYER_RADIUS)) {
      const result = collect(item.def, { health, arsenal, keys })
      if (!result.taken) continue
      item.taken = true
      session.items++
      say(result.message, LIME_TEXT)
      if (item.def.effect.kind === 'key') playKeyPickup()
      else playPickup()
    }

    // Use, before the exit check: a door opened on the tick you step onto the
    // exit should still open.
    if (input.consumeUse()) {
      const target = useTarget(level, player.x, player.z, player.yaw)
      const result = target
        ? tryOpen(doors, target.x, target.z, keys)
        : { outcome: 'none' as const }

      if (result.outcome === 'opened') {
        playDoor()
        if (result.door?.secret) {
          session.secrets++
          say('A SECRET IS REVEALED', LIME_TEXT)
          playSecret()
        }
      } else if (result.outcome === 'locked' && result.door?.key) {
        // Counted at the moment of use rather than when the leaf finishes, so
        // the credit lands when the discovery does.
        say(lockedMessage(result.door.key), LOCKED_TEXT)
        playLocked()
      }
    }

    tickDoors(doors, level, dt)

    if (atExit(level, player.x, player.z)) {
      completeLevel()
      return
    }

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
      // `justDied` is already a one-tick flag, so no edge tracking needed.
      if (entry.enemy.mind.justDied) session.kills++

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

    // One clock for every item, so a room full of them pulses together rather
    // than each bobbing on its own phase.
    itemClock += dt
    for (let i = 0; i < pickups.length; i++) {
      posePickup(pickupViews[i], pickups[i], s, level.wallHeight, itemClock)
    }
    doorViews.sync(doors, level)

    // After the doors, so a door opened this frame charts what it opened onto
    // rather than waiting for the player to take another step.
    charted += revealFrom(level, explored, player.x, player.z)
    screen.updateMinimap(level, explored, player.x, player.z, player.yaw, charted)

    tickHealth(health, dt)
    snarlTimer = Math.max(0, snarlTimer - dt)
    noticeTimer = Math.max(0, noticeTimer - dt)
    if (noticeTimer === 0 && notice.text !== '') notice = { text: '', colour: '' }
    screen.update(health, arsenal, keys, expressionNow(), notice, promptNow())
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
