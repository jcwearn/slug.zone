import { describe, expect, it } from 'vitest'
import { parseLevel } from '../level.ts'
import { hasLineOfSight } from '../../engine/collision.ts'
import e1m1 from './e1m1.ts'

/**
 * While the enemies are deliberately clustered at the spawn for playtesting,
 * "near the start" has to mean visible from it -- not merely close in grid
 * distance.
 *
 * The check that was missing: a grub placed on open, reachable ground passed
 * every existing assertion while sitting behind a wall in a corridor you cannot
 * see into, so only three of four ever appeared. Reachable is not findable.
 */
describe('e1m1 starting encounter', () => {
  const level = parseLevel(e1m1)
  const start = level.playerStart
  const enemies = level.entities.filter((e) => e.type !== 'pickup')

  it('has enemies to fight', () => {
    expect(enemies.length).toBeGreaterThanOrEqual(4)
  })

  it('does not spawn the player facing a wall', () => {
    // angle 0 faces -z, which from this corner is the north wall one cell away.
    const ahead = { x: start.x - Math.sin(start.angle), z: start.z - Math.cos(start.angle) }
    expect(hasLineOfSight(level, start.x, start.z, ahead.x, ahead.z)).toBe(true)
    const cell = level.cells[Math.floor(ahead.z) * level.width + Math.floor(ahead.x)]
    expect(cell?.floor ?? cell?.exit, 'the cell directly ahead of spawn').toBeTruthy()
  })

  it('puts at least one enemy in the direction the player is facing', () => {
    const fx = -Math.sin(start.angle)
    const fz = -Math.cos(start.angle)
    const ahead = enemies.filter((e) => {
      const dx = e.x - start.x
      const dz = e.z - start.z
      const len = Math.hypot(dx, dz)
      return len > 0 && (dx / len) * fx + (dz / len) * fz > 0.7
    })
    expect(ahead.length, 'enemies in front of the player at spawn').toBeGreaterThan(0)
  })

  it.each(enemies.map((e, i) => [`${e.type} #${i}`, e] as const))(
    '%s is visible from the player start',
    (_label, enemy) => {
      expect(hasLineOfSight(level, start.x, start.z, enemy.x, enemy.z)).toBe(true)
    },
  )

  it.each(enemies.map((e, i) => [`${e.type} #${i}`, e] as const))(
    '%s is close enough to walk to immediately',
    (_label, enemy) => {
      expect(Math.hypot(enemy.x - start.x, enemy.z - start.z)).toBeLessThan(10)
    },
  )
})
