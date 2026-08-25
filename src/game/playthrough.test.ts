import { appendFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PLAYER_RADIUS, hasLineOfSight, type Disc } from './engine/collision.ts'
import { mulberry32 } from './engine/math.ts'
import type { Action } from './engine/input.ts'
import { cellAt, parseLevel, type Level } from './world/level.ts'
import { LEVELS } from './world/levels/index.ts'
import { buildDoors, tickDoors, tryOpen, useTarget } from './world/doors.ts'
import { worldSpace } from './world/space.ts'
import { createPlayer, EYE_HEIGHT, updatePlayer } from './player/controller.ts'
import { createHealth, damagePlayer, tickHealth } from './player/health.ts'
import { collect, createPickups, pickupsTouching, type Pickup } from './pickups/pickups.ts'
import { createArsenal, damageAtRange, fire, tickArsenal } from './weapons/arsenal.ts'
import { aimDirection } from './player/aim.ts'
import {
  armourScale,
  burstChain,
  burstDamage,
  enemyCylinder,
  separateEnemies,
  spawnEnemy,
  targetable,
  updateEnemy,
  type Enemy,
} from './enemies/enemy.ts'
import { damage as damageEnemy } from './enemies/fsm.ts'
import { nearestHit, verticalAutoAim } from './enemies/hitscan.ts'
import { Globs } from './enemies/projectiles.ts'
import { atExit, createSession, tickRun } from './session.ts'

/**
 * Play each level to the exit, headlessly, through the real systems.
 *
 * Every other level check in this repo reasons about the GRID: flood fills,
 * adjacency, whether a cell is solid. This one moves a body through the level
 * with the real swept collision, opens the real doors, and lets the real
 * creatures hit back. The two are not the same question. A flood fill says the
 * exit is reachable; it cannot say a doorway is wide enough for a body with a
 * radius, that a corridor is not permanently corked by something standing in
 * it, or that a key can actually be walked to and picked up.
 *
 * It is also the only difficulty measurement available. Nothing in this game
 * has been played in a browser since G5, so "is this level survivable" has
 * been a matter of opinion. A bot with perfect aim and no nerves is not a
 * player, and the damage it takes is a floor rather than an estimate -- but a
 * floor that moves when a level is retuned is worth more than nothing.
 *
 * No rendering, so no canvas: geometry and textures are never built.
 *
 * What this does NOT cover: it MIRRORS main.ts's tick order rather than calling
 * it, so reordering main.ts will not fail anything here. That is how the bug
 * below got in, and the mirror is why it was found -- writing the order out a
 * second time is what made the first one look wrong. `fsm.test.ts` pins the
 * flag lifetime that forces the order; the order itself is still read, not
 * tested.
 */

const STEP = 1 / 60
/** Give up rather than hang if the bot cannot finish. */
const TIME_LIMIT = 600

/** Yaw that points from (fromX,fromZ) at (toX,toZ), player convention. */
const facing = (fromX: number, fromZ: number, toX: number, toZ: number) =>
  Math.atan2(-(toX - fromX), -(toZ - fromZ))

/** Can a body walk into this cell, given the keys it holds? */
function passable(level: Level, index: number, keys: ReadonlySet<string>): boolean {
  const x = index % level.width
  const z = Math.floor(index / level.width)
  const cell = cellAt(level, x, z)
  if (!cell) return false
  if (cell.floor ?? cell.exit) return true
  if (cell.door) return cell.door.key === null || keys.has(cell.door.key)
  return false
}

/** Shortest cell path to the nearest cell satisfying `isGoal`, or null. */
function route(
  level: Level,
  from: number,
  isGoal: (index: number) => boolean,
  keys: ReadonlySet<string>,
): number[] | null {
  const previous = new Map<number, number>([[from, -1]])
  const queue = [from]
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    if (isGoal(index) && index !== from) {
      const path: number[] = []
      for (let at = index; at !== -1; at = previous.get(at)!) path.push(at)
      return path.reverse()
    }
    const x = index % level.width
    const z = Math.floor(index / level.width)
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nz < 0 || nx >= level.width || nz >= level.height) continue
      const next = nz * level.width + nx
      if (previous.has(next) || !passable(level, next, keys)) continue
      previous.set(next, index)
      queue.push(next)
    }
  }
  return null
}

interface Report {
  finished: boolean
  seconds: number
  kills: number
  killsTotal: number
  /** Health and armour lost over the run. */
  damageTaken: number
  died: boolean
}

function play(source: (typeof LEVELS)[number]): Report {
  const level = parseLevel(source)
  const space = worldSpace(level)
  const s = level.cellSize
  const rng = mulberry32(7)

  const player = createPlayer(level)
  const health = createHealth()
  const arsenal = createArsenal()
  const keys = new Set<string>()
  const doors = buildDoors(level)
  const pickups: Pickup[] = createPickups(level)
  const globs = new Globs()

  const live: Enemy[] = level.entities
    .filter((e) => e.type !== 'pickup')
    .map((e) => spawnEnemy(e.type, e.x, e.z))
  const session = createSession(level, live.length, pickups.length)

  const held = new Set<Action>()
  const input = {
    isDown: (a: Action) => held.has(a),
    consumeLook: () => ({ yaw: 0, pitch: 0 }),
  }

  const cellOf = (x: number, z: number) => Math.floor(z) * level.width + Math.floor(x)
  const keyItems = new Map(
    pickups.map((p, i) => [i, /^(red|blue|yellow)key$/.exec(p.def.id)?.[1] ?? null]),
  )

  let damageTaken = 0
  let path: number[] = []
  let leg = 0
  let t = 0
  let replan = 0
  /** Recent positions, to notice being wedged against something. */
  const recent: { x: number; z: number }[] = []
  let circling: Action = 'left'
  let circleFor = 0

  while (t < TIME_LIMIT && !health.dead) {
    // --- decide where to go ---
    if (replan <= 0 || leg >= path.length) {
      const from = cellOf(player.x, player.z)
      // The exit if it can be reached with what is held; otherwise the nearest
      // key that can be, which is the same fixed point `reachableFromStart`
      // runs -- only walked rather than flooded.
      const toExit = route(
        level,
        from,
        (i) => Boolean(cellAt(level, i % level.width, Math.floor(i / level.width))?.exit),
        keys,
      )
      const wanted =
        toExit ??
        route(
          level,
          from,
          (i) => pickups.some((p, idx) => !p.taken && keyItems.get(idx) && cellOf(p.x, p.z) === i),
          keys,
        )
      path = wanted ?? []
      leg = 1
      replan = 90
    }
    replan--

    held.delete('forward')
    held.delete('run')

    // --- shoot whatever is in the way ---
    const alive = targetable(live)
    const threat = alive
      .filter((e) => hasLineOfSight(level, player.x, player.z, e.x, e.z))
      .filter((e) => Math.hypot(e.x - player.x, e.z - player.z) < 12)
      .sort(
        (a, b) =>
          Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z),
      )[0]

    // Wedged? The player is BLOCKED by creatures rather than pushing through
    // them, so walking at one just stops. Standing there is how the bot lost a
    // level to a single Shellback: it stood at arm's length plinking at an
    // armoured front for nine seconds while everything else in the room ate
    // it. Circling is the answer to both a cork and a shield, and it is the
    // answer a player would reach for immediately -- a bot that cannot do it
    // measures its own blind spot rather than the level.
    recent.push({ x: player.x, z: player.z })
    if (recent.length > 30) recent.shift()
    const wedged =
      recent.length === 30 && Math.hypot(player.x - recent[0].x, player.z - recent[0].z) < 0.15

    held.delete('left')
    held.delete('right')
    if (wedged) {
      if (circleFor <= 0) {
        circling = circling === 'left' ? 'right' : 'left'
        circleFor = 60
      }
      circleFor--
      held.add(circling)
      held.delete('forward')
    } else {
      circleFor = 0
    }

    if (threat) {
      // Face it and fire. Perfect aim, which is why the damage this bot takes
      // is a floor on what a level costs rather than an estimate of it.
      //
      // The PITCH matters as much as the yaw. A Grub tops out at 1.4 world
      // units against an eye at 2.2, and close up the angle down to it falls
      // outside the 0.25 rad autoaim cone -- so a bot that only ever aimed
      // level could not hit the most common creature in the game at the range
      // it attacks from. It landed no shots at all until this was here.
      player.yaw = facing(player.x, player.z, threat.x, threat.z)
      const flat = Math.hypot(threat.x - player.x, threat.z - player.z) * s
      const midY = (threat.def.height * level.wallHeight) / 2
      player.pitch = Math.atan2(midY - space.eyeY(EYE_HEIGHT), Math.max(flat, 1e-6))
      const result = fire(arsenal, rng)
      if (result.fired) {
        const targets = alive.map((enemy) => ({
          target: enemy,
          cylinder: enemyCylinder(enemy, s, level.wallHeight),
        }))
        const eyeY = space.eyeY(EYE_HEIGHT)
        const totals = new Map<Enemy, { damage: number; shield: number }>()
        for (const offset of result.angles!) {
          const raw = aimDirection(player.yaw + offset, player.pitch)
          const dir = verticalAutoAim(
            player.x * s,
            eyeY,
            player.z * s,
            raw.x,
            raw.y,
            raw.z,
            targets,
            result.def!.range * s,
            0.25,
          )
          const hit = nearestHit(
            player.x * s,
            eyeY,
            player.z * s,
            dir.x,
            dir.y,
            dir.z,
            targets,
            result.def!.range * s,
          )
          if (!hit) continue
          const shield = armourScale(hit.target, player.x, player.z)
          const dealt = damageAtRange(result.def!, hit.distance / s) * shield
          const seen = totals.get(hit.target)
          if (seen) seen.damage += dealt
          else totals.set(hit.target, { damage: dealt, shield })
        }
        for (const [enemy, total] of totals) damageEnemy(enemy.mind, enemy.def, total.damage, rng)
      }
    }

    // --- steer along the path ---
    //
    // AFTER the shot, deliberately. Movement is relative to yaw, so a bot that
    // aimed and then walked would walk at whatever it was shooting -- closing
    // to melee with Shellbacks and standing inside Slimebloats, which is how
    // it lost this level three times over. Aiming is a thing you do for the
    // instant of the shot; where you are going is a separate question, and a
    // player answers both at once by snapping the mouse and letting go.
    if (leg < path.length) {
      const target = path[leg]
      const tx = (target % level.width) + 0.5
      const tz = Math.floor(target / level.width) + 0.5
      if (Math.hypot(tx - player.x, tz - player.z) < 0.35) leg++
      else {
        player.yaw = facing(player.x, player.z, tx, tz)
        if (!wedged) {
          held.add('forward')
          // Sprint between fights, walk inside them -- which is what a person
          // does, and both halves matter. A bot that never ran could not shed
          // anything it had provoked, because a walk is 2.6 and a Grub is 2.4:
          // it towed a train around E1M4's ring and arrived at the last fight
          // with eight creatures on it. A bot that always ran charged into the
          // middle of rooms and was surrounded before it had killed anything.
          if (!threat) held.add('run')
        }
      }
    }

    // --- open whatever is shut ---
    const ahead = useTarget(level, player.x, player.z, player.yaw)
    if (ahead) tryOpen(doors, ahead.x, ahead.z, keys)

    // --- the world moves ---
    tickDoors(doors, level, STEP)
    const blockers: Disc[] = targetable(live).map((e) => ({ x: e.x, z: e.z, radius: e.def.radius }))
    updatePlayer(player, level, input, STEP, blockers)

    for (const item of pickupsTouching(pickups, player.x, player.z, PLAYER_RADIUS)) {
      if (collect(item.def, { health, arsenal, keys }).taken) {
        item.taken = true
        session.items++
        // A key changes what is reachable, so the plan is now stale.
        replan = 0
      }
    }

    const before = health.hp + health.armour
    for (const enemy of live) {
      // Same order as main.ts, and for the same reason: `step` clears
      // `justDied` at the top of the tick and the shots above landed earlier
      // in this one.
      if (enemy.mind.justDied) {
        session.kills++
        const blast = burstDamage(enemy, player.x, player.z)
        if (blast > 0) damagePlayer(health, blast)
        burstChain(enemy, live, rng)
      }
      updateEnemy(enemy, level, player.x, player.z, STEP, PLAYER_RADIUS)

      if (enemy.mind.didStrike) {
        const ranged = enemy.def.projectile
        if (ranged) {
          const glob = globs.spawn(
            enemy.x,
            enemy.z,
            enemy.def.height * level.wallHeight * 0.8,
            player.x,
            player.z,
            space.eyeY(EYE_HEIGHT) - 0.35,
            ranged.speed,
            enemy.def.damage,
          )
          if (glob) glob.radius = ranged.radius
        } else {
          damagePlayer(health, enemy.def.damage)
        }
      }
    }
    separateEnemies(live, level)

    for (const outcome of globs.step(
      level,
      STEP,
      player.x,
      player.z,
      PLAYER_RADIUS,
      level.wallHeight,
      space.floorY,
      space.eyeY(EYE_HEIGHT) + 0.25,
    )) {
      if (outcome.kind === 'hit') damagePlayer(health, outcome.damage)
    }
    damageTaken += Math.max(0, before - (health.hp + health.armour))

    tickArsenal(arsenal, STEP)
    tickHealth(health, STEP)
    tickRun(session, STEP)
    t += STEP

    if (atExit(level, player.x, player.z)) {
      return {
        finished: true,
        seconds: t,
        kills: session.kills,
        killsTotal: live.length,
        damageTaken,
        died: false,
      }
    }
  }

  return {
    finished: false,
    seconds: t,
    kills: session.kills,
    killsTotal: live.length,
    damageTaken,
    died: health.dead,
  }
}

describe('a headless playthrough', () => {
  const played = LEVELS.map((source) => [source.id, play(source)] as const)

  // Set PLAY_OUT to a path to dump what the bot did. This is the instrument a
  // level gets tuned against -- E1M3 was moved three times on the strength of
  // it -- and it is quiet unless asked, so it costs a normal run nothing.
  if (process.env.PLAY_OUT) {
    appendFileSync(
      process.env.PLAY_OUT,
      played
        .map(
          ([id, r]) =>
            `${id}: finished=${r.finished} died=${r.died} t=${r.seconds.toFixed(1)}s kills=${r.kills}/${r.killsTotal} damage=${r.damageTaken.toFixed(0)}`,
        )
        .join('\n') + '\n',
    )
  }

  it.each(played)('%s can be walked from the spawn to the exit', (_id, report) => {
    // Not a flood fill. A body with a radius, moving under the real swept
    // collision, through doors it has to find the keys for.
    expect(report.finished, `bot stalled after ${report.seconds.toFixed(0)}s`).toBe(true)
  })

  it.each(played)('%s does not trap the player behind its own creatures', (_id, report) => {
    // The player is BLOCKED by creatures rather than pushing through them, so
    // something standing in a one-cell corridor is a cork. The bot shoots what
    // it can see, so reaching the exit at all is the proof.
    expect(report.died).toBe(false)
  })

  it.each(played)('%s lets its creatures actually be killed', (_id, report) => {
    // This is the regression test for a bug the bot found on its first run.
    // `step` clears `justDied` at the top of every tick, and the loop read it
    // AFTER stepping -- while the player's shots land earlier in the same tick.
    // Every creature the player shot therefore died unobserved: the kill
    // counter never left zero, the intermission always read KILLS 0%, and no
    // Slimebloat ever burst. Nothing had been played since G5, so nothing had
    // noticed.
    expect(report.kills, 'nothing died, or nothing noticed').toBeGreaterThan(0)
  })

  it.each(played)('%s costs a bot with perfect aim something to cross', (_id, report) => {
    // The floor under "is this level a fight". A bot that never turns, never
    // panics and never misses should still not walk it untouched -- if it can,
    // no human is going to find it dangerous either.
    expect(report.damageTaken, 'a bot crossed this level without being hit').toBeGreaterThan(0)
  })

  it('gets harder as the episode goes on', () => {
    // The only difficulty measurement there is, and a weak one -- it is the
    // cost to a bot rather than to a person. It is held anyway because the
    // direction is not in question even if the numbers are: a level later in
    // the episode that costs LESS than an earlier one is either mis-ordered or
    // under-populated, and both are worth being told about.
    //
    // Compared against the first level rather than pairwise, so reordering two
    // levels of similar weight does not fail it for no reason.
    const first = played[0][1].damageTaken
    const last = played[played.length - 1][1].damageTaken
    expect(last, 'the episode does not escalate').toBeGreaterThan(first)
  })
})
