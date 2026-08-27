import { describe, expect, it } from 'vitest'
import { carryInto, onward, outroFor } from './campaign.ts'
import { LEVELS } from './world/levels/index.ts'
import { createHealth } from './player/health.ts'
import { createArsenal } from './weapons/arsenal.ts'

describe('onward', () => {
  it('advances while there is another level', () => {
    const result = onward(LEVELS[0].id)
    expect(result.kind).toBe('advance')
    if (result.kind === 'advance') expect(result.next).toBe(LEVELS[1])
  })

  it('ends the episode after the last level', () => {
    expect(onward(LEVELS[LEVELS.length - 1].id).kind).toBe('finished')
  })

  it('replays rather than throwing on an unknown level', () => {
    // Not 'finished'. Finishing the last level is an ending; finishing a level
    // the registry has never heard of is a bug, and showing the player an
    // ending for it would hide that.
    expect(onward('nonsense').kind).toBe('replay')
  })
})

describe('outroFor', () => {
  it('offers the next level by name', () => {
    expect(outroFor(onward(LEVELS[0].id))).toEqual({ kind: 'next', name: LEVELS[1].name })
  })

  it('offers an ending after the last level', () => {
    expect(outroFor(onward(LEVELS[LEVELS.length - 1].id))).toEqual({ kind: 'finished' })
  })

  it('offers a replay for a level the registry does not know', () => {
    expect(outroFor(onward('nonsense'))).toEqual({ kind: 'replay' })
  })

  it('offers a replay when there is nothing to go on at all', () => {
    // The screen asks before the level has finished, every frame it is up.
    expect(outroFor(null)).toEqual({ kind: 'replay' })
  })
})

describe('carryInto', () => {
  /** A player mid-level: hurt, armoured, holding the shotgun and a keycard. */
  const inProgress = () => {
    const health = createHealth()
    health.hp = 43
    health.armour = 27
    health.painFlash = 0.8
    health.immunity = 0.1

    const arsenal = createArsenal()
    arsenal.owned.add('grinder')
    arsenal.ammo.coarse = 31
    arsenal.current = 'grinder'
    arsenal.pending = 'saltshaker'
    arsenal.phase = 'lowering'
    arsenal.timer = 0.09
    arsenal.cooldown = 0.4

    return { health, arsenal, keys: new Set(['blue']) }
  }

  it('keeps health and armour exactly', () => {
    const { health, arsenal, keys } = inProgress()
    carryInto(health, arsenal, keys)
    expect(health.hp).toBe(43)
    expect(health.armour).toBe(27)
  })

  it('keeps the weapons and the ammo', () => {
    // Not a pistol start. Finding the Grinder once should mean having it.
    const { health, arsenal, keys } = inProgress()
    carryInto(health, arsenal, keys)
    expect(arsenal.owned.has('grinder')).toBe(true)
    expect(arsenal.ammo.coarse).toBe(31)
    expect(arsenal.current).toBe('grinder')
  })

  it('drops the keycards', () => {
    // Carrying a card forward opens a door the next level is designed around,
    // and `reachableFromStart` certifies every level assuming you arrive with
    // nothing.
    const { health, arsenal, keys } = inProgress()
    carryInto(health, arsenal, keys)
    expect(keys.size).toBe(0)
  })

  it('clears the screen flash and the immunity window', () => {
    // Otherwise the next level opens on a red screen and a free moment of
    // invulnerability.
    const { health, arsenal, keys } = inProgress()
    carryInto(health, arsenal, keys)
    expect(health.painFlash).toBe(0)
    expect(health.immunity).toBe(0)
    expect(health.dead).toBe(false)
    expect(health.justDied).toBe(false)
  })

  it('settles a weapon caught mid-switch', () => {
    // Advancing while lowering leaves the viewmodel stuck down and desyncs
    // `lastPhase`, so the switch sound fires at nothing on the next level.
    const { health, arsenal, keys } = inProgress()
    carryInto(health, arsenal, keys)
    expect(arsenal.phase).toBe('ready')
    expect(arsenal.pending).toBeNull()
    expect(arsenal.timer).toBe(0)
    expect(arsenal.cooldown).toBe(0)
  })
})
