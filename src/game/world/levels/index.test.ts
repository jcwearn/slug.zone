import { describe, expect, it } from 'vitest'
import { LEVELS, levelById, levelIndex, nextLevel } from './index.ts'

describe('the level registry', () => {
  it('holds the episode in order', () => {
    expect(LEVELS.length).toBeGreaterThan(0)
    expect(LEVELS[0].id).toBe('e1m1')
  })

  it('finds a level by id', () => {
    for (const level of LEVELS) expect(levelById(level.id)).toBe(level)
  })

  it('reports an unknown id as absent rather than as the first level', () => {
    // `LEVELS[-1]` is undefined, but `LEVELS[levelIndex(id)]` with a bare
    // findIndex result is the kind of thing that quietly becomes LEVELS[0].
    expect(levelIndex('nonsense')).toBe(-1)
    expect(levelById('nonsense')).toBeUndefined()
  })

  it('advances to the next level in the array', () => {
    for (let i = 0; i < LEVELS.length - 1; i++) {
      expect(nextLevel(LEVELS[i].id)).toBe(LEVELS[i + 1])
    }
  })

  it('ends the episode at the last level', () => {
    expect(nextLevel(LEVELS[LEVELS.length - 1].id)).toBeNull()
  })

  it('does not throw on an unknown id', () => {
    // Read on the intermission screen, the one moment the player has just won
    // something. `save/scores.ts` sets the same precedent.
    expect(nextLevel('nonsense')).toBeNull()
  })
})
