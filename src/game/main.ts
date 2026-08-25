import * as THREE from 'three'
import { RetroRenderer } from './engine/renderer.ts'
import { Loop } from './engine/loop.ts'
import { Input } from './engine/input.ts'
import { mulberry32 } from './engine/math.ts'
import { PLAYER_RADIUS, raycast, type Disc } from './engine/collision.ts'
import { parseLevel } from './world/level.ts'
import { loadWorld, respawnEnemies, unloadWorld } from './world/scene.ts'
import { LEVELS } from './world/levels/index.ts'
import { carryInto, onward, type Onward } from './campaign.ts'
import type { LevelSource } from './world/types.ts'
import { createPlayer, EYE_HEIGHT, updatePlayer } from './player/controller.ts'
import { createHealth, damagePlayer, tickHealth } from './player/health.ts'
import { ScreenLayer, type Notice } from './ui/screen.ts'
import type { Expression } from './ui/face.ts'
import { collect, pickupsTouching, resetPickups } from './pickups/pickups.ts'
import { posePickup } from './pickups/render.ts'
import { LIME } from './data/palette.ts'
import { resetDoors, tickDoors, tryOpen, useHint, useTarget } from './world/doors.ts'
import { resetExplored, revealFrom } from './world/explored.ts'
import { atExit, createSession, finishLevel, tickRun } from './session.ts'
import { createTally, pressTally, snapTally, stepTally, type Tally } from './ui/tally.ts'
import { browserStorage, loadRecords, recordTime, saveRecords } from './save/scores.ts'
import { loadSettings, saveSettings, stepVolume, volumePercent } from './save/settings.ts'
import { aimDirection, shotEndpoint } from './player/aim.ts'
import {
  armourScale,
  burstChain,
  burstDamage,
  enemyCylinder,
  separateEnemies,
  targetable,
  updateEnemy,
  type Enemy,
} from './enemies/enemy.ts'
import { poseEnemy } from './enemies/render.ts'
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
  playRicochet,
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
import { musicVolume, setMusicVolume, startMusic, toggleMusic } from './audio/music.ts'

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')
if (!canvas) throw new Error('#viewport canvas missing')

/** The site lime, as the message line's CSS colour. Derived, never retyped. */
const LIME_TEXT = `#${LIME.toString(16).padStart(6, '0')}`
/** A refusal reads in the same red the status bar warns in. */
const LOCKED_TEXT = '#c8341a'

const view = new RetroRenderer(canvas)
const overlay = document.querySelector<HTMLElement>('#gate')
const rng = mulberry32(0xc0ffee)

view.scene.fog = new THREE.FogExp2(0x0a1405, 0)
view.scene.background = new THREE.Color(0x0a1405)
view.scene.add(new THREE.AmbientLight(0xffffff, 0.75))

const lantern = new THREE.PointLight(0xbfe08a, 60, 22, 1.6)
view.scene.add(lantern)

const tracers = new Tracers()
view.scene.add(tracers.mesh)

const globs = new Globs()
const globRenderer = new GlobRenderer(globs.items.length)
view.scene.add(globRenderer.mesh)

/**
 * Everything belonging to the level currently being played.
 *
 * A `let`, and the one in the file: a level transition swaps this whole object
 * rather than reassigning a dozen module-level bindings, so there is no way to
 * rebuild thirteen of fourteen things and ship the fourteenth stale. See
 * `world/scene.ts`.
 */
let world = loadWorld(parseLevel(LEVELS[0]), view.scene)
applyLevelStyling()

/**
 * Fog is MUTATED rather than replaced, because changing the fog's identity or
 * class is the sort of thing that provokes a material recompile -- at the worst
 * possible moment, a click on the tally screen.
 */
function applyLevelStyling(): void {
  ;(view.scene.fog as THREE.FogExp2).density = world.level.fog
}

const player = createPlayer(world.level)
const health = createHealth()
const arsenal = createArsenal()
const screen = new ScreenLayer(world.level)
const keys = new Set<string>()

const session = createSession(world.level, world.live.length, world.pickups.length)
const store = browserStorage()

// Applied before anything can make a sound. `setMusicVolume` remembers the
// value even though the synths do not exist until the first click.
const settings = loadSettings(store)
setMusicVolume(settings.musicVolume)
let tally: Tally | null = null
/**
 * What the click on the finished tally will do.
 *
 * Decided once, in `completeLevel`, rather than recomputed in the render path
 * -- after `advance()` the world has already moved on, so asking "what comes
 * after the current level" on the way out would answer for the wrong one and
 * the caption and the click could disagree.
 */
let after: Onward | null = null

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
  // Same order as the use key: exit first, doors after.
  if (atExit(world.level, player.x, player.z)) {
    return { text: 'PRESS E TO FINISH THE LEVEL', colour: LIME_TEXT }
  }
  const hint = useHint(world.level, world.doors, player.x, player.z, player.yaw, keys)
  if (hint.kind === 'open') return { text: 'PRESS E TO OPEN', colour: LIME_TEXT }
  if (hint.kind === 'locked') {
    return { text: `${hint.key.toUpperCase()} KEYCARD REQUIRED`, colour: LOCKED_TEXT }
  }
  return { text: '', colour: '' }
}

const input = new Input(canvas, () => {
  overlay?.classList.add('hidden')
  // Order matters: the context has to exist before anything can be scheduled
  // on it, and both hang off the same gesture because a browser will not give
  // you an AudioContext without one.
  unlockAudio()
  startMusic(world.level.music)
})

const deathScreen = document.querySelector<HTMLElement>('#dead')

/**
 * The part of starting a level that is the same whether you just died on it or
 * just walked into the one before.
 *
 * Factored out because "restart forgot to reset X" is the bug this whole area
 * invites, and there are now two callers to forget in. It runs AFTER the world
 * is in place, so the session counts the creatures and items of the level being
 * started rather than the one being left -- get that backwards and the tally
 * divides by the previous level's totals and reports 300% kills.
 */
function beginLevel(): void {
  Object.assign(player, createPlayer(world.level))

  globs.clear()
  notice = { text: '', colour: '' }
  noticeTimer = 0
  snarlTimer = 0
  itemClock = 0
  previousYaw = player.yaw
  lastPhase = arsenal.phase

  Object.assign(session, createSession(world.level, world.live.length, world.pickups.length))
  tally = null
  after = null
  screen.hideTally()
  deathScreen?.classList.add('hidden')
}

/**
 * Put everything back for another go on the level you are already on.
 *
 * A full reset rather than a page reload: reloading rebuilds the level meshes
 * and regenerates every texture, which is a visible pause for something that
 * should be instant. The `World` is reused, which is why the resets below are
 * resets rather than rebuilds.
 */
function restart(): void {
  Object.assign(health, createHealth())
  // Back to the Salt Shaker and nothing else. Keeping the Grinder across a
  // death would make the first run the only one that has to find it -- and it
  // is what makes every level have to be beatable from a Salt Shaker start.
  Object.assign(arsenal, createArsenal())
  keys.clear()

  respawnEnemies(world)
  resetPickups(world.pickups)
  resetExplored(world.explored)
  world.charted = 0
  screen.clearMinimap()
  // `cell.open` outlives a restart because the Level object is reused -- that
  // is the whole reason this is not a page reload. Without resetDoors the
  // second run starts with every door already standing open.
  resetDoors(world.doors, world.level)
  world.doorViews.sync(world.doors, world.level)

  beginLevel()
}

/**
 * Move on to the next level.
 *
 * Parsed BEFORE anything is torn down, so a malformed level throws with the
 * current one still standing and playable rather than leaving the loop running
 * against an empty scene.
 *
 * Everything sized from the level is rebuilt rather than reset: `Explored` is
 * allocated width*height and `Minimap` sizes its canvas the same way, so
 * reusing either across differently shaped levels indexes with the wrong stride
 * and draws a sheared map -- silently, because out-of-range cells are dropped
 * rather than throwing.
 */
function advance(next: LevelSource): void {
  const level = parseLevel(next)
  unloadWorld(world, view.scene)
  world = loadWorld(level, view.scene)
  applyLevelStyling()

  carryInto(health, arsenal, keys)
  screen.setLevel(world.level)
  // No-ops when two levels share a track, so the tune plays through the seam
  // rather than restarting at the top of every map.
  startMusic(world.level.music)

  beginLevel()
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
  // The record is written here, before the world can move on, so it can only
  // ever land under the id of the level that was actually played.
  const records = loadRecords(store)
  const result = recordTime(records, world.level.id, session.elapsed)
  if (result.improved) saveRecords(store, records)
  tally = createTally(session, result.previous ?? result.best, result.improved)
  after = onward(world.level.id)
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

/** One pellet's worth of damage, held back so a volley lands as a single hit. */
interface PelletHit {
  target: Enemy
  damage: number
  /** What the armour let through, 1 for a clean hit. */
  shield: number
}

function shootPellet(angleOffset: number): PelletHit | null {
  // Destructured because a pellet cannot outlive the world it was fired in --
  // nothing between here and the return can swap levels -- and because the
  // scale factor appears a dozen times below.
  const { level, space, s, live } = world
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
    // Armour is applied at the shot rather than inside `damage`, because it
    // is the only rule here that depends on where the shot came FROM -- and
    // the mind has no idea where the player is standing.
    const shield = armourScale(struck.target, player.x, player.z)
    const dealt = damageAtRange(def, struck.distance / s) * shield

    const hx = muzzleX + dir.x * struck.distance
    const hy = muzzleY + dir.y * struck.distance
    const hz = muzzleZ + dir.z * struck.distance
    tracers.emitShot(muzzleX, muzzleY, muzzleZ, hx, hy, hz, rng)
    tracers.emitImpact(hx, hy, hz, -dir.x, -dir.z, rng)

    // Damage is NOT applied here. See `resolveVolley`.
    return { target: struck.target, damage: dealt, shield }
  }

  tracers.emitShot(muzzleX, muzzleY, muzzleZ, endX, endY, endZ, rng)

  if (end.stoppedBy !== 'range') {
    // Scatter off whatever was actually hit, using that surface's normal.
    const nx = end.stoppedBy === 'wall' && wallHit ? wallHit.normalX : 0
    const nz = end.stoppedBy === 'wall' && wallHit ? wallHit.normalZ : 0
    tracers.emitImpact(endX, endY, endZ, nx, nz, rng)
    playImpact()
  }
  return null
}

/**
 * Fire every pellet, then apply each creature's total as ONE hit.
 *
 * Per-pellet application made a shotgun blast eight separate events, which was
 * wrong three ways. `gibThreshold` became unreachable: the largest single
 * instance in the game is a 12-point Salt Shaker shot at the muzzle, and no
 * threshold in the roster is anywhere near that low, so `mind.gibbed` could
 * never be true and `playGib` was dead code. It rolled the pain chance eight
 * times, making a Grinder blast a near-guaranteed stagger and feeding the loop
 * that left the roster unable to fight back. And it stacked eight squelches
 * into mud.
 *
 * A volley is one hit from the creature's point of view, so it is one call.
 *
 * `shield` is taken from the first pellet to land and not re-read, because
 * `armourScale` measures from the PLAYER's position rather than each pellet's
 * -- every pellet in a volley therefore hits the same plating from the same
 * side, and averaging them would only reintroduce rounding.
 */
function resolveVolley(angles: number[]): void {
  const totals = new Map<Enemy, { damage: number; shield: number }>()
  for (const angle of angles) {
    const hit = shootPellet(angle)
    if (!hit) continue
    const seen = totals.get(hit.target)
    if (seen) seen.damage += hit.damage
    else totals.set(hit.target, { damage: hit.damage, shield: hit.shield })
  }

  for (const [enemy, total] of totals) {
    const wasAlive = isAlive(enemy.mind)
    damageEnemy(enemy.mind, enemy.def, total.damage, rng)

    if (wasAlive && enemy.mind.justDied) {
      if (enemy.mind.gibbed) playGib()
      else playSquelch(rng())
    } else if (total.shield < 1) {
      // A ricochet, not a squelch. A creature soaking nine tenths of every
      // shot while still sounding wet reads as a broken weapon rather than as
      // armour, and the player never works out to go round it.
      playRicochet()
    } else {
      playSquelch(rng() * 0.5)
    }
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
        const press = pressTally(tally)
        if (press === 'snap') snapTally(tally)
        else if (press === 'restart') {
          // Straight out. Both branches null `tally`, and TypeScript does not
          // un-narrow a module-level `let` across a call -- so everything
          // below here still believes it holds a tally and would hand null to
          // the intermission, which sets itself visible before it reads it.
          //
          // `after` was decided at the exit, not here, so the caption the
          // player just read and the thing this does cannot disagree.
          if (after?.kind === 'advance') advance(after.next)
          else restart()
          return
        }
      }

      screen.showTally(world.level.name, tally, after?.kind === 'advance' ? after.next.name : null)
      screen.update(health, arsenal, keys, 'neutral', { text: '', colour: '' })
      // Doors keep moving so a leaf caught mid-rise is not frozen behind the
      // tally, and the enemies are deliberately left where they stood.
      tickDoors(world.doors, world.level, dt)
      world.doorViews.sync(world.doors, world.level)
      return
    }

    tickRun(session, dt)

    const before = { x: player.x, z: player.z }
    // Live slugs only -- corpses are scenery you walk over.
    const blockers: Disc[] = targetable(world.live.map((l) => l.enemy)).map((e) => ({
      x: e.x,
      z: e.z,
      radius: e.def.radius,
    }))
    updatePlayer(player, world.level, input, dt, blockers)
    const moving = Math.hypot(player.x - before.x, player.z - before.z) > 1e-5

    // Collected where the player ACTUALLY ended up, after walls and slugs have
    // had their say -- testing the position they asked for would let you grab
    // an item through a door you were standing against.
    for (const item of pickupsTouching(world.pickups, player.x, player.z, PLAYER_RADIUS)) {
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
    if (input.consumeMute()) {
      say(toggleMusic() ? 'MUSIC ON' : 'MUSIC OFF', LIME_TEXT)
    }

    const notches = input.consumeVolume()
    if (notches !== 0) {
      // One notch per frame at most, so a held key slides at a readable rate
      // rather than crossing the whole range in three frames of key repeat.
      const next = stepVolume(musicVolume(), notches > 0 ? 1 : -1)
      setMusicVolume(next)
      settings.musicVolume = next
      saveSettings(store, settings)
      say(`MUSIC ${volumePercent(next)}%`, LIME_TEXT)
    }

    if (input.consumeUse()) {
      // The exit wins, and standing on it is the whole test -- no aiming. It
      // is checked with the same `atExit` the prompt uses, in the same order,
      // so the line under the crosshair cannot offer something use will not
      // do. Anywhere else, use belongs to the doors.
      if (atExit(world.level, player.x, player.z)) {
        completeLevel()
        return
      }

      const target = useTarget(world.level, player.x, player.z, player.yaw)
      const result = target
        ? tryOpen(world.doors, target.x, target.z, keys)
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

    tickDoors(world.doors, world.level, dt)

    for (const slot of input.consumeSlots()) selectSlot(arsenal, slot)
    const wheel = input.consumeWheel()
    if (wheel !== 0) cycleWeapon(arsenal, wheel > 0 ? 1 : -1)

    if (input.isDown('fire')) {
      const result = fire(arsenal, rng)
      if (result.fired) {
        resolveVolley(result.angles!)
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

    for (const entry of world.live) {
      updateEnemy(entry.enemy, world.level, player.x, player.z, dt, PLAYER_RADIUS)
      const nowIdle = entry.enemy.mind.state === 'idle'
      if (entry.wasIdle && !nowIdle) playAlert(rng())
      entry.wasIdle = nowIdle
      // `justDied` is already a one-tick flag, so no edge tracking needed.
      if (entry.enemy.mind.justDied) {
        session.kills++
        // Whatever it was carrying goes off where it stood. Checked here
        // rather than at the shot, because a slug can also be killed by
        // another slug's burst -- and a chain reaction is the point of them.
        const blast = burstDamage(entry.enemy, player.x, player.z)
        if (blast > 0) {
          const result = damagePlayer(health, blast)
          if (result.died) playDeath()
          else if (result.applied) playHurt(rng())
        }

        // The other half of that comment, which was never actually written:
        // the burst caught the player and nothing else, so two Slimebloats
        // side by side did not chain.
        burstChain(
          entry.enemy,
          world.live.map((l) => l.enemy),
          rng,
        )
        if (entry.enemy.def.deathBurst) {
          tracers.emitImpact(
            entry.enemy.x * world.s,
            world.space.eyeY(entry.enemy.def.height * 0.5),
            entry.enemy.z * world.s,
            0,
            0,
            rng,
          )
          playSplat()
        }
      }

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
            entry.enemy.def.height * world.level.wallHeight * 0.8,
            player.x,
            player.z,
            world.space.eyeY(EYE_HEIGHT) - 0.35,
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
      world.live.map((l) => l.enemy),
      world.level,
    )

    for (const outcome of globs.step(
      world.level,
      dt,
      player.x,
      player.z,
      PLAYER_RADIUS,
      world.level.wallHeight,
      world.space.floorY,
      // A little above the eye, so a glob aimed at your face connects rather
      // than clipping past the top of the hitbox.
      world.space.eyeY(EYE_HEIGHT + player.eyeOffset) + 0.25,
    )) {
      const worldX = outcome.kind === 'none' ? 0 : outcome.x * world.s
      const worldZ = outcome.kind === 'none' ? 0 : outcome.z * world.s
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

    for (const entry of world.live)
      poseEnemy(entry.view, entry.enemy, world.s, world.level.wallHeight, dt)

    // One clock for every item, so a room full of them pulses together rather
    // than each bobbing on its own phase.
    itemClock += dt
    for (let i = 0; i < world.pickups.length; i++) {
      posePickup(world.pickupViews[i], world.pickups[i], world.s, world.level.wallHeight, itemClock)
    }
    world.doorViews.sync(world.doors, world.level)
    world.exitViews.update(dt)

    // After the doors, so a door opened this frame charts what it opened onto
    // rather than waiting for the player to take another step.
    world.charted += revealFrom(world.level, world.explored, player.x, player.z)
    screen.updateMinimap(world.level, world.explored, player.x, player.z, player.yaw, world.charted)

    tickHealth(health, dt)
    snarlTimer = Math.max(0, snarlTimer - dt)
    noticeTimer = Math.max(0, noticeTimer - dt)
    if (noticeTimer === 0 && notice.text !== '') notice = { text: '', colour: '' }
    screen.update(health, arsenal, keys, expressionNow(), notice, promptNow())
    previousYaw = player.yaw
    viewmodel.update(arsenal, dt, player.bobPhase, moving)
    tracers.update(dt)
    globRenderer.sync(globs, world.s)
  },

  render() {
    const eyeY = world.space.eyeY(EYE_HEIGHT + player.eyeOffset)
    view.camera.position.set(player.x * world.s, eyeY, player.z * world.s)
    view.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')
    lantern.position.copy(view.camera.position)
    view.render(viewmodel, screen)
  },
}).start()
